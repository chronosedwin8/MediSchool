import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  type absenceExcuseSchema,
  type campaignSchema,
  dateInTz,
  detectOutbreaks,
  type drillSchema,
  type fieldTripSchema,
  subjectPatterns,
  syndromeOf,
} from '@sgee/shared';
import type { z } from 'zod';
import { AccessService } from '../../common/access.service';
import { AuditService } from '../../common/audit.service';
import { type AuthUser, can, hasRole, type RequestMeta } from '../../common/auth';
import { forbidden, notFound } from '../../common/errors';
import { createPdf, field, footer, pdfToBuffer, section, table } from '../../common/pdf';
import { PrismaService } from '../../common/prisma.service';
import { personName, studentInclude, studentSummary } from '../../common/serializers';
import { TenantSettingsService } from '../../common/tenant-settings.service';
import { NotifyService } from '../comms/notify.service';
import { PhotoService } from '../files/storage.service';
import { JobsService } from '../jobs/jobs.service';

const SYNDROME_LABELS: Record<string, string> = {
  GASTROINTESTINAL: 'síntomas gastrointestinales',
  RESPIRATORIO: 'síntomas respiratorios',
  EXANTEMATICO: 'enfermedad exantemática',
  CONJUNTIVITIS: 'conjuntivitis',
  PEDICULOSIS: 'pediculosis',
  FEBRIL: 'fiebre',
};

