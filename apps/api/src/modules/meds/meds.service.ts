import { Injectable, OnModuleInit } from '@nestjs/common';
import type { MedicationRequest, Tx } from '@sgee/db';
import {
  addDays,
  allergyMatches,
  type administrationSchema,
  type custodyReceiveSchema,
  type custodyReturnSchema,
  dateInTz,
  dayBounds,
  dosesForDay,
  type medicationRequestSchema,
  type medicationReviewSchema,
  type medicationStatusChangeSchema,
  profileFor,
  ROUTE_LABELS,
  type Route,
  timeInTz,
  verifyFiveRights,
  zonedToUtc,
} from '@sgee/shared';
import type { z } from 'zod';
import { AccessService } from '../../common/access.service';
import { AuditService } from '../../common/audit.service';
import { type AuthUser, can, hasRole, isClinical, type RequestMeta } from '../../common/auth';
import { conflict, forbidden, notFound, Problem, unprocessable } from '../../common/errors';
import { createPdf, field, footer, pdfToBuffer, section, table } from '../../common/pdf';
import { PrismaService } from '../../common/prisma.service';
import { personName, studentInclude, studentSummary } from '../../common/serializers';
import { TenantSettingsService } from '../../common/tenant-settings.service';
import { NotifyService } from '../comms/notify.service';
import { PhotoService } from '../files/storage.service';
import { JobsService } from '../jobs/jobs.service';
import { RealtimeService } from '../realtime/live.gateway';

const DECISION_LABEL = { APPROVE: 'aprobada', REJECT: 'rechazada' };

