import { Injectable } from '@nestjs/common';
import type { Encounter, Tx } from '@sgee/db';
import {
  ACCIDENT_SEVERITY_LABELS,
  ageInYears,
  classifyAll,
  DISPOSITION_LABELS,
  type Disposition,
  type encounterCloseSchema,
  type encounterCreateSchema,
  type encounterQuerySchema,
  type encounterUpdateSchema,
  ENCOUNTER_TYPE_LABELS,
  type EncounterType,
  type observationStartSchema,
  PHYSICAL_EXAM_SYSTEMS,
  profileFor,
  type vitalSignsSchema,
  VITAL_META,
  type VitalKey,
  dayBounds,
  timeInTz,
  dateInTz,
} from '@sgee/shared';
import type { z } from 'zod';
import { AccessService } from '../../common/access.service';
import { AuditService } from '../../common/audit.service';
import { type AuthUser, can, hasRole, type RequestMeta } from '../../common/auth';
import { badRequest, conflict, forbidden, notFound, unprocessable } from '../../common/errors';
import { createPdf, field, footer, paragraph, pdfToBuffer, section, table, watermark } from '../../common/pdf';
import { PrismaService } from '../../common/prisma.service';
import { personName, studentInclude, studentSummary } from '../../common/serializers';
import { TenantSettingsService } from '../../common/tenant-settings.service';
import { NotifyService } from '../comms/notify.service';
import { PhotoService } from '../files/storage.service';
import { actorOf, FlowService } from '../flow/flow.service';
import { InventoryService } from '../inventory/inventory.service';
import { RealtimeService } from '../realtime/live.gateway';

const OPEN = ['OPEN', 'OBSERVATION'];

