import { Injectable, OnModuleInit } from '@nestjs/common';
import type { Tx } from '@sgee/db';
import {
  addDays,
  type ComplianceRules,
  CONSENT_TYPE_LABELS,
  type ConsentType,
  type consentTemplateSchema,
  dateInTz,
  type dsrCreateSchema,
  type dsrResolveSchema,
  type legalHoldSchema,
  type mandatoryReportSchema,
  profileFor,
} from '@sgee/shared';
import type { z } from 'zod';
import { AccessService } from '../../common/access.service';
import { AuditService } from '../../common/audit.service';
import { type AuthUser, can, hasRole, type RequestMeta } from '../../common/auth';
import { randomDigits, sha256 } from '../../common/crypto';
import { badRequest, conflict, forbidden, notFound, Problem } from '../../common/errors';
import { PrismaService } from '../../common/prisma.service';
import { personName } from '../../common/serializers';
import { TenantSettingsService } from '../../common/tenant-settings.service';
import { config } from '../../config';
import { NotifyService } from '../comms/notify.service';
import { StorageService } from '../files/storage.service';
import { JobsService } from '../jobs/jobs.service';

@Injectable()
export class ComplianceService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly notify: NotifyService,
    private readonly jobs: JobsService,
    private readonly storage: StorageService,
    private readonly settings: TenantSettingsService,
  ) {}

  onModuleInit() {
    this.jobs.register('compliance.retention', (job) => this.retention(job.tenantId!));
    this.jobs.register('compliance.access_anomalies', (job) => this.accessAnomalies(job.tenantId!));
    this.jobs.dailyAt('compliance.retention', '01:30');
    this.jobs.every('compliance.access_anomalies', 10);
  }

  private async rules(tx: Tx, tenantId: string): Promise<ComplianceRules> {
    const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const row = await tx.complianceProfile.findFirst({ where: { country: tenant.country } });
    return (row?.rules as unknown as ComplianceRules) ?? profileFor(tenant.country);
  }

  // ── profiles ─────────────────────────────────────────────────────────────
  profiles(user: AuthUser) {
    return this.prisma.forUser(user, (tx) => tx.complianceProfile.findMany({ orderBy: { country: 'asc' } }));
  }

  async activateProfile(user: AuthUser, country: string, meta: RequestMeta) {
    return this.prisma.forUser(user, async (tx) => {
      const p = await tx.complianceProfile.findFirst({ where: { country } });
      if (!p) throw notFound('Perfil de cumplimiento');
      await tx.complianceProfile.updateMany({ data: { active: false } });
      await tx.complianceProfile.update({ where: { id: p.id }, data: { active: true } });
      await tx.$executeRaw`UPDATE core.tenants SET country = ${country} WHERE id = ${user.tenantId}::uuid`;
      const rules = p.rules as unknown as ComplianceRules;
      await tx.retentionPolicy.upsert({ where: { tenantId_entity: { tenantId: user.tenantId, entity: 'clinical_record' } }, create: { tenantId: user.tenantId, entity: 'clinical_record', retentionYears: rules.clinicalRecordRetentionYears }, update: { retentionYears: rules.clinicalRecordRetentionYears } });
      await this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: 'compliance.profile_activated', entity: 'compliance_profile', entityId: p.id, after: { country }, meta });
      this.settings.invalidate(user.tenantId);
      return { active: country };
    });
  }

  async updateProfileRules(user: AuthUser, country: string, rules: Record<string, unknown>, meta: RequestMeta) {
    return this.prisma.forUser(user, async (tx) => {
      const p = await tx.complianceProfile.findFirst({ where: { country } });
      if (!p) throw notFound('Perfil de cumplimiento');
      const merged = { ...(p.rules as object), ...rules, country };
      const r = await tx.complianceProfile.update({ where: { id: p.id }, data: { rules: merged } });
      await this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: 'compliance.profile_updated', entity: 'compliance_profile', entityId: p.id, before: p.rules, after: merged, meta });
      return r;
    });
  }

  /** Legal checklist computed from live data (PLAN §15.5 "matriz legal"). */
  async checklist(user: AuthUser) {
    return this.prisma.forUser(user, async (tx) => {
      const rules = await this.rules(tx, user.tenantId);
      const settings = await this.settings.get(tx, user.tenantId);
      const [students, templates, retention, holds, openDsr, overdueDsr, reportsDue, profiles] = await Promise.all([
        tx.student.count({ where: { status: 'ACTIVE' } }),
        tx.consentTemplate.findMany({ where: { active: true, type: { in: rules.requiredConsents } } }),
        tx.retentionPolicy.findMany(),
        tx.legalHold.count({ where: { releasedAt: null } }),
        tx.dataSubjectRequest.count({ where: { status: { in: ['RECEIVED', 'IN_PROGRESS'] } } }),
        tx.dataSubjectRequest.count({ where: { status: { in: ['RECEIVED', 'IN_PROGRESS'] }, dueAt: { lt: new Date() } } }),
        tx.mandatoryReport.count({ where: { status: 'DRAFT', dueAt: { lt: new Date() } } }),
        tx.healthProfile.count({ where: { lastGuardianUpdateAt: { gte: new Date(new Date().getFullYear(), 0, 1) } } }),
      ]);
      const coverage = [];
      for (const t of templates) {
        const signed = await tx.consent.findMany({ where: { templateId: t.id, status: 'GRANTED' }, distinct: ['studentId'], select: { studentId: true } });
        coverage.push({ type: t.type, label: CONSENT_TYPE_LABELS[t.type as ConsentType], version: t.version, signed: signed.length, pct: students ? Math.round((signed.length / students) * 100) : 0 });
      }
      const clinicalRetention = retention.find((r) => r.entity === 'clinical_record');
      const items = [
        { key: 'profile', label: `Perfil legal activo: ${rules.name}`, ok: true, detail: rules.laws.slice(0, 3).join('; ') },
        { key: 'consents', label: 'Consentimientos obligatorios versionados y publicados', ok: templates.length === rules.requiredConsents.length, detail: `${templates.length}/${rules.requiredConsents.length}` },
        ...coverage.map((c) => ({ key: `consent_${c.type}`, label: `Cobertura: ${c.label} v${c.version}`, ok: c.pct >= 90, detail: `${c.pct}% (${c.signed}/${students})` })),
        { key: 'retention', label: `Retención de historia clínica ≥ ${rules.clinicalRecordRetentionYears} años`, ok: !!clinicalRetention && clinicalRetention.retentionYears >= rules.clinicalRecordRetentionYears, detail: `${clinicalRetention?.retentionYears ?? 0} años` },
        { key: 'encryption', label: 'Cifrado de datos sensibles (AES-256-GCM) y archivos', ok: true, detail: 'Notas de salud mental y adjuntos cifrados' },
        { key: 'mfa', label: 'MFA obligatorio para roles clínicos y administrativos', ok: settings.mfaEnforced, detail: settings.mfaEnforced ? 'Activo' : 'Desactivado (activar en producción)' },
        { key: 'dsr', label: `Solicitudes ARCO dentro de SLA (${rules.dsrSlaDays} días)`, ok: overdueDsr === 0, detail: `${openDsr} abiertas, ${overdueDsr} vencidas` },
        { key: 'reports', label: 'Reportes obligatorios sin vencer', ok: reportsDue === 0, detail: `${reportsDue} vencidos` },
        { key: 'annual', label: 'Actualización anual de fichas por acudientes', ok: students ? profiles / students >= 0.8 : true, detail: `${students ? Math.round((profiles / students) * 100) : 0}%` },
        { key: 'holds', label: 'Bloqueos legales vigentes registrados', ok: true, detail: `${holds}` },
      ];
      return { country: rules.country, name: rules.name, laws: rules.laws, mandatoryReports: rules.mandatoryReports, items, coverage };
    });
  }

  // ── consents ─────────────────────────────────────────────────────────────
  templates(user: AuthUser, all = false) {
    return this.prisma.forUser(user, (tx) => tx.consentTemplate.findMany({ where: all ? {} : { active: true }, orderBy: [{ type: 'asc' }, { effectiveFrom: 'desc' }] }));
  }

  async createTemplate(user: AuthUser, b: z.infer<typeof consentTemplateSchema>, meta: RequestMeta) {
    return this.prisma.forUser(user, async (tx) => {
      if (await tx.consentTemplate.findFirst({ where: { type: b.type, version: b.version } })) throw conflict('VERSION_EXISTS', 'Ya existe esa versión.');
      const previous = await tx.consentTemplate.findMany({ where: { type: b.type, active: true } });
      await tx.consentTemplate.updateMany({ where: { type: b.type, active: true }, data: { active: false } });
      const t = await tx.consentTemplate.create({ data: { tenantId: user.tenantId, ...b, effectiveFrom: new Date(b.effectiveFrom), bodyHash: sha256(b.body) } });
      // Re-consent: previous grants are superseded and guardians asked to sign again.
      const superseded = await tx.consent.findMany({ where: { templateId: { in: previous.map((p) => p.id) }, status: 'GRANTED' }, select: { studentId: true } });
      await tx.consent.updateMany({ where: { templateId: { in: previous.map((p) => p.id) }, status: 'GRANTED' }, data: { status: 'SUPERSEDED' } });
      for (const studentId of [...new Set(superseded.map((s) => s.studentId))]) {
        const s = await tx.student.findUnique({ where: { id: studentId }, include: { person: true } });
        if (s) await this.notify.notify(tx, { tenantId: user.tenantId, event: 'CONSENT_PENDING', guardiansOfStudentId: studentId, data: { studentName: personName(s.person) }, link: '/familia/consentimientos', entity: 'consent_template', entityId: t.id, dedupeKey: `reconsent:${t.id}:${studentId}` });
      }
      await this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: 'compliance.consent_template_published', entity: 'consent_template', entityId: t.id, after: { type: b.type, version: b.version, superseded: superseded.length }, meta });
      return t;
    });
  }

  async studentConsents(user: AuthUser, studentId: string) {
    return this.prisma.forUser(user, async (tx) => {
      const isParent = hasRole(user, 'PARENT') && (await this.access.childrenIds(tx, user)).includes(studentId);
      if (!isParent && !can(user, 'clinical:read', 'compliance:manage')) throw forbidden();
      const [templates, consents] = await Promise.all([
        tx.consentTemplate.findMany({ where: { active: true }, orderBy: { type: 'asc' } }),
        tx.consent.findMany({ where: { studentId }, orderBy: { signedAt: 'desc' } }),
      ]);
      return templates.map((t) => {
        const current = consents.find((c) => c.templateId === t.id && c.status === 'GRANTED');
        return { template: { id: t.id, type: t.type, title: t.title, body: t.body, version: t.version, mandatory: t.mandatory }, status: current ? 'GRANTED' : consents.some((c) => c.templateId === t.id && c.status === 'REVOKED') ? 'REVOKED' : 'PENDING', consent: current ?? null };
      });
    });
  }

  async hasConsent(tx: Tx, studentId: string, type: ConsentType) {
    const t = await tx.consentTemplate.findFirst({ where: { type, active: true } });
    if (!t) return true;
    return !!(await tx.consent.findFirst({ where: { studentId, templateId: t.id, status: 'GRANTED' } }));
  }

  async requestOtp(user: AuthUser, templateId: string, studentId: string) {
    return this.prisma.forUser(user, async (tx) => {
      if (!(await this.access.childrenIds(tx, user)).includes(studentId)) throw forbidden('Solo el acudiente puede firmar consentimientos.');
      const t = await tx.consentTemplate.findUnique({ where: { id: templateId } });
      if (!t?.active) throw notFound('Consentimiento');
      const recent = await tx.consentOtp.count({ where: { userId: user.id, createdAt: { gte: new Date(Date.now() - 10 * 60_000) } } });
      if (recent >= 5) throw new Problem(429, 'OTP_RATE_LIMITED', 'Demasiados códigos solicitados. Espere unos minutos.');
      const code = randomDigits(6);
      const otp = await tx.consentOtp.create({ data: { tenantId: user.tenantId, userId: user.id, templateId, studentId, codeHash: sha256(`${code}:${user.id}`), expiresAt: new Date(Date.now() + 10 * 60_000) } });
      await this.notify.notify(tx, { tenantId: user.tenantId, event: 'CONSENT_OTP', userIds: [user.id], data: { otp: code }, urgent: true, channels: ['IN_APP', 'EMAIL', 'SMS', 'WHATSAPP'], entity: 'consent_otp', entityId: otp.id });
      return { sent: true, expiresAt: otp.expiresAt, ...(config().DEV_EXPOSE_OTP ? { devOtp: code } : {}) };
    });
  }

  async sign(user: AuthUser, b: { templateId: string; studentId: string; otp: string }, meta: RequestMeta) {
    return this.prisma.forUser(user, async (tx) => {
      if (!(await this.access.childrenIds(tx, user)).includes(b.studentId)) throw forbidden();
      const otp = await tx.consentOtp.findFirst({ where: { userId: user.id, templateId: b.templateId, studentId: b.studentId, usedAt: null }, orderBy: { createdAt: 'desc' } });
      if (!otp || otp.expiresAt < new Date()) throw badRequest('OTP_EXPIRED', 'El código expiró. Solicite uno nuevo.');
      if (otp.attempts >= 5) throw badRequest('OTP_LOCKED', 'Demasiados intentos. Solicite un nuevo código.');
      if (otp.codeHash !== sha256(`${b.otp}:${user.id}`)) {
        await tx.consentOtp.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
        throw badRequest('OTP_INVALID', 'Código incorrecto.');
      }
      const t = await tx.consentTemplate.findUniqueOrThrow({ where: { id: b.templateId } });
      const signedAt = new Date();
      const signatureHash = sha256([t.bodyHash, t.version, b.studentId, user.id, user.personId ?? '', signedAt.toISOString(), meta.ip ?? '', meta.userAgent ?? '', otp.id].join('|'));
      await tx.consentOtp.update({ where: { id: otp.id }, data: { usedAt: signedAt } });
      await tx.consent.updateMany({ where: { studentId: b.studentId, status: 'GRANTED', template: { type: t.type } }, data: { status: 'SUPERSEDED' } });
      const consent = await tx.consent.create({ data: { tenantId: user.tenantId, templateId: t.id, studentId: b.studentId, guardianPersonId: user.personId, signedByUserId: user.id, method: 'OTP', ip: meta.ip, userAgent: meta.userAgent?.slice(0, 300), signatureHash, signedAt } });
      await this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: 'compliance.consent_signed', entity: 'consent', entityId: consent.id, after: { type: t.type, version: t.version, signatureHash }, meta });
      return consent;
    });
  }

  async revoke(user: AuthUser, id: string, reason: string, meta: RequestMeta) {
    return this.prisma.forUser(user, async (tx) => {
      const c = await tx.consent.findUnique({ where: { id } });
      if (!c) throw notFound('Consentimiento');
      const isParent = hasRole(user, 'PARENT') && (await this.access.childrenIds(tx, user)).includes(c.studentId);
      if (!isParent && !can(user, 'compliance:manage')) throw forbidden();
      if (c.status !== 'GRANTED') throw conflict('NOT_GRANTED', 'El consentimiento no está vigente.');
      const r = await tx.consent.update({ where: { id }, data: { status: 'REVOKED', revokedAt: new Date(), revokeReason: reason } });
      await this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: 'compliance.consent_revoked', entity: 'consent', entityId: id, meta });
      return r;
    });
  }

  // ── data subject requests (ARCO) ──────────────────────────────────────────
  async createDsr(user: AuthUser, b: z.infer<typeof dsrCreateSchema>, meta: RequestMeta) {
    return this.prisma.forUser(user, async (tx) => {
      if (!can(user, 'compliance:manage')) {
        const kids = await tx.student.findMany({ where: { id: { in: await this.access.childrenIds(tx, user) } }, select: { personId: true } });
        if (b.subjectPersonId !== user.personId && !kids.some((k) => k.personId === b.subjectPersonId)) throw forbidden();
      }
      const rules = await this.rules(tx, user.tenantId);
      const r = await tx.dataSubjectRequest.create({ data: { tenantId: user.tenantId, type: b.type, subjectPersonId: b.subjectPersonId, requestedByUserId: user.id, description: b.description, dueAt: new Date(Date.now() + rules.dsrSlaDays * 86400000) } });
      await this.notify.notify(tx, { tenantId: user.tenantId, event: 'MESSAGE_RECEIVED', roles: ['ADMIN', 'HEALTH_COORDINATOR'], channels: ['IN_APP'], data: { studentName: 'una solicitud de derechos (ARCO)' }, link: '/admin/cumplimiento', entity: 'dsr', entityId: r.id });
      await this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: 'compliance.dsr_created', entity: 'data_subject_request', entityId: r.id, after: { type: b.type }, meta });
      return r;
    });
  }

  async listDsr(user: AuthUser) {
    return this.prisma.forUser(user, async (tx) => {
      const rows = await tx.dataSubjectRequest.findMany({ where: can(user, 'compliance:manage') ? {} : { requestedByUserId: user.id }, orderBy: { createdAt: 'desc' } });
      const persons = await tx.person.findMany({ where: { id: { in: rows.map((r) => r.subjectPersonId) } }, select: { id: true, firstName: true, lastName: true } });
      return rows.map((r) => ({ ...r, subjectName: persons.find((p) => p.id === r.subjectPersonId) ? personName(persons.find((p) => p.id === r.subjectPersonId)!) : '', overdue: ['RECEIVED', 'IN_PROGRESS'].includes(r.status) && r.dueAt < new Date() }));
    });
  }

  async resolveDsr(user: AuthUser, id: string, b: z.infer<typeof dsrResolveSchema>, meta: RequestMeta) {
    return this.prisma.forUser(user, async (tx) => {
      const r = await tx.dataSubjectRequest.update({ where: { id }, data: { status: b.status, resolution: b.resolution, resolvedByUserId: b.status === 'IN_PROGRESS' ? null : user.id, resolvedAt: b.status === 'IN_PROGRESS' ? null : new Date() } });
      await this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: 'compliance.dsr_updated', entity: 'data_subject_request', entityId: id, after: { status: b.status }, meta });
      return r;
    });
  }

  /** Portability export: complete record of a data subject as JSON (stored encrypted). */
  async exportSubject(user: AuthUser, personId: string, dsrId: string | null, meta: RequestMeta) {
    const data = await this.prisma.forUser(user, async (tx) => {
      if (!can(user, 'compliance:manage')) throw forbidden();
      const person = await tx.person.findUnique({ where: { id: personId }, include: { student: { include: { guardians: true, emergencyContacts: true, enrollments: true } }, contacts: true, addresses: true } });
      if (!person) throw notFound('Titular');
      const sid = person.student?.id;
      const [healthProfile, allergies, conditions, carePlans, immunizations, anthropometrics, screenings, encounters, passes, meds, administrations, consents, notifications] = await Promise.all([
        tx.healthProfile.findUnique({ where: { personId } }),
        tx.allergy.findMany({ where: { personId } }),
        tx.chronicCondition.findMany({ where: { personId } }),
        tx.carePlan.findMany({ where: { personId } }),
        tx.immunization.findMany({ where: { personId } }),
        tx.anthropometric.findMany({ where: { personId } }),
        tx.screening.findMany({ where: { personId } }),
        tx.encounter.findMany({ where: { personId, isMentalHealth: false }, include: { vitals: true, diagnoses: true, notes: true, incident: true, referrals: true } }),
        sid ? tx.pass.findMany({ where: { studentId: sid }, include: { events: true } }) : [],
        sid ? tx.medicationRequest.findMany({ where: { studentId: sid }, include: { custody: true } }) : [],
        sid ? tx.medicationAdministration.findMany({ where: { studentId: sid } }) : [],
        sid ? tx.consent.findMany({ where: { studentId: sid }, include: { template: { select: { type: true, version: true, title: true } } } }) : [],
        tx.notification.count({ where: { user: { personId } } }),
      ]);
      await tx.clinicalAccessLog.create({ data: { tenantId: user.tenantId, userId: user.id, personId, resource: 'portability_export', reason: dsrId ? `DSR ${dsrId}` : 'Exportación', ip: meta.ip, userAgent: meta.userAgent } });
      return { exportedAt: new Date().toISOString(), format: 'SGEE-portability/1.0', person, healthProfile, allergies, conditions, carePlans, immunizations, anthropometrics, screenings, encounters, passes, medicationRequests: meds, administrations, consents, notificationsCount: notifications };
    });
    const buffer = Buffer.from(JSON.stringify(data, (_, v) => (typeof v === 'bigint' ? v.toString() : v), 2), 'utf8');
    const file = await this.storage.save(user, { buffer, originalName: `portabilidad-${personId.slice(0, 8)}.json`, kind: 'EXPORT', ownerPersonId: personId, allowAnyType: true, mimeType: 'application/json' });
    await this.prisma.forUser(user, async (tx) => {
      if (dsrId) await tx.dataSubjectRequest.update({ where: { id: dsrId }, data: { exportFileId: file.id } });
      await this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: 'compliance.portability_export', entity: 'person', entityId: personId, after: { fileId: file.id, size: file.size }, meta });
    });
    return { fileId: file.id, size: file.size, download: `/api/v1/files/${file.id}` };
  }

  // ── legal holds, retention, mandatory reports ─────────────────────────────
  legalHolds(user: AuthUser) {
    return this.prisma.forUser(user, (tx) => tx.legalHold.findMany({ orderBy: { createdAt: 'desc' } }));
  }

  async createHold(user: AuthUser, b: z.infer<typeof legalHoldSchema>, meta: RequestMeta) {
    return this.prisma.forUser(user, async (tx) => {
      const h = await tx.legalHold.create({ data: { tenantId: user.tenantId, personId: b.personId, reason: b.reason, reference: b.reference ?? null, createdByUserId: user.id } });
      await tx.retentionFlag.updateMany({ where: { personId: b.personId, status: 'PENDING' }, data: { status: 'HELD' } });
      await this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: 'compliance.legal_hold_created', entity: 'legal_hold', entityId: h.id, meta });
      return h;
    });
  }

  async releaseHold(user: AuthUser, id: string, meta: RequestMeta) {
    return this.prisma.forUser(user, async (tx) => {
      const h = await tx.legalHold.update({ where: { id }, data: { releasedAt: new Date(), releasedByUserId: user.id } });
      await this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: 'compliance.legal_hold_released', entity: 'legal_hold', entityId: id, meta });
      return h;
    });
  }

  retentionPolicies(user: AuthUser) {
    return this.prisma.forUser(user, (tx) => tx.retentionPolicy.findMany());
  }

  async setRetentionPolicy(user: AuthUser, entity: string, b: { retentionYears: number; action: string; active: boolean }, meta: RequestMeta) {
    return this.prisma.forUser(user, async (tx) => {
      const rules = await this.rules(tx, user.tenantId);
      if (entity === 'clinical_record' && b.retentionYears < rules.clinicalRecordRetentionYears) throw badRequest('RETENTION_BELOW_LEGAL', `La norma exige al menos ${rules.clinicalRecordRetentionYears} años.`);
      const p = await tx.retentionPolicy.upsert({ where: { tenantId_entity: { tenantId: user.tenantId, entity } }, create: { tenantId: user.tenantId, entity, ...b }, update: b });
      await this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: 'compliance.retention_policy_updated', entity: 'retention_policy', entityId: p.id, after: b, meta });
      return p;
    });
  }

  retentionFlags(user: AuthUser) {
    return this.prisma.forUser(user, (tx) => tx.retentionFlag.findMany({ orderBy: { createdAt: 'desc' }, take: 500 }));
  }

  /**
   * Daily: clinical records are never deleted automatically — records past
   * retention are flagged for review unless under legal hold. Non-clinical
   * data (notifications, passes) is anonymized per policy.
   */
  async retention(tenantId: string) {
    return this.prisma.forTenant(tenantId, async (tx) => {
      const policies = await tx.retentionPolicy.findMany({ where: { active: true } });
      const tz = await this.settings.timezone(tx, tenantId);
      const today = dateInTz(new Date(), tz);
      const out = { flagged: 0, anonymizedNotifications: 0, anonymizedPasses: 0 };
      const clinical = policies.find((p) => p.entity === 'clinical_record');
      if (clinical) {
        const cutoff = new Date(`${addDays(today, -clinical.retentionYears * 365)}T00:00:00Z`);
        const candidates = await tx.$queryRaw<{ person_id: string; last_at: Date }[]>`
          SELECT e.person_id, max(e.started_at) AS last_at FROM clinical.encounters e
          JOIN people.persons p ON p.id = e.person_id
          WHERE p.status = 'INACTIVE'
          GROUP BY e.person_id HAVING max(e.started_at) < ${cutoff}`;
        const held = new Set((await tx.legalHold.findMany({ where: { releasedAt: null } })).map((h) => h.personId));
        for (const c of candidates) {
          const r = await tx.retentionFlag.createMany({ data: [{ tenantId, personId: c.person_id, entity: 'clinical_record', reason: `Último registro ${dateInTz(c.last_at, tz)}; retención ${clinical.retentionYears} años cumplida`, dueSince: cutoff, status: held.has(c.person_id) ? 'HELD' : 'PENDING' }], skipDuplicates: true });
          out.flagged += r.count;
        }
      }
      const notif = policies.find((p) => p.entity === 'notifications');
      if (notif) {
        const r = await tx.notification.updateMany({ where: { createdAt: { lt: new Date(Date.now() - notif.retentionYears * 365 * 86400000) }, body: { not: '[anonimizado]' } }, data: { body: '[anonimizado]', subject: null, recipientAddress: null } });
        out.anonymizedNotifications = r.count;
      }
      const passes = policies.find((p) => p.entity === 'passes');
      if (passes) {
        const r = await tx.pass.updateMany({ where: { requestedAt: { lt: new Date(Date.now() - passes.retentionYears * 365 * 86400000) }, notes: { not: null } }, data: { notes: null, companionName: null } });
        out.anonymizedPasses = r.count;
      }
      return out;
    });
  }

  async setRetentionFlag(user: AuthUser, id: string, status: 'ACTIONED' | 'HELD', meta: RequestMeta) {
    return this.prisma.forUser(user, async (tx) => {
      const f = await tx.retentionFlag.update({ where: { id }, data: { status, actedAt: new Date(), actedBy: user.id } });
      await this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: 'compliance.retention_flag_updated', entity: 'retention_flag', entityId: id, after: { status }, meta });
      return f;
    });
  }

  mandatoryReports(user: AuthUser) {
    return this.prisma.forUser(user, (tx) => tx.mandatoryReport.findMany({ orderBy: [{ status: 'asc' }, { dueAt: 'asc' }] }));
  }

  async createMandatoryReport(user: AuthUser, b: z.infer<typeof mandatoryReportSchema>, meta: RequestMeta) {
    return this.prisma.forUser(user, async (tx) => {
      const rules = await this.rules(tx, user.tenantId);
      const rule = rules.mandatoryReports.find((r) => r.type === b.type);
      const r = await tx.mandatoryReport.create({ data: { tenantId: user.tenantId, type: b.type, studentId: b.studentId ?? null, encounterId: b.encounterId ?? null, authority: b.authority, details: b.details, filedReference: b.filedReference ?? null, dueAt: new Date(Date.now() + (rule?.deadlineHours ?? 24) * 3600_000), createdByUserId: user.id } });
      await this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: 'compliance.mandatory_report_created', entity: 'mandatory_report', entityId: r.id, after: { type: b.type }, meta });
      return r;
    });
  }

  async updateMandatoryReport(user: AuthUser, id: string, b: { details?: string; filedReference?: string | null; status?: 'DRAFT' | 'FILED' }, meta: RequestMeta) {
    return this.prisma.forUser(user, async (tx) => {
      const r = await tx.mandatoryReport.update({ where: { id }, data: { ...b, filedAt: b.status === 'FILED' ? new Date() : undefined } });
      await this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: 'compliance.mandatory_report_updated', entity: 'mandatory_report', entityId: id, after: { status: b.status }, meta });
      return r;
    });
  }

  async accessLog(user: AuthUser, q: { userId?: string; personId?: string; from?: string; to?: string; outOfRole?: boolean }) {
    return this.prisma.forUser(user, async (tx) => {
      const rows = await tx.clinicalAccessLog.findMany({
        where: { ...(q.userId ? { userId: q.userId } : {}), ...(q.personId ? { personId: q.personId } : {}), ...(q.outOfRole ? { outOfRole: true } : {}), ...(q.from || q.to ? { createdAt: { gte: q.from ? new Date(q.from) : undefined, lte: q.to ? new Date(`${q.to}T23:59:59`) : undefined } } : {}) },
        orderBy: { createdAt: 'desc' },
        take: 500,
      });
      const [users, persons] = await Promise.all([
        tx.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.userId))] } }, select: { id: true, firstName: true, lastName: true, email: true } }),
        tx.person.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.personId))] } }, select: { id: true, firstName: true, lastName: true } }),
      ]);
      return rows.map((r) => ({ ...r, userName: users.find((u) => u.id === r.userId) ? personName(users.find((u) => u.id === r.userId)!) : '', personName: persons.find((p) => p.id === r.personId) ? personName(persons.find((p) => p.id === r.personId)!) : '' }));
    });
  }

  /** Alerts on anomalous access (many different records in a short time). */
  async accessAnomalies(tenantId: string, threshold = 40) {
    return this.prisma.forTenant(tenantId, async (tx) => {
      const rows = await tx.$queryRaw<{ user_id: string; persons: bigint }[]>`
        SELECT user_id, count(DISTINCT person_id) AS persons FROM clinical.clinical_access_log
        WHERE created_at > now() - interval '10 minutes' GROUP BY user_id HAVING count(DISTINCT person_id) > ${threshold}`;
      for (const r of rows) {
        const u = await tx.user.findUnique({ where: { id: r.user_id }, select: { firstName: true, lastName: true } });
        await this.audit.log(tx, { tenantId, action: 'security.access_anomaly', entity: 'user', entityId: r.user_id, after: { distinctRecords10min: Number(r.persons) } });
        await this.notify.notify(tx, { tenantId, event: 'MESSAGE_RECEIVED', roles: ['HEALTH_COORDINATOR', 'ADMIN'], channels: ['IN_APP', 'EMAIL'], urgent: true, data: { studentName: `alerta de seguridad: ${u ? personName(u) : r.user_id} consultó ${r.persons} historias en 10 minutos` }, link: '/admin/cumplimiento', entity: 'user', entityId: r.user_id, dedupeKey: `anomaly:${r.user_id}:${Math.floor(Date.now() / 3600_000)}` });
      }
      return { anomalies: rows.length };
    });
  }
}