@Injectable()
export class MedsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly notify: NotifyService,
    private readonly jobs: JobsService,
    private readonly settings: TenantSettingsService,
    private readonly realtime: RealtimeService,
    private readonly photos: PhotoService,
  ) {}

  onModuleInit() {
    this.jobs.register('meds.schedule', (job) => this.prisma.forTenant(job.tenantId!, (tx) => this.generateSchedule(tx, job.tenantId!)));
    this.jobs.register('meds.omissions', (job) => this.omissionCheck(job.tenantId!));
    this.jobs.register('meds.expiring', (job) => this.expiringCheck(job.tenantId!));
    this.jobs.every('meds.schedule', 60);
    this.jobs.every('meds.omissions', 5);
    this.jobs.dailyAt('meds.expiring', '07:00');
  }

  private async childAccess(tx: Tx, user: AuthUser, studentId: string) {
    if (can(user, 'meds:read', 'meds:approve')) return this.access.assertStudent(tx, user, studentId, 'clinical');
    if (hasRole(user, 'PARENT') && (await this.access.childrenIds(tx, user)).includes(studentId)) return this.access.assertStudent(tx, user, studentId, 'clinical');
    throw forbidden();
  }

  async createRequest(user: AuthUser, b: z.infer<typeof medicationRequestSchema>, meta: RequestMeta) {
    return this.prisma.forUser(user, async (tx) => {
      const student = await this.childAccess(tx, user, b.studentId);
      const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: user.tenantId } });
      const rules = profileFor(tenant.country);
      const settings = await this.settings.get(tx, user.tenantId);
      const catalog = b.catalogId ? await tx.medicationCatalog.findUnique({ where: { id: b.catalogId } }) : null;
      const controlled = !!catalog?.controlled;
      const otcOk = !!catalog?.otcAllowed && rules.otcWithoutPrescription && !settings.requirePrescriptionForOtc;
      if (!b.prescriptionFileId && (controlled || !otcOk)) {
        throw unprocessable('PRESCRIPTION_REQUIRED', controlled ? 'Los medicamentos de control requieren fórmula médica.' : 'Adjunte la fórmula médica vigente.');
      }
      if (b.prescriptionFileId) {
        const f = await tx.storedFile.findUnique({ where: { id: b.prescriptionFileId } });
        if (!f || (f.uploadedBy !== user.id && f.ownerPersonId !== student.personId)) throw notFound('Fórmula médica');
      }
      // Consent for medication administration (ConsentGuard, PLAN §8)
      const template = await tx.consentTemplate.findFirst({ where: { type: 'MEDICATION_ADMIN', active: true }, orderBy: { effectiveFrom: 'desc' } });
      let consentId: string | null = null;
      if (template) {
        const consent = await tx.consent.findFirst({ where: { studentId: b.studentId, templateId: template.id, status: 'GRANTED' } });
        if (!consent && hasRole(user, 'PARENT')) throw conflict('CONSENT_REQUIRED', 'Firme primero el consentimiento de administración de medicamentos.', { templateId: template.id });
        consentId = consent?.id ?? null;
      }
      const allergies = await tx.allergy.findMany({ where: { personId: student.personId, active: true } });
      const conflicts = allergies.filter((a) => allergyMatches(a.agent, b.medicationName, b.activeIngredient, catalog?.genericName));
      if (conflicts.length) throw unprocessable('ALLERGY_CONFLICT', `El estudiante tiene alergia registrada a: ${conflicts.map((a) => a.agent).join(', ')}. No es posible registrar la solicitud.`);
      const isPrn = b.isPrn || b.frequency === 'PRN';
      const req = await tx.medicationRequest.create({
        data: {
          tenantId: user.tenantId,
          studentId: b.studentId,
          requestedByUserId: user.id,
          guardianPersonId: hasRole(user, 'PARENT') ? user.personId : null,
          catalogId: b.catalogId ?? null,
          medicationName: b.medicationName,
          activeIngredient: b.activeIngredient ?? catalog?.genericName ?? null,
          presentation: b.presentation ?? catalog?.form ?? null,
          dose: b.dose,
          doseUnit: b.doseUnit,
          route: b.route,
          frequency: isPrn ? 'PRN' : b.frequency,
          times: isPrn ? [] : b.times,
          daysOfWeek: b.frequency === 'WEEKDAYS' ? [1, 2, 3, 4, 5] : b.daysOfWeek,
          startDate: new Date(b.startDate),
          endDate: new Date(b.endDate),
          indication: b.indication,
          prescriberName: b.prescriberName ?? null,
          prescriberLicense: b.prescriberLicense ?? null,
          isPrn,
          prnCriteria: b.prnCriteria ?? null,
          minIntervalMinutes: b.minIntervalMinutes ?? null,
          maxDosesPerDay: b.maxDosesPerDay ?? null,
          selfAdministration: b.selfAdministration,
          storage: b.storage,
          controlled,
          notes: b.notes ?? null,
          consentId,
          status: 'SUBMITTED',
        },
      });
      if (b.prescriptionFileId) await tx.prescription.create({ data: { tenantId: user.tenantId, requestId: req.id, fileId: b.prescriptionFileId, issuedOn: b.prescriptionDate ? new Date(b.prescriptionDate) : null } });
      await this.notify.notify(tx, { tenantId: user.tenantId, event: 'PASS_CREATED', roles: ['NURSE'], channels: ['IN_APP'], data: { studentName: personName(student.person), group: student.group?.name ?? '', urgency: 'solicitud de medicamento' }, link: `/enfermeria/medicacion`, entity: 'medication_request', entityId: req.id });
      await this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: 'meds.request_submitted', entity: 'medication_request', entityId: req.id, after: { studentId: b.studentId, medication: b.medicationName, isPrn }, meta });
      return req;
    });
  }

  async list(user: AuthUser, q: { status?: string; studentId?: string }) {
    return this.prisma.forUser(user, async (tx) => {
      const where: Record<string, unknown> = {};
      if (q.status) where.status = { in: q.status.split(',') };
      if (q.studentId) where.studentId = q.studentId;
      if (!can(user, 'meds:read')) {
        if (!hasRole(user, 'PARENT')) throw forbidden();
        const kids = await this.access.childrenIds(tx, user);
        where.studentId = q.studentId && kids.includes(q.studentId) ? q.studentId : { in: kids };
      }
      const rows = await tx.medicationRequest.findMany({ where, include: { student: { include: studentInclude }, custody: { where: { closedAt: null } }, prescriptions: true }, orderBy: [{ status: 'asc' }, { createdAt: 'desc' }], take: 300 });
      return rows.map((r) => ({ ...r, student: studentSummary(r.student, { photosEnabled: this.photos.enabled }), routeLabel: ROUTE_LABELS[r.route as Route], custodyRemaining: r.custody.reduce((a, c) => a + c.quantityRemaining, 0) }));
    });
  }

  async detail(user: AuthUser, id: string) {
    return this.prisma.forUser(user, async (tx) => {
      const r = await tx.medicationRequest.findUnique({ where: { id }, include: { student: { include: studentInclude }, custody: { orderBy: { receivedAt: 'desc' } }, prescriptions: true, administrations: { orderBy: { administeredAt: 'desc' }, take: 60 } } });
      if (!r) throw notFound('Solicitud');
      await this.childAccess(tx, user, r.studentId);
      const allergies = await tx.allergy.findMany({ where: { personId: r.student.personId, active: true } });
      return { ...r, student: studentSummary(r.student, { photosEnabled: this.photos.enabled }), allergies, routeLabel: ROUTE_LABELS[r.route as Route] };
    });
  }

  async review(user: AuthUser, id: string, b: z.infer<typeof medicationReviewSchema>, meta: RequestMeta) {
    return this.prisma.forUser(user, async (tx) => {
      const r = await tx.medicationRequest.findUnique({ where: { id }, include: { student: { include: { person: true } }, prescriptions: true } });
      if (!r) throw notFound('Solicitud');
      if (r.status !== 'SUBMITTED') throw conflict('NOT_SUBMITTED', 'La solicitud ya fue revisada.');
      if (b.decision === 'APPROVE' && !Object.values(b.checks).every(Boolean)) throw unprocessable('CHECKS_INCOMPLETE', 'Para aprobar deben cumplirse todas las verificaciones.');
      if (b.decision === 'REJECT' && !b.reason) throw unprocessable('REASON_REQUIRED', 'Indique el motivo del rechazo.');
      const status = b.decision === 'REJECT' ? 'REJECTED' : r.selfAdministration || r.storage === 'STUDENT_CARRIES' ? 'ACTIVE' : 'APPROVED';
      const updated = await tx.medicationRequest.update({ where: { id }, data: { status, reviewedBy: user.id, reviewedAt: new Date(), reviewReason: b.reason ?? null, reviewChecks: b.checks } });
      if (status === 'ACTIVE') await this.generateSchedule(tx, user.tenantId, updated.id);
      await this.notify.notify(tx, { tenantId: user.tenantId, event: 'MEDICATION_REQUEST_REVIEWED', guardiansOfStudentId: r.studentId, data: { studentName: personName(r.student.person), decision: DECISION_LABEL[b.decision] }, link: '/familia/medicacion', entity: 'medication_request', entityId: id, dedupeKey: `medreview:${id}` });
      await this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: `meds.request_${b.decision.toLowerCase()}d`, entity: 'medication_request', entityId: id, after: { status, checks: b.checks }, meta });
      return updated;
    });
  }

  async receiveCustody(user: AuthUser, b: z.infer<typeof custodyReceiveSchema>, meta: RequestMeta) {
    return this.prisma.forUser(user, async (tx) => {
      const r = await tx.medicationRequest.findUnique({ where: { id: b.requestId } });
      if (!r) throw notFound('Solicitud');
      if (!['APPROVED', 'ACTIVE'].includes(r.status)) throw conflict('REQUEST_NOT_APPROVED', 'La solicitud debe estar aprobada para recibir el medicamento.');
      if (!b.packagingIntact || !b.labeled) throw unprocessable('PACKAGING_REJECTED', 'No se recibe: el envase debe estar íntegro y rotulado con el nombre del estudiante.');
      const tz = await this.settings.timezone(tx, user.tenantId);
      if (b.expiryDate < dateInTz(new Date(), tz)) throw unprocessable('EXPIRED_MEDICATION', 'No se recibe un medicamento vencido.');
      const custody = await tx.medicationCustody.create({
        data: { tenantId: user.tenantId, requestId: r.id, quantityReceived: b.quantity, quantityRemaining: b.quantity, unit: b.unit, lot: b.lot, expiryDate: new Date(b.expiryDate), deliveredBy: b.deliveredBy, receivedByUserId: user.id, storage: b.storage, locationId: b.locationId ?? null, packagingIntact: b.packagingIntact, labeled: b.labeled, notes: b.notes ?? null },
      });
      if (r.status === 'APPROVED') {
        await tx.medicationRequest.update({ where: { id: r.id }, data: { status: 'ACTIVE' } });
        await this.generateSchedule(tx, user.tenantId, r.id);
      }
      await this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: 'meds.custody_received', entity: 'medication_custody', entityId: custody.id, after: { requestId: r.id, quantity: b.quantity, lot: b.lot, expiry: b.expiryDate }, meta });
      return custody;
    });
  }

  async returnCustody(user: AuthUser, custodyId: string, b: z.infer<typeof custodyReturnSchema>, meta: RequestMeta) {
    return this.prisma.forUser(user, async (tx) => {
      const c = await tx.medicationCustody.findUnique({ where: { id: custodyId } });
      if (!c) throw notFound('Custodia');
      if (c.closedAt) throw conflict('CUSTODY_CLOSED', 'La custodia ya fue cerrada.');
      const updated = await tx.medicationCustody.update({ where: { id: custodyId }, data: { closedAt: new Date(), closeAction: b.action, closeQuantity: b.quantity, closeReceivedBy: b.receivedBy, closeNotes: b.notes ?? null, quantityRemaining: 0 } });
      await this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: 'meds.custody_closed', entity: 'medication_custody', entityId: custodyId, after: { action: b.action, quantity: b.quantity }, meta });
      return updated;
    });
  }

  async changeStatus(user: AuthUser, id: string, b: z.infer<typeof medicationStatusChangeSchema>, meta: RequestMeta) {
    return this.prisma.forUser(user, async (tx) => {
      const r = await tx.medicationRequest.findUnique({ where: { id } });
      if (!r) throw notFound('Solicitud');
      const isParent = hasRole(user, 'PARENT') && (await this.access.childrenIds(tx, user)).includes(r.studentId);
      if (!isClinical(user) && !(isParent && b.status === 'CANCELLED')) throw forbidden();
      if (['COMPLETED', 'CANCELLED', 'REJECTED'].includes(r.status)) throw conflict('REQUEST_CLOSED', 'La solicitud ya está cerrada.');
      const updated = await tx.medicationRequest.update({ where: { id }, data: { status: b.status, statusReason: b.reason } });
      if (b.status !== 'ACTIVE') await tx.medicationSchedule.updateMany({ where: { requestId: id, status: 'PENDING', scheduledFor: { gt: new Date() } }, data: { status: 'CANCELLED' } });
      else await this.generateSchedule(tx, user.tenantId, id);
      await this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: 'meds.request_status_changed', entity: 'medication_request', entityId: id, before: { status: r.status }, after: { status: b.status }, meta });
      return updated;
    });
  }

  /** Materializes today's doses (idempotent by request+time). */
  async generateSchedule(tx: Tx, tenantId: string, requestId?: string) {
    const tz = await this.settings.timezone(tx, tenantId);
    const today = dateInTz(new Date(), tz);
    const requests = await tx.medicationRequest.findMany({ where: { status: 'ACTIVE', isPrn: false, ...(requestId ? { id: requestId } : {}) } });
    let created = 0;
    const dow = new Date(`${today}T12:00:00Z`).getUTCDay();
    for (const r of requests) {
      const localDay = new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1, Number(today.slice(8, 10)));
      const doses = dosesForDay({ frequency: r.frequency, times: r.times, daysOfWeek: r.daysOfWeek, startDate: r.startDate.toISOString().slice(0, 10) + 'T00:00:00', endDate: r.endDate.toISOString().slice(0, 10) + 'T00:00:00', isPrn: r.isPrn }, localDay);
      void dow;
      for (const d of doses) {
        const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        const scheduledFor = zonedToUtc(today, hhmm, tz);
        const res = await tx.medicationSchedule.createMany({ data: [{ tenantId, requestId: r.id, studentId: r.studentId, scheduledFor }], skipDuplicates: true });
        created += res.count;
      }
    }
    return { created };
  }

  async today(user: AuthUser, date?: string) {
    return this.prisma.forUser(user, async (tx) => {
      const tz = await this.settings.timezone(tx, user.tenantId);
      const day = date ?? dateInTz(new Date(), tz);
      if (!date || date === dateInTz(new Date(), tz)) await this.generateSchedule(tx, user.tenantId);
      const { start, end } = dayBounds(day, tz);
      const settings = await this.settings.get(tx, user.tenantId);
      const rows = await tx.medicationSchedule.findMany({
        where: { scheduledFor: { gte: start, lt: end }, status: { not: 'CANCELLED' } },
        include: { request: { include: { student: { include: { ...studentInclude, person: { include: { allergies: { where: { active: true } } } } } }, custody: { where: { closedAt: null } } } }, administrations: true },
        orderBy: { scheduledFor: 'asc' },
      });
      const now = Date.now();
      const scheduled = rows.map((s) => {
        const diff = (now - s.scheduledFor.getTime()) / 60000;
        return {
          id: s.id,
          scheduledFor: s.scheduledFor,
          time: timeInTz(s.scheduledFor, tz),
          status: s.status,
          dueNow: s.status === 'PENDING' && Math.abs(diff) <= settings.medicationTimeWindowMinutes,
          overdue: s.status === 'PENDING' && diff > settings.medicationTimeWindowMinutes,
          request: this.requestCard(s.request),
          student: studentSummary(s.request.student, { photosEnabled: this.photos.enabled }),
          allergies: s.request.student.person.allergies.map((a) => a.agent),
          administration: s.administrations[0] ?? null,
        };
      });
      const prn = await tx.medicationRequest.findMany({ where: { status: 'ACTIVE', isPrn: true }, include: { student: { include: studentInclude }, custody: { where: { closedAt: null } } }, orderBy: { student: { person: { lastName: 'asc' } } } });
      const pending = await tx.medicationRequest.count({ where: { status: { in: ['SUBMITTED', 'APPROVED'] } } });
      return {
        date: day,
        windowMinutes: settings.medicationTimeWindowMinutes,
        scheduled,
        prn: prn.map((r) => ({ request: this.requestCard(r), student: studentSummary(r.student, { photosEnabled: this.photos.enabled }) })),
        pendingReview: pending,
        counts: { total: scheduled.length, given: scheduled.filter((s) => s.status === 'GIVEN').length, pending: scheduled.filter((s) => s.status === 'PENDING').length, overdue: scheduled.filter((s) => s.overdue).length },
      };
    });
  }

  private requestCard(r: MedicationRequest & { custody: { quantityRemaining: number; expiryDate: Date; unit: string }[] }) {
    return {
      id: r.id,
      medicationName: r.medicationName,
      catalogId: r.catalogId,
      dose: r.dose,
      doseUnit: r.doseUnit,
      route: r.route,
      routeLabel: ROUTE_LABELS[r.route as Route],
      isPrn: r.isPrn,
      prnCriteria: r.prnCriteria,
      controlled: r.controlled,
      selfAdministration: r.selfAdministration,
      custodyRemaining: r.custody.reduce((a, c) => a + c.quantityRemaining, 0),
      custodyExpiry: r.custody.map((c) => c.expiryDate).sort((a, b) => a.getTime() - b.getTime())[0] ?? null,
    };
  }

  async administer(user: AuthUser, b: z.infer<typeof administrationSchema>, meta: RequestMeta) {
    return this.prisma.forUser(user, async (tx) => {
      const r = await tx.medicationRequest.findUnique({ where: { id: b.requestId }, include: { student: { include: { person: true } }, custody: { where: { closedAt: null }, orderBy: { expiryDate: 'asc' } } } });
      if (!r) throw notFound('Autorización de medicamento');
      const settings = await this.settings.get(tx, user.tenantId);
      const tz = await this.settings.timezone(tx, user.tenantId);
      const now = new Date();
      let schedule = b.scheduleId ? await tx.medicationSchedule.findUnique({ where: { id: b.scheduleId } }) : null;
      if (b.scheduleId && (!schedule || schedule.requestId !== r.id)) throw notFound('Dosis programada');
      if (schedule && schedule.status !== 'PENDING') throw conflict('DOSE_ALREADY_RECORDED', 'Esta dosis ya fue registrada.');

      const { start } = dayBounds(dateInTz(now, tz), tz);
      const givenToday = await tx.medicationAdministration.findMany({ where: { requestId: r.id, outcome: 'GIVEN', administeredAt: { gte: start } }, orderBy: { administeredAt: 'desc' } });
      const allergies = await tx.allergy.findMany({ where: { personId: r.student.personId, active: true } });
      const custody = r.custody.find((c) => c.quantityRemaining > 0) ?? null;
      const verification = verifyFiveRights(
        { id: r.id, studentId: r.studentId, medicationName: r.medicationName, catalogId: r.catalogId, activeIngredient: r.activeIngredient, dose: r.dose, doseUnit: r.doseUnit, route: r.route as Route, status: r.status, isPrn: r.isPrn, startDate: dateInTz(r.startDate, 'UTC') + 'T00:00:00', endDate: dateInTz(r.endDate, 'UTC') + 'T23:59:59', maxDosesPerDay: r.maxDosesPerDay, minIntervalMinutes: r.minIntervalMinutes },
        { scannedStudentId: b.scannedStudentId, medicationName: b.medicationName, catalogId: b.catalogId ?? (r.catalogId && b.medicationName === r.medicationName ? r.catalogId : null), dose: b.dose, doseUnit: b.doseUnit, route: b.route, at: now, scheduledFor: schedule?.scheduledFor ?? null },
        { allergies, batchExpiry: custody?.expiryDate ?? null, dosesGivenToday: givenToday.length, lastGivenAt: givenToday[0]?.administeredAt ?? null, timeWindowMinutes: settings.medicationTimeWindowMinutes },
      );

      if (b.outcome === 'GIVEN') {
        if (!verification.ok) throw new Problem(422, 'FIVE_RIGHTS_FAILED', 'La verificación de los 5 correctos no se cumple. No administre.', { verification });
        if (!r.selfAdministration && !r.custody.length && r.storage !== 'STUDENT_CARRIES') throw conflict('NO_CUSTODY', 'No hay medicamento en custodia para esta autorización.');
        if (r.controlled && !b.witnessUserId) throw unprocessable('WITNESS_REQUIRED', 'Los medicamentos de control requieren testigo (doble verificación).');
        if (b.witnessUserId === user.id) throw unprocessable('WITNESS_INVALID', 'El testigo debe ser otra persona.');
        if (b.selfAdministered && !r.selfAdministration) throw forbidden('La autoadministración no está autorizada para este medicamento.');
      }
      const adm = await tx.medicationAdministration.create({
        data: {
          tenantId: user.tenantId,
          requestId: r.id,
          scheduleId: schedule?.id ?? null,
          studentId: r.studentId,
          custodyId: custody?.id ?? null,
          encounterId: b.encounterId ?? null,
          administeredAt: now,
          administeredByUserId: user.id,
          witnessUserId: b.witnessUserId ?? null,
          dose: b.dose,
          doseUnit: b.doseUnit,
          route: b.route,
          outcome: b.outcome,
          reason: b.reason ?? null,
          adverseEffects: b.adverseEffects ?? null,
          verification: JSON.parse(JSON.stringify(verification)),
          selfAdministered: b.selfAdministered,
          notes: b.notes ?? null,
        },
      });
      if (schedule) schedule = await tx.medicationSchedule.update({ where: { id: schedule.id }, data: { status: b.outcome } });
      if (b.outcome === 'GIVEN' && custody) await tx.medicationCustody.update({ where: { id: custody.id }, data: { quantityRemaining: Math.max(0, custody.quantityRemaining - 1) } });
      const studentName = personName(r.student.person);
      const scheduled = timeInTz(schedule?.scheduledFor ?? now, tz);
      await this.notify.notify(tx, {
        tenantId: user.tenantId,
        event: b.outcome === 'GIVEN' ? 'DOSE_GIVEN' : 'DOSE_OMITTED',
        guardiansOfStudentId: r.studentId,
        data: { studentName, scheduled },
        link: '/familia/medicacion',
        entity: 'medication_administration',
        entityId: adm.id,
        dedupeKey: `dose:${adm.id}`,
      });
      if (b.adverseEffects) {
        await this.notify.notify(tx, { tenantId: user.tenantId, event: 'OBSERVATION_RECHECK', roles: ['DOCTOR', 'HEALTH_COORDINATOR'], data: { studentName }, channels: ['IN_APP'], link: `/estudiantes/${r.studentId}`, entity: 'medication_administration', entityId: adm.id });
      }
      await this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: 'meds.dose_recorded', entity: 'medication_administration', entityId: adm.id, after: { outcome: b.outcome, requestId: r.id, ok: verification.ok, hash: adm.hash }, meta });
      this.realtime.nursing(user.tenantId, 'meds:updated', { scheduleId: schedule?.id ?? null, requestId: r.id });
      return { ...adm, seq: adm.seq?.toString() ?? null, verification };
    });
  }

  async omissionCheck(tenantId: string) {
    return this.prisma.forTenant(tenantId, async (tx) => {
      const s = await this.settings.get(tx, tenantId);
      const tz = await this.settings.timezone(tx, tenantId);
      await this.generateSchedule(tx, tenantId);
      const late = await tx.medicationSchedule.findMany({ where: { status: 'PENDING', alertedAt: null, scheduledFor: { lt: new Date(Date.now() - s.medicationOmissionAlertMinutes * 60_000) } }, include: { request: { include: { student: { include: { person: true } } } } } });
      for (const d of late) {
        await tx.medicationSchedule.update({ where: { id: d.id }, data: { alertedAt: new Date() } });
        await this.notify.notify(tx, { tenantId, event: 'DOSE_OMITTED', roles: ['NURSE'], channels: ['IN_APP'], urgent: true, data: { studentName: personName(d.request.student.person), scheduled: timeInTz(d.scheduledFor, tz) }, link: '/enfermeria/medicacion', entity: 'medication_schedule', entityId: d.id, dedupeKey: `omit-nurse:${d.id}` });
        this.realtime.nursing(tenantId, 'meds:overdue', { scheduleId: d.id });
      }
      const missed = await tx.medicationSchedule.findMany({ where: { status: 'PENDING', scheduledFor: { lt: new Date(Date.now() - 3 * 3600_000) } }, include: { request: { include: { student: { include: { person: true } } } } } });
      for (const d of missed) {
        await tx.medicationSchedule.update({ where: { id: d.id }, data: { status: 'MISSED' } });
        await this.notify.notify(tx, { tenantId, event: 'DOSE_OMITTED', guardiansOfStudentId: d.studentId, data: { studentName: personName(d.request.student.person), scheduled: timeInTz(d.scheduledFor, tz) }, link: '/familia/medicacion', entity: 'medication_schedule', entityId: d.id, dedupeKey: `omit-guardian:${d.id}` });
      }
      return { alerted: late.length, missed: missed.length };
    });
  }

  async expiringCheck(tenantId: string) {
    return this.prisma.forTenant(tenantId, async (tx) => {
      const tz = await this.settings.timezone(tx, tenantId);
      const limit = new Date(`${addDays(dateInTz(new Date(), tz), 15)}T00:00:00Z`);
      const rows = await tx.medicationCustody.findMany({ where: { closedAt: null, expiryDate: { lte: limit } }, include: { request: { include: { student: { include: { person: true } } } } } });
      for (const c of rows) {
        await this.notify.notify(tx, { tenantId, event: 'MEDICATION_EXPIRING', guardiansOfStudentId: c.request.studentId, data: { studentName: personName(c.request.student.person), date: dateInTz(c.expiryDate, 'UTC') }, link: '/familia/medicacion', entity: 'medication_custody', entityId: c.id, dedupeKey: `expiring:${c.id}` });
      }
      return { expiring: rows.length };
    });
  }

  async mar(user: AuthUser, studentId: string, month: string) {
    return this.prisma.forUser(user, async (tx) => {
      const s = await this.childAccess(tx, user, studentId);
      const tz = await this.settings.timezone(tx, user.tenantId);
      const start = dayBounds(`${month}-01`, tz).start;
      const [y, m] = month.split('-').map(Number);
      const end = dayBounds(new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10), tz).start;
      const admins = await tx.medicationAdministration.findMany({ where: { studentId, administeredAt: { gte: start, lt: end } }, include: { request: { select: { medicationName: true, dose: true, doseUnit: true } } }, orderBy: { administeredAt: 'asc' } });
      const users = await tx.user.findMany({ where: { id: { in: admins.map((a) => a.administeredByUserId) } }, select: { id: true, firstName: true, lastName: true } });
      return {
        student: studentSummary(s, { photosEnabled: this.photos.enabled }),
        month,
        rows: admins.map((a) => ({
          id: a.id,
          date: dateInTz(a.administeredAt, tz),
          time: timeInTz(a.administeredAt, tz),
          medication: a.request.medicationName,
          dose: `${a.dose} ${a.doseUnit}`,
          route: ROUTE_LABELS[a.route as Route],
          outcome: a.outcome,
          reason: a.reason,
          by: users.find((u) => u.id === a.administeredByUserId) ? personName(users.find((u) => u.id === a.administeredByUserId)!) : '',
          hash: a.hash,
        })),
      };
    });
  }

  async marPdf(user: AuthUser, studentId: string, month: string) {
    const data = await this.mar(user, studentId, month);
    const tenant = await this.prisma.forUser(user, (tx) => tx.tenant.findUniqueOrThrow({ where: { id: user.tenantId } }));
    const doc = createPdf('Constancia mensual de administración de medicamentos', `${tenant.name} · ${month}`);
    section(doc, 'Estudiante');
    field(doc, 'Nombre', data.student.name);
    field(doc, 'Código / grupo', `${data.student.code} · ${data.student.group?.name ?? ''}`);
    section(doc, 'Registro (MAR)');
    const OUT = { GIVEN: 'Administrada', REFUSED: 'Rechazada', OMITTED: 'Omitida', HELD: 'Suspendida' } as Record<string, string>;
    table(doc, ['Fecha', 'Hora', 'Medicamento', 'Dosis', 'Vía', 'Resultado', 'Responsable'], data.rows.map((r) => [r.date, r.time, r.medication, r.dose, r.route, `${OUT[r.outcome] ?? r.outcome}${r.reason ? ` (${r.reason})` : ''}`, r.by]), [58, 38, 130, 55, 55, 100, 76]);
    section(doc, 'Resumen');
    field(doc, 'Dosis administradas', data.rows.filter((r) => r.outcome === 'GIVEN').length);
    field(doc, 'Dosis no administradas', data.rows.filter((r) => r.outcome !== 'GIVEN').length);
    footer(doc, `${tenant.name} · Cada registro está protegido con cadena de hash SHA-256`);
    return pdfToBuffer(doc);
  }
}