@Injectable()
export class EncountersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly notify: NotifyService,
    private readonly flow: FlowService,
    private readonly inventory: InventoryService,
    private readonly realtime: RealtimeService,
    private readonly settings: TenantSettingsService,
    private readonly photos: PhotoService,
  ) {}

  private async load(tx: Tx, id: string) {
    const e = await tx.encounter.findUnique({ where: { id } });
    if (!e) throw notFound('Atención');
    return e;
  }

  private assertOpen(e: Encounter) {
    if (!OPEN.includes(e.status)) throw conflict('ENCOUNTER_CLOSED', 'La atención está cerrada. Registre una adenda para agregar información.');
  }

  async create(user: AuthUser, b: z.infer<typeof encounterCreateSchema>, meta: RequestMeta) {
    return this.prisma.forUser(user, async (tx) => {
      let personId: string;
      let studentId: string | null = null;
      if (b.subjectType === 'STUDENT') {
        const s = await this.access.assertStudent(tx, user, b.studentId!, 'clinical', meta);
        personId = s.personId;
        studentId = s.id;
        const open = await tx.encounter.findFirst({ where: { personId, status: { in: OPEN } } });
        if (open) throw conflict('ENCOUNTER_ALREADY_OPEN', 'El estudiante ya tiene una atención abierta.', { encounterId: open.id });
      } else {
        const p = await tx.person.findUnique({ where: { id: b.staffPersonId! } });
        if (!p || p.kind !== 'STAFF') throw notFound('Persona del personal');
        personId = p.id;
      }
      let passId: string | null = null;
      if (b.passId) {
        const pass = await tx.pass.findUnique({ where: { id: b.passId } });
        if (!pass || pass.studentId !== studentId) throw badRequest('PASS_MISMATCH', 'El pase no corresponde al estudiante.');
        if (await tx.encounter.findUnique({ where: { passId: pass.id } })) throw conflict('PASS_HAS_ENCOUNTER', 'El pase ya tiene una atención.');
        let current = pass;
        if (['REQUESTED', 'IN_TRANSIT'].includes(current.state)) current = await this.flow.applyTransition(tx, current, 'RECEIVED', actorOf(user, meta));
        if (current.state === 'RECEIVED') current = await this.flow.applyTransition(tx, current, 'IN_CARE', actorOf(user, meta));
        passId = pass.id;
      } else if (studentId) {
        const pass = await tx.pass.findFirst({ where: { studentId, state: { in: ['REQUESTED', 'IN_TRANSIT', 'RECEIVED'] }, encounter: null } });
        if (pass) {
          let current = pass;
          if (current.state !== 'RECEIVED') current = await this.flow.applyTransition(tx, current, 'RECEIVED', actorOf(user, meta));
          await this.flow.applyTransition(tx, current, 'IN_CARE', actorOf(user, meta));
          passId = pass.id;
        }
      }
      const e = await tx.encounter.create({
        data: {
          tenantId: user.tenantId,
          personId,
          studentId,
          subjectType: b.subjectType,
          passId,
          type: b.type,
          chiefComplaint: b.chiefComplaint,
          templateKey: b.templateKey ?? null,
          referredBy: b.referredBy ?? null,
          referredFrom: b.referredFrom ?? null,
          startedAt: b.startedAt ? new Date(b.startedAt) : new Date(),
          attendedByUserId: user.id,
          isMentalHealth: b.type === 'MENTAL_HEALTH',
          createdBy: user.id,
        },
      });
      await this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: 'clinical.encounter_created', entity: 'encounter', entityId: e.id, after: { type: e.type, passId, subjectType: b.subjectType }, meta });
      this.realtime.nursing(user.tenantId, 'encounter:updated', { id: e.id, status: e.status });
      return this.detailTx(tx, user, e.id, meta, false);
    });
  }

  async list(user: AuthUser, q: z.infer<typeof encounterQuerySchema>) {
    return this.prisma.forUser(user, async (tx) => {
      const tz = await this.settings.timezone(tx, user.tenantId);
      const where: Record<string, unknown> = {};
      if (q.status) where.status = q.status;
      if (q.studentId) where.studentId = q.studentId;
      if (q.from || q.to) where.startedAt = { gte: q.from ? dayBounds(q.from, tz).start : undefined, lt: q.to ? dayBounds(q.to, tz).end : undefined };
      if (q.q) where.OR = [{ chiefComplaint: { contains: q.q, mode: 'insensitive' } }, { person: { OR: [{ firstName: { contains: q.q, mode: 'insensitive' } }, { lastName: { contains: q.q, mode: 'insensitive' } }] } }];
      if (!can(user, 'encounters:read')) {
        if (!hasRole(user, 'PARENT')) throw forbidden();
        where.studentId = { in: q.studentId ? [(await this.access.childrenIds(tx, user)).find((c) => c === q.studentId) ?? '00000000-0000-0000-0000-000000000000'] : await this.access.childrenIds(tx, user) };
        where.isMentalHealth = false;
        where.status = 'CLOSED';
      }
      if (!can(user, 'mental_health:read') && can(user, 'encounters:read')) where.isMentalHealth = where.isMentalHealth ?? undefined;
      const rows = await tx.encounter.findMany({
        where,
        include: { person: { include: { student: { include: studentInclude } } }, diagnoses: { where: { primary: true } }, incident: { select: { place: true, severity: true } } },
        orderBy: { startedAt: 'desc' },
        take: q.limit + 1,
        ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      });
      const parent = !can(user, 'encounters:read');
      const items = rows.slice(0, q.limit).map((e) => ({
        id: e.id,
        status: e.status,
        type: e.type,
        typeLabel: ENCOUNTER_TYPE_LABELS[e.type as EncounterType] ?? e.type,
        chiefComplaint: e.chiefComplaint,
        startedAt: e.startedAt,
        endedAt: e.endedAt,
        disposition: e.disposition,
        dispositionLabel: e.disposition ? DISPOSITION_LABELS[e.disposition as Disposition] : null,
        subjectType: e.subjectType,
        name: personName(e.person),
        student: e.person.student ? studentSummary(e.person.student, { photosEnabled: this.photos.enabled }) : null,
        diagnosis: parent ? null : (e.diagnoses[0] ? `${e.diagnoses[0].code} ${e.diagnoses[0].description}` : null),
        accident: e.incident ? { place: e.incident.place, severity: ACCIDENT_SEVERITY_LABELS[e.incident.severity as 'MILD'] } : null,
        historical: e.isHistorical,
        attendedBy: e.attendedByName,
        parentSummary: e.parentSummary,
        isMentalHealth: e.isMentalHealth,
      }));
      return { items, nextCursor: rows.length > q.limit ? rows[q.limit - 1].id : null };
    });
  }

  async detail(user: AuthUser, id: string, meta: RequestMeta) {
    return this.prisma.forUser(user, (tx) => this.detailTx(tx, user, id, meta, true));
  }

  private async detailTx(tx: Tx, user: AuthUser, id: string, meta: RequestMeta, log: boolean) {
    const e = await tx.encounter.findUnique({
      where: { id },
      include: {
        person: { include: { student: { include: studentInclude }, allergies: { where: { active: true } }, conditions: { where: { active: true } }, healthProfile: true } },
        vitals: { orderBy: { takenAt: 'asc' } },
        diagnoses: true,
        procedures: true,
        notes: { orderBy: { createdAt: 'asc' } },
        attachments: true,
        observations: { orderBy: { startedAt: 'asc' } },
        referrals: true,
        incident: true,
        pass: { include: { exitAuthorization: true } },
      },
    });
    if (!e) throw notFound('Atención');
    const isParent = !can(user, 'encounters:read');
    if (isParent) {
      if (!e.studentId || !(await this.access.childrenIds(tx, user)).includes(e.studentId) || e.isMentalHealth || e.status === 'OPEN') throw forbidden();
    } else if (e.isMentalHealth && !can(user, 'mental_health:read', 'clinical:write')) throw forbidden();
    if (log) await tx.clinicalAccessLog.create({ data: { tenantId: user.tenantId, userId: user.id, personId: e.personId, resource: 'encounter', ip: meta.ip, userAgent: meta.userAgent?.slice(0, 300), outOfRole: false } });

    const age = e.person.birthDate ? ageInYears(e.person.birthDate, e.startedAt) : 30;
    const userIds = [e.attendedByUserId, e.signedByUserId, e.annulledBy, ...e.notes.map((n) => n.authorId)].filter((x): x is string => !!x);
    const users = await tx.user.findMany({ where: { id: { in: userIds } }, select: { id: true, firstName: true, lastName: true } });
    const nameOf = (uid: string | null) => (uid ? (users.find((u) => u.id === uid) ? personName(users.find((u) => u.id === uid)!) : null) : null);
    const itemIds = (e.treatments as { itemId?: string }[]).map((t) => t.itemId).filter((x): x is string => !!x);
    const items = itemIds.length ? await tx.item.findMany({ where: { id: { in: itemIds } }, select: { id: true, name: true, unit: true } }) : [];

    if (isParent) {
      return {
        id: e.id,
        status: e.status,
        startedAt: e.startedAt,
        endedAt: e.endedAt,
        chiefComplaint: e.chiefComplaint,
        typeLabel: ENCOUNTER_TYPE_LABELS[e.type as EncounterType],
        dispositionLabel: e.disposition ? DISPOSITION_LABELS[e.disposition as Disposition] : null,
        parentSummary: e.parentSummary,
        attendedBy: nameOf(e.attendedByUserId) ?? e.attendedByName,
        vitals: e.vitals.map((v) => ({ takenAt: v.takenAt, temperatureC: v.temperatureC })),
        treatments: e.treatments,
        referral: e.referrals[0] ? { destination: e.referrals[0].destination, transport: e.referrals[0].transport } : null,
        student: e.person.student ? studentSummary(e.person.student, { photosEnabled: this.photos.enabled }) : null,
      };
    }
    return {
      ...e,
      seq: e.seq?.toString() ?? null,
      typeLabel: ENCOUNTER_TYPE_LABELS[e.type as EncounterType],
      dispositionLabel: e.disposition ? DISPOSITION_LABELS[e.disposition as Disposition] : null,
      patient: {
        personId: e.personId,
        name: personName(e.person),
        sex: e.person.sex,
        age,
        student: e.person.student ? studentSummary(e.person.student, { photosEnabled: this.photos.enabled }) : null,
        allergies: e.person.allergies,
        conditions: e.person.conditions,
        bloodType: e.person.healthProfile?.bloodType ?? null,
        anaphylaxis: e.person.allergies.some((a) => a.severity === 'ANAPHYLAXIS' || a.requiresEpinephrine),
      },
      person: undefined,
      vitals: e.vitals.map((v) => ({ ...v, levels: classifyAll(v as unknown as Partial<Record<VitalKey, number | null>>, age).levels })),
      notes: e.notes.map((n) => ({ ...n, author: nameOf(n.authorId) })),
      treatments: (e.treatments as { description: string; itemId?: string; quantity?: number }[]).map((t) => ({ ...t, item: items.find((i) => i.id === t.itemId) ?? null })),
      attendedBy: nameOf(e.attendedByUserId) ?? e.attendedByName,
      signedBy: nameOf(e.signedByUserId),
      annulledByName: nameOf(e.annulledBy),
      physicalExamSystems: PHYSICAL_EXAM_SYSTEMS,
      pass: e.pass ? { id: e.pass.id, state: e.pass.state, code: e.pass.code, requestedAt: e.pass.requestedAt, subject: e.pass.subject, exitAuthorization: e.pass.exitAuthorization } : null,
    };
  }

  async update(user: AuthUser, id: string, b: z.infer<typeof encounterUpdateSchema>, meta: RequestMeta) {
    return this.prisma.forUser(user, async (tx) => {
      const e = await this.load(tx, id);
      this.assertOpen(e);
      const { diagnoses, incident, treatments, physicalExam, ...rest } = b;
      if (treatments) {
        for (const t of treatments) if (t.itemId && !(await tx.item.findUnique({ where: { id: t.itemId } }))) throw notFound('Ítem de inventario');
      }
      await tx.encounter.update({ where: { id }, data: { ...rest, ...(physicalExam ? { physicalExam } : {}), ...(treatments ? { treatments } : {}), ...(b.type === 'MENTAL_HEALTH' ? { isMentalHealth: true } : {}) } });
      if (diagnoses) {
        await tx.encounterDiagnosis.deleteMany({ where: { encounterId: id } });
        if (diagnoses.length) {
          const hasPrimary = diagnoses.some((d) => d.primary);
          await tx.encounterDiagnosis.createMany({ data: diagnoses.map((d, i) => ({ tenantId: user.tenantId, encounterId: id, system: d.system, code: d.code.toUpperCase(), description: d.description, primary: hasPrimary ? d.primary : i === 0 })) });
        }
      }
      if (incident !== undefined) {
        if (incident) {
          const data = { place: incident.place, activity: incident.activity ?? null, mechanism: incident.mechanism, severity: incident.severity, witnesses: incident.witnesses, supervisingStaff: incident.supervisingStaff ?? null, insuranceNotified: incident.insuranceNotified, workAccidentReport: incident.workAccidentReport, preventiveActions: incident.preventiveActions ?? null };
          await tx.incidentReport.upsert({ where: { encounterId: id }, create: { tenantId: user.tenantId, encounterId: id, ...data }, update: data });
        }
      }
      await this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: 'clinical.encounter_updated', entity: 'encounter', entityId: id, after: { fields: Object.keys(b) }, meta });
      return this.detailTx(tx, user, id, meta, false);
    });
  }

  async addVitals(user: AuthUser, id: string, b: z.infer<typeof vitalSignsSchema>, meta: RequestMeta) {
    return this.prisma.forUser(user, async (tx) => {
      const e = await this.load(tx, id);
      this.assertOpen(e);
      const keys = Object.keys(VITAL_META) as VitalKey[];
      if (!keys.some((k) => b[k] !== undefined && b[k] !== null)) throw unprocessable('VITALS_EMPTY', 'Registre al menos un signo vital.');
      const person = await tx.person.findUniqueOrThrow({ where: { id: e.personId } });
      const age = person.birthDate ? ageInYears(person.birthDate) : 30;
      const { levels, worst } = classifyAll(b as Partial<Record<VitalKey, number | null>>, age);
      const v = await tx.vitalSign.create({ data: { tenantId: user.tenantId, encounterId: id, takenAt: b.takenAt ? new Date(b.takenAt) : new Date(), ...Object.fromEntries(keys.map((k) => [k, b[k] ?? null])), worstLevel: worst, takenBy: user.id } });
      await this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: 'clinical.vitals_recorded', entity: 'vital_sign', entityId: v.id, after: { encounterId: id, worst }, meta });
      if (worst === 'critical') this.realtime.nursing(user.tenantId, 'vitals:critical', { encounterId: id });
      return { ...v, levels, worst };
    });
  }

  async startObservation(user: AuthUser, id: string, b: z.infer<typeof observationStartSchema>, meta: RequestMeta) {
    return this.prisma.forUser(user, async (tx) => {
      const e = await this.load(tx, id);
      this.assertOpen(e);
      if (await tx.observationPeriod.findFirst({ where: { encounterId: id, endedAt: null } })) throw conflict('OBSERVATION_ACTIVE', 'Ya hay una observación en curso.');
      const o = await tx.observationPeriod.create({ data: { tenantId: user.tenantId, encounterId: id, reason: b.reason, dueAt: new Date(Date.now() + b.minutes * 60_000) } });
      await tx.encounter.update({ where: { id }, data: { status: 'OBSERVATION' } });
      if (e.passId) {
        const pass = await tx.pass.findUniqueOrThrow({ where: { id: e.passId } });
        if (pass.state === 'IN_CARE') await this.flow.applyTransition(tx, pass, 'OBSERVATION', actorOf(user, meta), b.reason);
      }
      await this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: 'clinical.observation_started', entity: 'encounter', entityId: id, after: { minutes: b.minutes }, meta });
      this.realtime.nursing(user.tenantId, 'encounter:updated', { id, status: 'OBSERVATION' });
      return o;
    });
  }

  async endObservation(user: AuthUser, id: string, outcome: string, meta: RequestMeta) {
    return this.prisma.forUser(user, async (tx) => {
      const e = await this.load(tx, id);
      const o = await tx.observationPeriod.findFirst({ where: { encounterId: id, endedAt: null } });
      if (!o) throw conflict('NO_OBSERVATION', 'No hay observación en curso.');
      await tx.observationPeriod.update({ where: { id: o.id }, data: { endedAt: new Date(), outcome, recheckedBy: user.id } });
      await tx.encounterNote.create({ data: { tenantId: user.tenantId, encounterId: id, kind: 'OBSERVATION_RECHECK', note: outcome, authorId: user.id } });
      if (e.status === 'OBSERVATION') await tx.encounter.update({ where: { id }, data: { status: 'OPEN' } });
      if (e.passId) {
        const pass = await tx.pass.findUniqueOrThrow({ where: { id: e.passId } });
        if (pass.state === 'OBSERVATION') await this.flow.applyTransition(tx, pass, 'IN_CARE', actorOf(user, meta), 'Fin de observación');
      }
      await this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: 'clinical.observation_ended', entity: 'encounter', entityId: id, meta });
      this.realtime.nursing(user.tenantId, 'encounter:updated', { id, status: 'OPEN' });
      return { ended: true };
    });
  }

  async addNote(user: AuthUser, id: string, note: string, meta: RequestMeta) {
    return this.prisma.forUser(user, async (tx) => {
      const e = await this.load(tx, id);
      if (e.status === 'ANNULLED') throw conflict('ENCOUNTER_ANNULLED', 'La atención está anulada.');
      const n = await tx.encounterNote.create({ data: { tenantId: user.tenantId, encounterId: id, kind: e.status === 'CLOSED' ? 'ADDENDUM' : 'EVOLUTION', note, authorId: user.id } });
      await this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: 'clinical.encounter_note_added', entity: 'encounter_note', entityId: n.id, after: { encounterId: id, kind: n.kind }, meta });
      return n;
    });
  }

  async close(user: AuthUser, id: string, b: z.infer<typeof encounterCloseSchema>, meta: RequestMeta) {
    return this.prisma.forUser(
      user,
      async (tx) => {
        const e = await tx.encounter.findUnique({ where: { id }, include: { diagnoses: true, person: { include: { student: true } }, incident: true } });
        if (!e) throw notFound('Atención');
        this.assertOpen(e);
        if (!e.assessment && !e.diagnoses.length) throw unprocessable('ASSESSMENT_REQUIRED', 'Registre la valoración o al menos un diagnóstico antes de cerrar.');
        if (e.subjectType === 'STUDENT' && b.disposition.startsWith('STAFF_')) throw unprocessable('INVALID_DISPOSITION', 'Conducta no válida para estudiantes.');
        if (e.subjectType === 'STAFF' && ['RETURN_TO_CLASS', 'GUARDIAN_PICKUP'].includes(b.disposition)) throw unprocessable('INVALID_DISPOSITION', 'Conducta no válida para personal.');
        if (b.disposition === 'TRANSFER_IPS' && !b.referral) throw unprocessable('REFERRAL_REQUIRED', 'Registre los datos del traslado.');

        const tz = await this.settings.timezone(tx, user.tenantId);
        const now = new Date();
        const studentName = personName(e.person);

        // Inventory consumption for treatments linked to items (FEFO, expired blocked)
        const treatments = e.treatments as { description: string; itemId?: string | null; quantity?: number | null }[];
        for (const t of treatments) {
          if (!t.itemId) continue;
          const movements = await this.inventory.consume(tx, user.tenantId, user.id, { itemId: t.itemId, quantity: t.quantity ?? 1, reason: `Atención ${e.chiefComplaint}`, encounterId: id });
          await tx.encounterProcedure.create({ data: { tenantId: user.tenantId, encounterId: id, description: t.description, itemId: t.itemId, quantity: t.quantity ?? 1, stockMovementId: movements[0]?.id ?? null, performedBy: user.id } });
        }
        if (b.referral) {
          await tx.referral.create({ data: { tenantId: user.tenantId, encounterId: id, destination: b.referral.destination, transport: b.referral.transport, departedAt: b.referral.departedAt ? new Date(b.referral.departedAt) : now, companion: b.referral.companion ?? null, reason: b.referral.reason, createdBy: user.id } });
        }
        await tx.observationPeriod.updateMany({ where: { encounterId: id, endedAt: null }, data: { endedAt: now, outcome: 'Cierre de la atención', recheckedBy: user.id } });

        const parentSummary = b.parentSummary?.trim() || e.parentSummary || `Atención por ${e.chiefComplaint.toLowerCase()}. Conducta: ${DISPOSITION_LABELS[b.disposition as Disposition].toLowerCase()}.`;
        const closed = await tx.encounter.update({ where: { id }, data: { status: 'CLOSED', disposition: b.disposition, parentSummary, endedAt: now, signedByUserId: user.id, signedAt: now } });

        // Flow side effects
        const exit: unknown = null;
        if (e.passId) {
          let pass = await tx.pass.findUniqueOrThrow({ where: { id: e.passId } });
          if (pass.state === 'OBSERVATION') pass = await this.flow.applyTransition(tx, pass, 'IN_CARE', actorOf(user, meta));
          if (b.disposition === 'RETURN_TO_CLASS' && ['IN_CARE'].includes(pass.state)) {
            pass = await this.flow.applyTransition(tx, pass, 'RETURNED_TO_CLASS', actorOf(user, meta));
            if (pass.issuedByUserId) await tx.notification.create({ data: { tenantId: user.tenantId, userId: pass.issuedByUserId, channel: 'IN_APP', event: 'PASS_CREATED', subject: 'Retorno al aula', body: `${studentName} regresa al aula (${timeInTz(now, tz)}).`, link: '/docente', entity: 'pass', entityId: pass.id } });
          }
          if (b.disposition === 'TRANSFER_IPS' && ['IN_CARE', 'WAITING_GUARDIAN'].includes(pass.state)) pass = await this.flow.applyTransition(tx, pass, 'TRANSFERRED_IPS', actorOf(user, meta), b.referral?.destination);
          if (b.disposition === 'GUARDIAN_PICKUP' && pass.state === 'IN_CARE') pass = await this.flow.applyTransition(tx, pass, 'WAITING_GUARDIAN', actorOf(user, meta));
          if (b.disposition === 'COORDINATION_REPORT' && pass.state === 'IN_CARE') pass = await this.flow.applyTransition(tx, pass, 'RETURNED_TO_CLASS', actorOf(user, meta), 'Remitido a coordinación');
        }

        if (e.studentId && b.notifyGuardians && !e.isMentalHealth) {
          if (b.disposition === 'TRANSFER_IPS') {
            await this.notify.notify(tx, { tenantId: user.tenantId, event: 'TRANSFER_IPS', guardiansOfStudentId: e.studentId, data: { studentName, destination: b.referral?.destination ?? '' }, link: `/familia/atenciones/${id}`, urgent: true, entity: 'encounter', entityId: id, dedupeKey: `transfer:${id}` });
          }
          await this.notify.notify(tx, { tenantId: user.tenantId, event: 'ENCOUNTER_CLOSED', guardiansOfStudentId: e.studentId, data: { studentName, disposition: DISPOSITION_LABELS[b.disposition as Disposition] }, link: `/familia/atenciones/${id}`, entity: 'encounter', entityId: id, dedupeKey: `closed:${id}` });
        }

        // Mandatory report drafts (PLAN §4.3)
        const profile = profileFor((await tx.tenant.findUniqueOrThrow({ where: { id: user.tenantId } })).country);
        const draft = async (type: string) => {
          const rule = profile.mandatoryReports.find((r) => r.type === type);
          if (!rule) return;
          await tx.mandatoryReport.create({ data: { tenantId: user.tenantId, type, studentId: e.studentId, encounterId: id, authority: rule.authority, details: `${rule.label} — generado desde la atención del ${dateInTz(e.startedAt, tz)}. Complete los detalles.`, dueAt: new Date(now.getTime() + rule.deadlineHours * 3600_000), createdByUserId: user.id } });
        };
        if (e.incident?.severity === 'SEVERE' || (e.incident && b.disposition === 'TRANSFER_IPS')) await draft('SEVERE_ACCIDENT');
        if (e.subjectType === 'STAFF' && e.incident?.workAccidentReport) await draft('WORK_ACCIDENT');

        await this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: 'clinical.encounter_closed', entity: 'encounter', entityId: id, after: { disposition: b.disposition, hash: closed.hash }, meta });
        this.realtime.nursing(user.tenantId, 'encounter:updated', { id, status: 'CLOSED' });
        return { ...(await this.detailTx(tx, user, id, meta, false)), exit };
      },
      { timeout: 60_000 },
    );
  }

  async annul(user: AuthUser, id: string, reason: string, meta: RequestMeta) {
    return this.prisma.forUser(user, async (tx) => {
      const e = await this.load(tx, id);
      if (e.status === 'ANNULLED') throw conflict('ALREADY_ANNULLED', 'La atención ya está anulada.');
      await tx.encounter.update({ where: { id }, data: { status: 'ANNULLED', annulledAt: new Date(), annulledBy: user.id, annulReason: reason } });
      await tx.encounterNote.create({ data: { tenantId: user.tenantId, encounterId: id, kind: 'ANNULMENT', note: reason, authorId: user.id } });
      await this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: 'clinical.encounter_annulled', entity: 'encounter', entityId: id, before: { status: e.status }, after: { status: 'ANNULLED' }, meta });
      this.realtime.nursing(user.tenantId, 'encounter:updated', { id, status: 'ANNULLED' });
      return { annulled: true };
    });
  }

  async verifyChain(user: AuthUser) {
    return this.prisma.forUser(user, async (tx) => {
      const enc = await tx.$queryRaw<{ id: string; seq: bigint; hash_ok: boolean; link_ok: boolean }[]>`SELECT * FROM clinical.verify_encounter_chain(${user.tenantId}::uuid)`;
      const adm = await tx.$queryRaw<{ id: string; seq: bigint; hash_ok: boolean; link_ok: boolean }[]>`SELECT * FROM meds.verify_administration_chain(${user.tenantId}::uuid)`;
      const broken = (rows: typeof enc) => rows.filter((r) => !r.hash_ok || !r.link_ok).map((r) => ({ id: r.id, seq: r.seq.toString(), hashOk: r.hash_ok, linkOk: r.link_ok }));
      return {
        encounters: { total: enc.length, broken: broken(enc) },
        administrations: { total: adm.length, broken: broken(adm) },
        verifiedAt: new Date(),
      };
    });
  }

  async pdf(user: AuthUser, id: string, meta: RequestMeta): Promise<Buffer> {
    const d = (await this.detail(user, id, meta)) as Awaited<ReturnType<EncountersService['detailTx']>> & Record<string, any>;
    const tenant = await this.prisma.forUser(user, (tx) => tx.tenant.findUniqueOrThrow({ where: { id: user.tenantId } }));
    const tz = tenant.timezone;
    const fmt = (x: Date | string | null | undefined) => (x ? `${dateInTz(new Date(x), tz)} ${timeInTz(new Date(x), tz)}` : '—');
    if (!d.patient) {
      const doc = createPdf('Constancia de atención en enfermería', `${tenant.name} · Generado ${fmt(new Date())}`);
      section(doc, 'Estudiante');
      field(doc, 'Nombre', d.student?.name);
      field(doc, 'Grupo', d.student?.group?.name);
      section(doc, 'Atención');
      field(doc, 'Ingreso', fmt(d.startedAt));
      field(doc, 'Egreso', fmt(d.endedAt));
      field(doc, 'Motivo', d.chiefComplaint);
      field(doc, 'Conducta', d.dispositionLabel);
      field(doc, 'Atendido por', d.attendedBy);
      section(doc, 'Resumen para la familia');
      paragraph(doc, d.parentSummary);
      footer(doc, `${tenant.name} · Documento informativo`);
      return pdfToBuffer(doc);
    }
    const doc = createPdf('Registro de atención — Historia clínica escolar', `${tenant.name} · Res. 1995/1999 · Generado ${fmt(new Date())} por ${user.name}`);
    section(doc, 'Paciente');
    field(doc, 'Nombre', d.patient.name);
    field(doc, 'Tipo', d.subjectType === 'STUDENT' ? `Estudiante · código ${d.patient.student?.code ?? '—'} · ${d.patient.student?.group?.name ?? ''}` : 'Personal del colegio');
    field(doc, 'Edad / sexo', `${d.patient.age} años · ${d.patient.sex ?? '—'}`);
    field(doc, 'Grupo sanguíneo', d.patient.bloodType);
    field(doc, 'Alergias', d.patient.allergies.map((a: { agent: string; severity: string }) => `${a.agent} (${a.severity})`).join(', ') || 'No registradas');
    field(doc, 'Condiciones', d.patient.conditions.map((c: { name: string }) => c.name).join(', ') || 'No registradas');
    section(doc, 'Atención');
    field(doc, 'Tipo', d.typeLabel);
    field(doc, 'Ingreso', fmt(d.startedAt));
    field(doc, 'Egreso', fmt(d.endedAt));
    field(doc, 'Motivo de consulta', d.chiefComplaint);
    field(doc, 'Remitido por', [d.referredBy, d.referredFrom].filter(Boolean).join(' · '));
    if (d.vitals.length) {
      section(doc, 'Signos vitales');
      table(doc, ['Hora', 'T °C', 'FC', 'FR', 'TA', 'SatO2', 'Gluc.', 'Dolor', 'Glasgow'], d.vitals.map((v: any) => [timeInTz(new Date(v.takenAt), tz), v.temperatureC, v.heartRate, v.respiratoryRate, v.systolic ? `${v.systolic}/${v.diastolic ?? '—'}` : null, v.spo2, v.glucoseMgDl, v.painScore, v.glasgow]));
    }
    section(doc, 'Subjetivo');
    paragraph(doc, d.subjective);
    section(doc, 'Objetivo / examen físico');
    paragraph(doc, [d.objective, ...Object.entries((d.physicalExam as Record<string, string>) ?? {}).map(([k, v]) => `${k}: ${v}`)].filter(Boolean).join('\n'));
    section(doc, 'Valoración y diagnósticos');
    paragraph(doc, d.assessment);
    if (d.diagnoses.length) table(doc, ['Sistema', 'Código', 'Descripción', 'Principal'], d.diagnoses.map((x: any) => [x.system, x.code, x.description, x.primary ? 'Sí' : '']), [60, 60, 320, 72]);
    section(doc, 'Plan y tratamiento');
    paragraph(doc, [d.plan, ...((d.treatments as any[]) ?? []).map((t: any) => `• ${t.description}${t.quantity ? ` (${t.quantity})` : ''}`)].filter(Boolean).join('\n'));
    if (d.incident) {
      section(doc, 'Reporte de accidente escolar');
      field(doc, 'Lugar', d.incident.place);
      field(doc, 'Actividad', d.incident.activity);
      field(doc, 'Mecanismo', d.incident.mechanism);
      field(doc, 'Severidad', ACCIDENT_SEVERITY_LABELS[d.incident.severity as 'MILD']);
      field(doc, 'Testigos', (d.incident.witnesses as string[]).join(', '));
    }
    if (d.referrals.length) {
      section(doc, 'Traslado / remisión');
      for (const r of d.referrals) field(doc, r.destination, `${r.transport} · ${fmt(r.departedAt)} · ${r.companion ?? ''} · ${r.reason}`);
    }
    section(doc, 'Conducta y cierre');
    field(doc, 'Conducta', d.dispositionLabel);
    field(doc, 'Resumen enviado a la familia', d.parentSummary);
    if (d.notes.length) {
      section(doc, 'Evolución y adendas');
      for (const n of d.notes) paragraph(doc, `[${fmt(n.createdAt)}] ${n.kind} — ${n.author ?? ''}: ${n.note}`);
    }
    section(doc, 'Firma e integridad');
    field(doc, 'Atendido por', d.attendedBy);
    field(doc, 'Firmado por', d.signedBy ? `${d.signedBy} · ${fmt(d.signedAt)}` : 'Sin firmar');
    field(doc, 'Secuencia', d.seq);
    field(doc, 'Hash SHA-256', d.hash);
    field(doc, 'Hash anterior', d.prevHash);
    if (d.status === 'ANNULLED') {
      field(doc, 'ANULADA', `${fmt(d.annulledAt)} por ${d.annulledByName ?? ''} — ${d.annulReason}`);
      watermark(doc, 'ANULADA');
    }
    footer(doc, `${tenant.name} · Documento reservado — historia clínica`);
    await this.prisma.forUser(user, (tx) => this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: 'clinical.encounter_pdf', entity: 'encounter', entityId: id, meta }));
    return pdfToBuffer(doc);
  }
}
