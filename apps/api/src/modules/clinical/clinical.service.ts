import { Injectable } from '@nestjs/common';
import type { Tx } from '@sgee/db';
import {
  type allergySchema,
  type anthropometricSchema,
  type carePlanSchema,
  type chronicConditionSchema,
  computeGrowth,
  type deviceSchema,
  type disabilitySupportSchema,
  type healthProfileSchema,
  type homeMedicationSchema,
  type immunizationSchema,
  type mentalHealthNoteSchema,
  type screeningSchema,
  type surgicalHistorySchema,
} from '@sgee/shared';
import type { z } from 'zod';
import { AccessService } from '../../common/access.service';
import { AuditService } from '../../common/audit.service';
import { type AuthUser, can, hasRole, type RequestMeta } from '../../common/auth';
import { getEncryptor } from '../../common/crypto';
import { badRequest, forbidden, notFound } from '../../common/errors';
import { PrismaService } from '../../common/prisma.service';
import { StorageService } from '../files/storage.service';

export interface Completeness {
  pct: number;
  items: { key: string; label: string; done: boolean }[];
}

@Injectable()
export class ClinicalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
  ) {}

  /** Parent of the student or clinical writer. */
  private async assertWrite(tx: Tx, user: AuthUser, studentId: string) {
    if (can(user, 'clinical:write')) return { student: await this.access.assertStudent(tx, user, studentId, 'basic'), byGuardian: false };
    if (hasRole(user, 'PARENT') && (await this.access.childrenIds(tx, user)).includes(studentId)) {
      return { student: await this.access.assertStudent(tx, user, studentId, 'basic'), byGuardian: true };
    }
    throw forbidden();
  }

  async completeness(tx: Tx, studentId: string, personId: string): Promise<Completeness> {
    const yearStart = new Date(new Date().getFullYear(), 0, 1);
    const [profile, contacts, guardians, vaccines, anthropo, consents, mandatory] = await Promise.all([
      tx.healthProfile.findUnique({ where: { personId } }),
      tx.emergencyContact.count({ where: { studentId, active: true } }),
      tx.studentGuardian.findMany({ where: { studentId, active: true }, include: { guardian: { include: { person: { select: { mobile: true, phone: true } } } } } }),
      tx.immunization.count({ where: { personId } }),
      tx.anthropometric.count({ where: { personId, measuredAt: { gte: new Date(Date.now() - 365 * 86400000) } } }),
      tx.consent.findMany({ where: { studentId, status: 'GRANTED' }, select: { templateId: true } }),
      tx.consentTemplate.findMany({ where: { mandatory: true, active: true }, select: { id: true } }),
    ]);
    const signed = new Set(consents.map((c) => c.templateId));
    const items = [
      { key: 'bloodType', label: 'Grupo sanguíneo y RH', done: !!profile?.bloodType },
      { key: 'eps', label: 'EPS / aseguradora', done: !!profile?.eps },
      { key: 'insurance', label: 'Póliza de accidentes o prepagada', done: !!(profile?.accidentInsurance || profile?.prepaidPlan) },
      { key: 'ips', label: 'IPS preferida', done: !!profile?.preferredIps },
      { key: 'guardianPhone', label: 'Teléfono de acudiente', done: guardians.some((g) => g.guardian.person.mobile || g.guardian.person.phone) },
      { key: 'emergencyContact', label: 'Contacto de emergencia adicional', done: contacts > 0 },
      { key: 'vaccines', label: 'Vacunación registrada', done: vaccines > 0 },
      { key: 'anthropometrics', label: 'Peso y talla del último año', done: anthropo > 0 },
      { key: 'consents', label: 'Consentimientos obligatorios firmados', done: mandatory.every((m) => signed.has(m.id)) },
      { key: 'annualUpdate', label: 'Actualización anual por el acudiente', done: !!profile?.lastGuardianUpdateAt && profile.lastGuardianUpdateAt >= yearStart },
    ];
    return { pct: Math.round((items.filter((i) => i.done).length / items.length) * 100), items };
  }

  private async refreshCompleteness(tx: Tx, studentId: string, personId: string) {
    const c = await this.completeness(tx, studentId, personId);
    await tx.healthProfile.updateMany({ where: { personId }, data: { completenessPct: c.pct } });
    return c;
  }

  async profile(user: AuthUser, studentId: string, meta: RequestMeta) {
    return this.prisma.forUser(user, async (tx) => {
      const s = await this.access.assertStudent(tx, user, studentId, 'clinical', meta);
      const personId = s.personId;
      const [profile, allergies, conditions, carePlans, immunizations, homeMeds, devices, restrictions, surgical, disabilities, anthropometrics, screenings, documents] = await Promise.all([
        tx.healthProfile.findUnique({ where: { personId } }),
        tx.allergy.findMany({ where: { personId }, orderBy: [{ active: 'desc' }, { createdAt: 'desc' }] }),
        tx.chronicCondition.findMany({ where: { personId }, orderBy: [{ active: 'desc' }, { critical: 'desc' }] }),
        tx.carePlan.findMany({ where: { personId }, orderBy: { createdAt: 'desc' } }),
        tx.immunization.findMany({ where: { personId }, orderBy: { administeredOn: 'desc' } }),
        tx.homeMedication.findMany({ where: { personId, active: true } }),
        tx.medicalDevice.findMany({ where: { personId, active: true } }),
        tx.activityRestriction.findMany({ where: { personId }, orderBy: { validFrom: 'desc' } }),
        tx.surgicalHistory.findMany({ where: { personId }, orderBy: { date: 'desc' } }),
        tx.disabilitySupport.findMany({ where: { personId } }),
        tx.anthropometric.findMany({ where: { personId }, orderBy: { measuredAt: 'asc' } }),
        tx.screening.findMany({ where: { personId }, orderBy: { performedOn: 'desc' } }),
        tx.healthDocument.findMany({ where: { personId }, orderBy: { createdAt: 'desc' } }),
      ]);
      return {
        studentId,
        personId,
        sex: s.person.sex,
        birthDate: s.person.birthDate,
        profile,
        completeness: await this.completeness(tx, studentId, personId),
        allergies,
        conditions,
        carePlans,
        immunizations,
        homeMedications: homeMeds,
        devices,
        activityRestrictions: restrictions,
        surgicalHistory: surgical,
        disabilities,
        anthropometrics,
        screenings,
        documents,
      };
    });
  }

  async updateProfile(user: AuthUser, studentId: string, body: z.infer<typeof healthProfileSchema>, meta: RequestMeta) {
    return this.prisma.forUser(user, async (tx) => {
      const { student, byGuardian } = await this.assertWrite(tx, user, studentId);
      const before = await tx.healthProfile.findUnique({ where: { personId: student.personId } });
      const data = { ...body, ...(byGuardian ? { lastGuardianUpdateAt: new Date(), lastGuardianUpdateBy: user.id } : { reviewedAt: new Date(), reviewedBy: user.id }) };
      const after = before
        ? await tx.healthProfile.update({ where: { personId: student.personId }, data: { ...data, version: { increment: 1 } } })
        : await tx.healthProfile.create({ data: { tenantId: user.tenantId, personId: student.personId, ...data } });
      const completeness = await this.refreshCompleteness(tx, studentId, student.personId);
      await this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: before ? 'clinical.health_profile_updated' : 'clinical.health_profile_created', entity: 'health_profile', entityId: after.id, before, after, meta });
      return { ...after, completenessPct: completeness.pct, completeness };
    });
  }

  private async createFor<T extends { id: string }>(
    user: AuthUser,
    studentId: string,
    entity: string,
    meta: RequestMeta,
    fn: (tx: Tx, personId: string, byGuardian: boolean) => Promise<T>,
    opts: { guardianAllowed?: boolean } = { guardianAllowed: true },
  ): Promise<T> {
    return this.prisma.forUser(user, async (tx) => {
      const { student, byGuardian } = await this.assertWrite(tx, user, studentId);
      if (byGuardian && !opts.guardianAllowed) throw forbidden('Este dato solo lo registra el personal de salud.');
      const row = await fn(tx, student.personId, byGuardian);
      if (byGuardian) await tx.healthProfile.updateMany({ where: { personId: student.personId }, data: { lastGuardianUpdateAt: new Date(), lastGuardianUpdateBy: user.id } });
      await this.refreshCompleteness(tx, studentId, student.personId);
      await this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: `clinical.${entity}_created`, entity, entityId: row.id, after: row, meta });
      return row;
    });
  }

  addAllergy(user: AuthUser, studentId: string, b: z.infer<typeof allergySchema>, meta: RequestMeta) {
    return this.createFor(user, studentId, 'allergy', meta, (tx, personId, byGuardian) =>
      tx.allergy.create({ data: { tenantId: user.tenantId, personId, ...b, verified: !byGuardian, createdBy: user.id } }),
    );
  }

  addCondition(user: AuthUser, studentId: string, b: z.infer<typeof chronicConditionSchema>, meta: RequestMeta) {
    return this.createFor(user, studentId, 'chronic_condition', meta, async (tx, personId) => {
      const { carePlan, diagnosedAt, ...rest } = b;
      const condition = await tx.chronicCondition.create({ data: { tenantId: user.tenantId, personId, ...rest, diagnosedAt: diagnosedAt ? new Date(diagnosedAt) : null, createdBy: user.id } });
      if (carePlan) await this.insertCarePlan(tx, user, personId, condition.id, `Plan de acción — ${condition.name}`, carePlan);
      return condition;
    });
  }

  private insertCarePlan(tx: Tx, user: AuthUser, personId: string, conditionId: string | null, title: string, p: z.infer<typeof carePlanSchema>) {
    return tx.carePlan.create({
      data: {
        tenantId: user.tenantId,
        personId,
        conditionId,
        title,
        triggers: p.triggers,
        symptoms: p.symptoms,
        steps: p.steps,
        rescueMedications: p.rescueMedications,
        contacts: p.contacts,
        reviewDate: p.reviewDate ? new Date(p.reviewDate) : null,
        approvedBy: hasRole(user, 'DOCTOR') ? user.id : null,
        approvedAt: hasRole(user, 'DOCTOR') ? new Date() : null,
        createdBy: user.id,
      },
    });
  }

  addCarePlan(user: AuthUser, studentId: string, b: z.infer<typeof carePlanSchema> & { title: string; conditionId?: string | null }, meta: RequestMeta) {
    return this.createFor(user, studentId, 'care_plan', meta, (tx, personId) => this.insertCarePlan(tx, user, personId, b.conditionId ?? null, b.title, b), { guardianAllowed: false });
  }

  async approveCarePlan(user: AuthUser, id: string, meta: RequestMeta) {
    if (!hasRole(user, 'DOCTOR', 'HEALTH_COORDINATOR')) throw forbidden('Solo el médico institucional aprueba planes de acción.');
    return this.prisma.forUser(user, async (tx) => {
      const plan = await tx.carePlan.update({ where: { id }, data: { approvedBy: user.id, approvedAt: new Date() } });
      await this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: 'clinical.care_plan_approved', entity: 'care_plan', entityId: id, meta });
      return plan;
    });
  }

  addImmunization(user: AuthUser, studentId: string, b: z.infer<typeof immunizationSchema>, meta: RequestMeta) {
    return this.createFor(user, studentId, 'immunization', meta, (tx, personId, byGuardian) =>
      tx.immunization.create({ data: { tenantId: user.tenantId, personId, ...b, administeredOn: new Date(b.administeredOn), verified: !byGuardian, createdBy: user.id } }),
    );
  }

  addHomeMedication(user: AuthUser, studentId: string, b: z.infer<typeof homeMedicationSchema>, meta: RequestMeta) {
    return this.createFor(user, studentId, 'home_medication', meta, (tx, personId) => tx.homeMedication.create({ data: { tenantId: user.tenantId, personId, ...b, createdBy: user.id } }));
  }

  addDevice(user: AuthUser, studentId: string, b: z.infer<typeof deviceSchema>, meta: RequestMeta) {
    return this.createFor(user, studentId, 'device', meta, (tx, personId) => tx.medicalDevice.create({ data: { tenantId: user.tenantId, personId, ...b, createdBy: user.id } }));
  }

  addSurgical(user: AuthUser, studentId: string, b: z.infer<typeof surgicalHistorySchema>, meta: RequestMeta) {
    return this.createFor(user, studentId, 'surgical_history', meta, (tx, personId) =>
      tx.surgicalHistory.create({ data: { tenantId: user.tenantId, personId, ...b, date: b.date ? new Date(b.date) : null, createdBy: user.id } }),
    );
  }

  addDisability(user: AuthUser, studentId: string, b: z.infer<typeof disabilitySupportSchema>, meta: RequestMeta) {
    return this.createFor(user, studentId, 'disability_support', meta, (tx, personId) => tx.disabilitySupport.create({ data: { tenantId: user.tenantId, personId, ...b, createdBy: user.id } }));
  }

  addRestriction(user: AuthUser, studentId: string, b: { description: string; validFrom: string; validTo?: string | null; certificateFileId?: string | null }, meta: RequestMeta) {
    return this.createFor(user, studentId, 'activity_restriction', meta, (tx, personId) =>
      tx.activityRestriction.create({ data: { tenantId: user.tenantId, personId, description: b.description, validFrom: new Date(b.validFrom), validTo: b.validTo ? new Date(b.validTo) : null, certificateFileId: b.certificateFileId ?? null, createdBy: user.id } }),
    );
  }

  addAnthropometric(user: AuthUser, studentId: string, b: z.infer<typeof anthropometricSchema>, meta: RequestMeta) {
    return this.createFor(
      user,
      studentId,
      'anthropometric',
      meta,
      async (tx, personId) => {
        const person = await tx.person.findUniqueOrThrow({ where: { id: personId } });
        const g = person.birthDate && (person.sex === 'M' || person.sex === 'F') ? computeGrowth({ sex: person.sex, birthDate: person.birthDate, measuredAt: b.measuredAt, weightKg: b.weightKg, heightCm: b.heightCm }) : null;
        const row = await tx.anthropometric.create({
          data: {
            tenantId: user.tenantId,
            personId,
            measuredAt: new Date(b.measuredAt),
            weightKg: b.weightKg,
            heightCm: b.heightCm,
            headCircumferenceCm: b.headCircumferenceCm ?? null,
            bmi: g?.bmi ?? Math.round((b.weightKg / (b.heightCm / 100) ** 2) * 100) / 100,
            bmiZ: g?.bmiForAge?.z,
            bmiPercentile: g?.bmiForAge?.percentile,
            heightZ: g?.heightForAge?.z,
            weightZ: g?.weightForAge?.z,
            classification: g?.classification?.code,
            notes: b.notes ?? null,
            createdBy: user.id,
          },
        });
        return { ...row, growth: g };
      },
      { guardianAllowed: false },
    );
  }

  addScreening(user: AuthUser, studentId: string, b: z.infer<typeof screeningSchema>, meta: RequestMeta) {
    return this.createFor(
      user,
      studentId,
      'screening',
      meta,
      (tx, personId) => tx.screening.create({ data: { tenantId: user.tenantId, personId, ...b, performedOn: new Date(b.performedOn), details: b.details, createdBy: user.id } }),
      { guardianAllowed: false },
    );
  }

  async addDocument(user: AuthUser, studentId: string, file: { buffer: Buffer; originalname: string } | undefined, body: { kind: string; title: string; expiresOn?: string }, meta: RequestMeta) {
    if (!file) throw badRequest('FILE_REQUIRED', 'Adjunte el archivo.');
    const { student } = await this.prisma.forUser(user, (tx) => this.assertWrite(tx, user, studentId));
    const stored = await this.storage.save(user, { buffer: file.buffer, originalName: file.originalname, kind: body.kind, ownerPersonId: student.personId, expiresOn: body.expiresOn ? new Date(body.expiresOn) : null });
    return this.prisma.forUser(user, async (tx) => {
      const doc = await tx.healthDocument.create({ data: { tenantId: user.tenantId, personId: student.personId, fileId: stored.id, kind: body.kind, title: body.title, expiresOn: body.expiresOn ? new Date(body.expiresOn) : null, createdBy: user.id } });
      await this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: 'clinical.document_uploaded', entity: 'health_document', entityId: doc.id, after: { kind: body.kind, size: stored.size, mime: stored.mimeType }, meta });
      return { ...doc, file: { id: stored.id, name: stored.originalName, mimeType: stored.mimeType, size: stored.size } };
    });
  }

  /** Allergy/condition entered in error: never deleted — deactivated with reason. */
  async annul(user: AuthUser, kind: 'allergy' | 'condition', id: string, reason: string, meta: RequestMeta) {
    if (!can(user, 'clinical:write')) throw forbidden();
    return this.prisma.forUser(user, async (tx) => {
      const data = { active: false, annulledAt: new Date(), annulledBy: user.id, annulReason: reason };
      const row = kind === 'allergy' ? await tx.allergy.update({ where: { id }, data }) : await tx.chronicCondition.update({ where: { id }, data });
      await this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: `clinical.${kind}_annulled`, entity: kind, entityId: id, after: { reason: '[redacted]' }, meta });
      return row;
    });
  }

  async verifyAllergy(user: AuthUser, id: string, meta: RequestMeta) {
    if (!can(user, 'clinical:write')) throw forbidden();
    return this.prisma.forUser(user, async (tx) => {
      const row = await tx.allergy.update({ where: { id }, data: { verified: true } });
      await this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: 'clinical.allergy_verified', entity: 'allergy', entityId: id, meta });
      return row;
    });
  }

  async setActive(user: AuthUser, kind: 'home_medication' | 'device' | 'care_plan', id: string, active: boolean, meta: RequestMeta) {
    if (!can(user, 'clinical:write')) throw forbidden();
    return this.prisma.forUser(user, async (tx) => {
      const row =
        kind === 'home_medication'
          ? await tx.homeMedication.update({ where: { id }, data: { active } })
          : kind === 'device'
            ? await tx.medicalDevice.update({ where: { id }, data: { active } })
            : await tx.carePlan.update({ where: { id }, data: { active } });
      await this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: `clinical.${kind}_${active ? 'activated' : 'deactivated'}`, entity: kind, entityId: id, meta });
      return row;
    });
  }

  // ── mental health (restricted, encrypted at rest) ─────────────────────────
  async addMentalHealthNote(user: AuthUser, b: z.infer<typeof mentalHealthNoteSchema>, meta: RequestMeta) {
    if (!can(user, 'mental_health:write')) throw forbidden();
    return this.prisma.forUser(user, async (tx) => {
      const s = await this.access.assertStudent(tx, user, b.studentId, 'mental_health', meta);
      const note = await tx.mentalHealthNote.create({
        data: { tenantId: user.tenantId, personId: s.personId, encounterId: b.encounterId ?? null, noteEnc: new Uint8Array(getEncryptor().encrypt(b.note)), riskLevel: b.riskLevel, referral: b.referral ?? null, authorId: user.id },
      });
      await this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: 'clinical.mental_health_note_created', entity: 'mental_health_note', entityId: note.id, after: { riskLevel: b.riskLevel }, meta });
      return { id: note.id, riskLevel: note.riskLevel, createdAt: note.createdAt };
    });
  }

  async mentalHealthNotes(user: AuthUser, studentId: string, meta: RequestMeta) {
    return this.prisma.forUser(user, async (tx) => {
      const s = await this.access.assertStudent(tx, user, studentId, 'mental_health', meta);
      const notes = await tx.mentalHealthNote.findMany({ where: { personId: s.personId }, orderBy: { createdAt: 'desc' } });
      const authors = await tx.user.findMany({ where: { id: { in: notes.map((n) => n.authorId) } }, select: { id: true, firstName: true, lastName: true } });
      return notes.map((n) => ({
        id: n.id,
        note: getEncryptor().decrypt(Buffer.from(n.noteEnc)).toString('utf8'),
        riskLevel: n.riskLevel,
        referral: n.referral,
        encounterId: n.encounterId,
        createdAt: n.createdAt,
        author: authors.find((a) => a.id === n.authorId) ?? null,
      }));
    });
  }

  async fileForDownload(user: AuthUser, fileId: string, meta: RequestMeta) {
    const file = await this.prisma.forUser(user, async (tx) => {
      const f = await tx.storedFile.findUnique({ where: { id: fileId } });
      if (!f) throw notFound('Archivo');
      if (f.uploadedBy !== user.id) {
        if (f.ownerPersonId) await this.access.assertPerson(tx, user, f.ownerPersonId, 'clinical', meta);
        else if (!can(user, 'clinical:read', 'admin:settings')) throw forbidden();
      }
      await this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: 'files.downloaded', entity: 'file', entityId: f.id, meta });
      return f;
    });
    return { file, data: await this.storage.read(file) };
  }
}