@Injectable()
export class PublicHealthService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly notify: NotifyService,
    private readonly jobs: JobsService,
    private readonly settings: TenantSettingsService,
    private readonly photos: PhotoService,
  ) {}

  onModuleInit() {
    this.jobs.register('publichealth.outbreaks', (job) => this.runOutbreakDetection(job.tenantId!));
    this.jobs.register('publichealth.frequent', (job) => this.frequentVisitorsJob(job.tenantId!));
    this.jobs.every('publichealth.outbreaks', 60);
    this.jobs.dailyAt('publichealth.frequent', '16:00');
  }

  // ── outbreaks ────────────────────────────────────────────────────────────
  async runOutbreakDetection(tenantId: string) {
    return this.prisma.forTenant(tenantId, async (tx) => {
      const s = await this.settings.get(tx, tenantId);
      const since = new Date(Date.now() - s.outbreak.windowDays * 86400000);
      const encounters = await tx.encounter.findMany({
        where: { subjectType: 'STUDENT', status: { not: 'ANNULLED' }, startedAt: { gte: since }, studentId: { not: null } },
        select: { studentId: true, chiefComplaint: true, startedAt: true, diagnoses: { where: { primary: true }, select: { code: true } } },
      });
      const students = await tx.student.findMany({ where: { id: { in: [...new Set(encounters.map((e) => e.studentId!))] } }, select: { id: true, currentGroupId: true, group: { select: { gradeId: true } } } });
      const cases = encounters
        .map((e) => {
          const st = students.find((x) => x.id === e.studentId);
          const syndrome = syndromeOf(e.chiefComplaint, e.diagnoses[0]?.code);
          return syndrome && st ? { studentId: st.id, groupId: st.currentGroupId, gradeId: st.group?.gradeId ?? null, syndrome, date: e.startedAt } : null;
        })
        .filter((x): x is NonNullable<typeof x> => !!x);
      const groupCounts = await tx.student.groupBy({ by: ['currentGroupId'], where: { status: 'ACTIVE' }, _count: true });
      const groups = await tx.group.findMany({ select: { id: true, name: true, gradeId: true, grade: { select: { name: true } } } });
      const population = { groups: {} as Record<string, number>, grades: {} as Record<string, number> };
      for (const g of groupCounts) {
        if (!g.currentGroupId) continue;
        population.groups[g.currentGroupId] = g._count;
        const gradeId = groups.find((x) => x.id === g.currentGroupId)?.gradeId;
        if (gradeId) population.grades[gradeId] = (population.grades[gradeId] ?? 0) + g._count;
      }
      const signals = detectOutbreaks(cases, population, new Date(), s.outbreak);
      let created = 0;
      for (const sig of signals) {
        const week = dateInTz(new Date(sig.firstCaseAt), 'UTC').slice(0, 7);
        const dedupeKey = `${sig.scope}:${sig.scopeId}:${sig.syndrome}:${week}`;
        const scopeName = sig.scope === 'GROUP' ? (groups.find((g) => g.id === sig.scopeId)?.name ?? sig.scopeId) : (groups.find((g) => g.gradeId === sig.scopeId)?.grade.name ?? sig.scopeId);
        const existing = await tx.outbreakSignal.findUnique({ where: { tenantId_dedupeKey: { tenantId, dedupeKey } } });
        if (existing) {
          await tx.outbreakSignal.update({ where: { id: existing.id }, data: { cases: sig.cases, attackRatePct: sig.attackRatePct, lastCaseAt: new Date(sig.lastCaseAt), studentIds: sig.studentIds } });
          continue;
        }
        const row = await tx.outbreakSignal.create({ data: { tenantId, scope: sig.scope, scopeId: sig.scopeId, scopeName, syndrome: sig.syndrome, cases: sig.cases, population: sig.population, attackRatePct: sig.attackRatePct, firstCaseAt: new Date(sig.firstCaseAt), lastCaseAt: new Date(sig.lastCaseAt), studentIds: sig.studentIds, dedupeKey } });
        await this.notify.notify(tx, { tenantId, event: 'OUTBREAK_ALERT', roles: ['NURSE', 'DOCTOR', 'HEALTH_COORDINATOR', 'DIRECTOR'], channels: ['IN_APP', 'EMAIL'], data: { syndrome: SYNDROME_LABELS[sig.syndrome] ?? sig.syndrome, scope: scopeName }, link: '/salud-publica', entity: 'outbreak_signal', entityId: row.id, dedupeKey: `outbreak:${row.id}` });
        await this.audit.log(tx, { tenantId, action: 'publichealth.outbreak_detected', entity: 'outbreak_signal', entityId: row.id, after: { scope: sig.scope, syndrome: sig.syndrome, cases: sig.cases, rate: sig.attackRatePct } });
        created++;
      }
      return { signals: signals.length, created };
    });
  }

  outbreaks(user: AuthUser, status?: string) {
    return this.prisma.forUser(user, (tx) => tx.outbreakSignal.findMany({ where: status ? { status } : {}, orderBy: { detectedAt: 'desc' }, take: 100 }));
  }

  async updateOutbreak(user: AuthUser, id: string, b: { status: string; notes?: string | null }, meta: RequestMeta) {
    return this.prisma.forUser(user, async (tx) => {
      const r = await tx.outbreakSignal.update({ where: { id }, data: { status: b.status, notes: b.notes ?? undefined, closedAt: b.status === 'CLOSED' ? new Date() : null } });
      await this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: 'publichealth.outbreak_updated', entity: 'outbreak_signal', entityId: id, after: { status: b.status }, meta });
      return r;
    });
  }

  // ── frequent visitors & patterns ─────────────────────────────────────────
  async frequentVisitors(user: AuthUser, days = 30) {
    return this.prisma.forUser(user, async (tx) => {
      const s = await this.settings.get(tx, user.tenantId);
      const since = new Date(Date.now() - days * 86400000);
      const grouped = await tx.encounter.groupBy({ by: ['studentId'], where: { studentId: { not: null }, status: { not: 'ANNULLED' }, startedAt: { gte: since } }, _count: true, having: { studentId: { _count: { gte: s.frequentVisitorThreshold } } }, orderBy: { _count: { studentId: 'desc' } }, take: 50 });
      const students = await tx.student.findMany({ where: { id: { in: grouped.map((g) => g.studentId!) } }, include: studentInclude });
      const passes = await tx.pass.findMany({ where: { studentId: { in: grouped.map((g) => g.studentId!) }, requestedAt: { gte: since } }, select: { studentId: true, subject: true } });
      const patterns = subjectPatterns(passes);
      const anonymous = !can(user, 'stats:clinical');
      return grouped.map((g, i) => {
        const st = students.find((x) => x.id === g.studentId)!;
        const summary = studentSummary(st, { photosEnabled: this.photos.enabled });
        return { rank: i + 1, count: g._count, student: anonymous ? { id: null, name: `Estudiante ${i + 1}`, group: summary.group } : summary, patterns: patterns.filter((p) => p.studentId === g.studentId) };
      });
    });
  }

  async frequentVisitorsJob(tenantId: string) {
    return this.prisma.forTenant(tenantId, async (tx) => {
      const s = await this.settings.get(tx, tenantId);
      const since = new Date(Date.now() - 30 * 86400000);
      const grouped = await tx.encounter.groupBy({ by: ['studentId'], where: { studentId: { not: null }, status: { not: 'ANNULLED' }, startedAt: { gte: since } }, _count: true, having: { studentId: { _count: { gte: s.frequentVisitorThreshold } } } });
      const week = Math.floor(Date.now() / (7 * 86400000));
      for (const g of grouped) {
        const st = await tx.student.findUniqueOrThrow({ where: { id: g.studentId! }, include: { person: true } });
        await this.notify.notify(tx, { tenantId, event: 'FREQUENT_VISITOR', roles: ['PSYCHOLOGIST', 'HEALTH_COORDINATOR'], channels: ['IN_APP'], data: { studentName: personName(st.person), count: g._count, period: 'los últimos 30 días' }, link: `/estudiantes/${st.id}`, entity: 'student', entityId: st.id, dedupeKey: `frequent:${st.id}:${week}` });
      }
      return { frequent: grouped.length };
    });
  }

  // ── campaigns ────────────────────────────────────────────────────────────
  campaigns(user: AuthUser) {
    return this.prisma.forUser(user, async (tx) => {
      const rows = await tx.campaign.findMany({ orderBy: { startsOn: 'desc' }, include: { participants: { select: { status: true } } } });
      return rows.map((c) => ({ ...c, participants: undefined, stats: c.participants.reduce<Record<string, number>>((a, p) => ((a[p.status] = (a[p.status] ?? 0) + 1), a), {}), total: c.participants.length }));
    });
  }

  async createCampaign(user: AuthUser, b: z.infer<typeof campaignSchema>, meta: RequestMeta) {
    return this.prisma.forUser(user, async (tx) => {
      const c = await tx.campaign.create({ data: { tenantId: user.tenantId, name: b.name, kind: b.kind, startsOn: new Date(b.startsOn), endsOn: new Date(b.endsOn), description: b.description ?? null, audience: { sectionIds: b.sectionIds, gradeIds: b.gradeIds }, status: 'ACTIVE', createdBy: user.id } });
      const students = await tx.student.findMany({
        where: { status: 'ACTIVE', ...(b.gradeIds.length ? { group: { gradeId: { in: b.gradeIds } } } : b.sectionIds.length ? { group: { grade: { sectionId: { in: b.sectionIds } } } } : {}) },
        select: { id: true },
      });
      await tx.campaignParticipant.createMany({ data: students.map((s) => ({ tenantId: user.tenantId, campaignId: c.id, studentId: s.id })), skipDuplicates: true });
      await this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: 'publichealth.campaign_created', entity: 'campaign', entityId: c.id, after: { participants: students.length }, meta });
      return { ...c, participants: students.length };
    });
  }

  async campaign(user: AuthUser, id: string) {
    return this.prisma.forUser(user, async (tx) => {
      const c = await tx.campaign.findUnique({ where: { id }, include: { participants: true } });
      if (!c) throw notFound('Campaña');
      const students = await tx.student.findMany({ where: { id: { in: c.participants.map((p) => p.studentId) } }, include: studentInclude });
      return { ...c, participants: c.participants.map((p) => ({ ...p, student: studentSummary(students.find((s) => s.id === p.studentId)!, { photosEnabled: this.photos.enabled }) })).sort((a, b) => a.student.name.localeCompare(b.student.name)) };
    });
  }

  async updateParticipant(user: AuthUser, campaignId: string, studentId: string, b: { status: string; notes?: string | null }, meta: RequestMeta) {
    return this.prisma.forUser(user, async (tx) => {
      const r = await tx.campaignParticipant.update({ where: { campaignId_studentId: { campaignId, studentId } }, data: { status: b.status, notes: b.notes ?? null, doneAt: b.status === 'DONE' ? new Date() : null, recordedBy: user.id } });
      await this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: 'publichealth.participant_updated', entity: 'campaign_participant', entityId: r.id, after: { status: b.status }, meta });
      return r;
    });
  }

  // ── absence excuses ──────────────────────────────────────────────────────
  async createExcuse(user: AuthUser, b: z.infer<typeof absenceExcuseSchema>, meta: RequestMeta) {
    return this.prisma.forUser(user, async (tx) => {
      const isParent = hasRole(user, 'PARENT') && (await this.access.childrenIds(tx, user)).includes(b.studentId);
      if (!isParent && !can(user, 'clinical:write')) throw forbidden();
      const r = await tx.absenceExcuse.create({ data: { tenantId: user.tenantId, studentId: b.studentId, fromDate: new Date(b.from), toDate: new Date(b.to), reason: b.reason, illness: b.illness, symptoms: b.symptoms ?? null, attachmentFileId: b.attachmentId ?? null, submittedBy: user.id } });
      await this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: 'publichealth.excuse_submitted', entity: 'absence_excuse', entityId: r.id, meta });
      return r;
    });
  }

  async excuses(user: AuthUser, status?: string) {
    return this.prisma.forUser(user, async (tx) => {
      const where = { ...(status ? { status } : {}), ...(can(user, 'clinical:read') ? {} : { studentId: { in: await this.access.childrenIds(tx, user) } }) };
      const rows = await tx.absenceExcuse.findMany({ where, orderBy: { createdAt: 'desc' }, take: 300 });
      const students = await tx.student.findMany({ where: { id: { in: rows.map((r) => r.studentId) } }, include: studentInclude });
      return rows.map((r) => ({ ...r, student: studentSummary(students.find((s) => s.id === r.studentId)!, { photosEnabled: this.photos.enabled }), syndrome: r.illness ? syndromeOf(`${r.reason} ${r.symptoms ?? ''}`) : null }));
    });
  }

  async validateExcuse(user: AuthUser, id: string, status: 'VALIDATED' | 'REJECTED', meta: RequestMeta) {
    return this.prisma.forUser(user, async (tx) => {
      const r = await tx.absenceExcuse.update({ where: { id }, data: { status, validatedBy: user.id, validatedAt: new Date() } });
      await this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: 'publichealth.excuse_validated', entity: 'absence_excuse', entityId: id, after: { status }, meta });
      return r;
    });
  }

  // ── field trips, drills, safety resources ────────────────────────────────
  fieldTrips(user: AuthUser) {
    return this.prisma.forUser(user, (tx) => tx.fieldTrip.findMany({ orderBy: { date: 'desc' } }));
  }

  async createFieldTrip(user: AuthUser, b: z.infer<typeof fieldTripSchema>, meta: RequestMeta) {
    return this.prisma.forUser(user, async (tx) => {
      const t = await tx.fieldTrip.create({ data: { tenantId: user.tenantId, name: b.name, date: new Date(b.date), destination: b.destination, groupIds: b.groupIds, kitId: b.kitId ?? null, responsibleStaff: b.responsibleStaff ?? null, createdBy: user.id } });
      await this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: 'publichealth.field_trip_created', entity: 'field_trip', entityId: t.id, meta });
      return t;
    });
  }

  /** Auto-generated list for a field trip: alerts, medication and contacts (PLAN §5.8). */
  async roster(user: AuthUser, id: string) {
    return this.prisma.forUser(user, async (tx) => {
      const trip = await tx.fieldTrip.findUnique({ where: { id } });
      if (!trip) throw notFound('Salida pedagógica');
      const students = await tx.student.findMany({
        where: { currentGroupId: { in: trip.groupIds }, status: 'ACTIVE' },
        include: {
          ...studentInclude,
          person: { include: { allergies: { where: { active: true } }, conditions: { where: { active: true } }, healthProfile: true } },
          guardians: { where: { active: true }, include: { guardian: { include: { person: true } } }, orderBy: { priority: 'asc' } },
          medicationRequests: { where: { status: 'ACTIVE' } },
        },
        orderBy: [{ group: { name: 'asc' } }, { person: { lastName: 'asc' } }],
      });
      const kit = trip.kitId ? await tx.kit.findUnique({ where: { id: trip.kitId } }) : null;
      const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: user.tenantId } });
      return {
        trip,
        tenant: tenant.name,
        kit,
        students: students.map((s) => ({
          ...studentSummary(s, { photosEnabled: this.photos.enabled }),
          bloodType: s.person.healthProfile?.bloodType ?? null,
          eps: s.person.healthProfile?.eps ?? null,
          allergies: s.person.allergies.map((a) => ({ agent: a.agent, severity: a.severity, epinephrine: a.requiresEpinephrine })),
          conditions: s.person.conditions.map((c) => c.name),
          medications: s.medicationRequests.map((m) => ({ name: m.medicationName, dose: `${m.dose} ${m.doseUnit}`, prn: m.isPrn, times: m.times })),
          contacts: s.guardians.slice(0, 2).map((g) => ({ name: personName(g.guardian.person), relationship: g.relationship, phone: g.guardian.person.mobile ?? g.guardian.person.phone })),
        })),
      };
    });
  }

  async rosterPdf(user: AuthUser, id: string) {
    const r = await this.roster(user, id);
    const doc = createPdf(`Salida pedagógica: ${r.trip.name}`, `${r.tenant} · ${dateInTz(r.trip.date, 'UTC')} · ${r.trip.destination}`);
    section(doc, 'Resumen');
    field(doc, 'Estudiantes', r.students.length);
    field(doc, 'Con alergias severas', r.students.filter((s) => s.allergies.some((a) => ['SEVERE', 'ANAPHYLAXIS'].includes(a.severity))).length);
    field(doc, 'Con medicación', r.students.filter((s) => s.medications.length).length);
    field(doc, 'Botiquín asignado', r.kit?.name ?? 'Sin asignar');
    field(doc, 'Responsable', r.trip.responsibleStaff);
    section(doc, 'Listado con alertas y contactos');
    table(
      doc,
      ['Estudiante', 'Grupo', 'RH / EPS', 'Alergias / condiciones', 'Medicación', 'Contacto'],
      r.students.map((s) => [s.name, s.group?.name ?? '', `${s.bloodType ?? '—'} / ${s.eps ?? '—'}`, [...s.allergies.map((a) => `${a.agent}${a.epinephrine ? ' (EPI)' : ''}`), ...s.conditions].join(', ') || '—', s.medications.map((m) => `${m.name} ${m.dose}${m.prn ? ' PRN' : ''}`).join(', ') || '—', s.contacts.map((c) => `${c.name} ${c.phone ?? ''}`).join(' / ')]),
      [95, 40, 60, 115, 105, 97],
    );
    footer(doc, `${r.tenant} · Información reservada — solo para el responsable de la salida`);
    return pdfToBuffer(doc);
  }

  drills(user: AuthUser) {
    return this.prisma.forUser(user, (tx) => tx.emergencyDrill.findMany({ orderBy: { performedOn: 'desc' } }));
  }

  async createDrill(user: AuthUser, b: z.infer<typeof drillSchema>, meta: RequestMeta) {
    return this.prisma.forUser(user, async (tx) => {
      const d = await tx.emergencyDrill.create({ data: { tenantId: user.tenantId, ...b, performedOn: new Date(b.performedOn), createdBy: user.id } });
      await this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: 'publichealth.drill_recorded', entity: 'emergency_drill', entityId: d.id, meta });
      return d;
    });
  }

  safetyResources(user: AuthUser) {
    return this.prisma.forUser(user, (tx) => tx.safetyResource.findMany({ where: { active: true }, orderBy: [{ kind: 'asc' }, { name: 'asc' }] }));
  }

  async createSafetyResource(user: AuthUser, b: { kind: string; name: string; location: string; details?: string | null }, meta: RequestMeta) {
    return this.prisma.forUser(user, async (tx) => {
      const r = await tx.safetyResource.create({ data: { tenantId: user.tenantId, ...b } });
      await this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: 'publichealth.safety_resource_created', entity: 'safety_resource', entityId: r.id, meta });
      return r;
    });
  }

  /** Weekly syndromic counts for the health authority (SIVIGILA-style CSV). */
  async surveillanceCsv(user: AuthUser, from: string, to: string) {
    return this.prisma.forUser(user, async (tx) => {
      const tz = await this.settings.timezone(tx, user.tenantId);
      const rows = await tx.encounter.findMany({
        where: { subjectType: 'STUDENT', status: { not: 'ANNULLED' }, startedAt: { gte: new Date(`${from}T00:00:00-05:00`), lte: new Date(`${to}T23:59:59-05:00`) } },
        select: { startedAt: true, chiefComplaint: true, diagnoses: { where: { primary: true }, select: { code: true } }, person: { select: { sex: true, birthDate: true } } },
      });
      const buckets = new Map<string, number>();
      for (const r of rows) {
        const syn = syndromeOf(r.chiefComplaint, r.diagnoses[0]?.code);
        if (!syn) continue;
        const d = new Date(dateInTz(r.startedAt, tz));
        const week = `${d.getUTCFullYear()}-W${String(Math.ceil(((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7)).padStart(2, '0')}`;
        const key = [week, syn, r.diagnoses[0]?.code ?? '', r.person.sex ?? ''].join(';');
        buckets.set(key, (buckets.get(key) ?? 0) + 1);
      }
      return ['semana;sindrome;cie10;sexo;casos', ...[...buckets.entries()].sort().map(([k, v]) => `${k};${v}`)].join('\n');
    });
  }
}
