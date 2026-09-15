import { Injectable } from '@nestjs/common';
import { Prisma, type Tx } from '@sgee/db';
import {
  type emergencyContactSchema,
  EMERGENCY_PROTOCOLS,
  ENCOUNTER_TEMPLATES,
  type gradeUpsertSchema,
  type groupUpsertSchema,
  type guardianLinkSchema,
  type invitationCreateSchema,
  PASS_STATE_LABELS,
  type PassState,
  type sectionUpsertSchema,
  type studentCreateSchema,
  type studentSearchSchema,
  type studentUpdateSchema,
  timeInTz,
} from '@sgee/shared';
import type { z } from 'zod';
import { AccessService } from '../../common/access.service';
import { AuditService } from '../../common/audit.service';
import { type AuthUser, can, hasRole, isClinical, type RequestMeta } from '../../common/auth';
import { randomCode } from '../../common/crypto';
import { badRequest, conflict, forbidden, notFound, Problem } from '../../common/errors';
import { PrismaService } from '../../common/prisma.service';
import { LOCAL_PHOTO_PREFIX, personName, studentInclude, studentPhotoUrl, studentSummary } from '../../common/serializers';
import { TenantSettingsService } from '../../common/tenant-settings.service';
import { config } from '../../config';
import { MAX_PHOTO_BYTES, PhotoService, sniffMime, StorageService } from '../files/storage.service';

/** Fields that Phidias owns for students linked to Phidias (read-only while the school works in Phidias mode). */
const PHIDIAS_OWNED_FIELDS = ['code', 'firstName', 'lastName', 'documentType', 'documentNumber', 'birthDate', 'sex', 'groupId', 'status'] as const;
const FIELD_LABELS: Record<string, string> = { code: 'código', firstName: 'nombres', lastName: 'apellidos', documentType: 'tipo de documento', documentNumber: 'documento', birthDate: 'fecha de nacimiento', sex: 'sexo', groupId: 'grupo', status: 'estado' };

const OPEN_STATES: PassState[] = ['REQUESTED', 'IN_TRANSIT', 'RECEIVED', 'IN_CARE', 'OBSERVATION', 'RETURNED_TO_CLASS', 'WAITING_GUARDIAN', 'EXIT_AUTHORIZED', 'HANDED_OVER', 'TRANSFERRED_IPS'];

@Injectable()
export class PeopleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly photos: PhotoService,
    private readonly storage: StorageService,
    private readonly settings: TenantSettingsService,
  ) {}

  private async dataSource(tx: Tx, tenantId: string) {
    return (await this.settings.get(tx, tenantId)).dataSource;
  }

  private phidiasLink(tx: Tx, studentId: string) {
    return tx.externalId.findFirst({ where: { source: 'phidias', entity: 'student', localId: studentId, missingSince: null }, select: { id: true } });
  }

  /** Students the user may see, as a Prisma filter. */
  private async scopeFilter(tx: Tx, user: AuthUser): Promise<Prisma.StudentWhereInput> {
    if (isClinical(user) || hasRole(user, 'ADMIN', 'GATE', 'PSYCHOLOGIST')) return {};
    if (hasRole(user, 'DIRECTOR')) return user.sectionScopes.length ? { group: { grade: { sectionId: { in: user.sectionScopes } } } } : {};
    const or: Prisma.StudentWhereInput[] = [];
    if (hasRole(user, 'TEACHER')) or.push({ currentGroupId: { in: await this.access.teacherGroupIds(tx, user) } });
    if (hasRole(user, 'PARENT')) or.push({ id: { in: await this.access.childrenIds(tx, user) } });
    return or.length ? { OR: or } : { id: '00000000-0000-0000-0000-000000000000' };
  }

  async search(user: AuthUser, q: z.infer<typeof studentSearchSchema>) {
    return this.prisma.forUser(user, async (tx) => {
      const where: Prisma.StudentWhereInput = { AND: [await this.scopeFilter(tx, user)] };
      const and = where.AND as Prisma.StudentWhereInput[];
      if (q.status !== 'ALL') and.push({ status: q.status });
      if (q.groupId) and.push({ currentGroupId: q.groupId });
      if (q.gradeId) and.push({ group: { gradeId: q.gradeId } });
      if (q.sectionId) and.push({ group: { grade: { sectionId: q.sectionId } } });
      if (q.withAlerts) and.push({ person: { OR: [{ allergies: { some: { active: true, severity: { in: ['SEVERE', 'ANAPHYLAXIS'] } } } }, { conditions: { some: { active: true, critical: true } } }] } });
      if (q.q) {
        const tokens = q.q.trim().split(/\s+/).filter(Boolean).slice(0, 5);
        const conds = tokens.map((t) => Prisma.sql`core.f_unaccent(lower(p.first_name || ' ' || p.last_name || ' ' || s.code || ' ' || coalesce(p.document_number, ''))) LIKE ${'%' + t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '') + '%'}`);
        const ids = await tx.$queryRaw<{ id: string }[]>`
          SELECT s.id FROM people.students s JOIN people.persons p ON p.id = s.person_id
          WHERE ${Prisma.join(conds, ' AND ')}
          ORDER BY (s.code = ${q.q.trim()}) DESC, p.last_name, p.first_name LIMIT 500`;
        and.push({ id: { in: ids.map((r) => r.id) } });
      }
      const rows = await tx.student.findMany({
        where,
        include: {
          ...studentInclude,
          person: { include: { allergies: { where: { active: true }, select: { severity: true, agent: true, requiresEpinephrine: true } }, conditions: { where: { active: true, critical: true }, select: { name: true } } } },
          passes: { where: { state: { in: OPEN_STATES } }, select: { id: true, state: true, requestedAt: true }, take: 1, orderBy: { requestedAt: 'desc' } },
        },
        orderBy: [{ person: { lastName: 'asc' } }, { person: { firstName: 'asc' } }],
        take: q.limit + 1,
        ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      });
      const clinical = can(user, 'clinical:read');
      const items = rows.slice(0, q.limit).map((s) => ({
        ...studentSummary(s, { photosEnabled: this.photos.enabled }),
        medicalAlert: s.person.allergies.some((a) => ['SEVERE', 'ANAPHYLAXIS'].includes(a.severity)) || s.person.conditions.length > 0,
        alerts: clinical
          ? {
              anaphylaxis: s.person.allergies.some((a) => a.severity === 'ANAPHYLAXIS' || a.requiresEpinephrine),
              allergies: s.person.allergies.map((a) => a.agent),
              criticalConditions: s.person.conditions.map((c) => c.name),
            }
          : undefined,
        openPass: s.passes[0] ? { id: s.passes[0].id, state: s.passes[0].state, label: PASS_STATE_LABELS[s.passes[0].state as PassState] } : null,
      }));
      return { items, nextCursor: rows.length > q.limit ? rows[q.limit - 1].id : null };
    });
  }

  async detail(user: AuthUser, studentId: string, meta: RequestMeta) {
    return this.prisma.forUser(user, async (tx) => {
      const clinical = can(user, 'clinical:read') || (hasRole(user, 'PARENT') && (await this.access.childrenIds(tx, user)).includes(studentId));
      const student = await this.access.assertStudent(tx, user, studentId, clinical ? 'clinical' : 'basic', meta);
      const guardians = await tx.studentGuardian.findMany({ where: { studentId, active: true }, include: { guardian: { include: { person: true } } }, orderBy: { priority: 'asc' } });
      const contacts = await tx.emergencyContact.findMany({ where: { studentId, active: true }, orderBy: { createdAt: 'asc' } });
      const [source, link] = await Promise.all([this.dataSource(tx, user.tenantId), this.phidiasLink(tx, studentId)]);
      const base = {
        ...studentSummary(student, { photosEnabled: this.photos.enabled }),
        dataSource: source,
        phidiasLinked: !!link,
        phidiasLocked: source === 'PHIDIAS' && !!link,
        edit: can(user, 'people:write')
          ? {
              code: student.code,
              firstName: student.person.firstName,
              lastName: student.person.lastName,
              documentType: student.person.documentType,
              documentNumber: student.person.documentNumber,
              birthDate: student.person.birthDate?.toISOString().slice(0, 10) ?? null,
              sex: student.person.sex,
              groupId: student.currentGroupId,
              email: student.person.email,
              phone: student.person.phone,
              mobile: student.person.mobile,
              address: student.person.address,
              transport: student.transport,
              status: student.status,
            }
          : undefined,
        document: hasRole(user, 'TEACHER') ? null : { type: student.person.documentType, number: student.person.documentNumber },
        enrollmentStatus: student.enrollmentStatus,
        transport: student.transport,
        guardians: guardians.map((g) => ({
          linkId: g.id,
          personId: g.guardian.personId,
          name: personName(g.guardian.person),
          relationship: g.relationship,
          isPrimary: g.isPrimary,
          canPickUp: g.canPickUp && !g.judicialRestriction,
          legalCustody: g.legalCustody,
          priority: g.priority,
          restrictions: isClinical(user) || hasRole(user, 'GATE', 'ADMIN') ? g.restrictions : null,
          judicialRestriction: g.judicialRestriction,
          phone: hasRole(user, 'TEACHER') ? null : g.guardian.person.mobile ?? g.guardian.person.phone,
          email: hasRole(user, 'TEACHER', 'GATE') ? null : g.guardian.person.email,
        })),
        emergencyContacts: hasRole(user, 'TEACHER') ? [] : contacts,
      };
      if (!clinical) {
        const alert = await tx.allergy.count({ where: { personId: student.personId, active: true, severity: { in: ['SEVERE', 'ANAPHYLAXIS'] } } });
        return { ...base, medicalAlert: alert > 0 };
      }
      const [allergies, conditions, carePlans, profile, activeMeds, devices] = await Promise.all([
        tx.allergy.findMany({ where: { personId: student.personId, active: true }, orderBy: { severity: 'desc' } }),
        tx.chronicCondition.findMany({ where: { personId: student.personId, active: true } }),
        tx.carePlan.findMany({ where: { personId: student.personId, active: true } }),
        tx.healthProfile.findUnique({ where: { personId: student.personId } }),
        tx.medicationRequest.findMany({ where: { studentId, status: 'ACTIVE' }, select: { id: true, medicationName: true, dose: true, doseUnit: true, route: true, isPrn: true, times: true } }),
        tx.medicalDevice.findMany({ where: { personId: student.personId, active: true } }),
      ]);
      return {
        ...base,
        health: {
          bloodType: profile?.bloodType ?? null,
          eps: profile?.eps ?? null,
          completenessPct: profile?.completenessPct ?? 0,
          allergies,
          conditions,
          carePlans,
          activeMedications: activeMeds,
          devices,
          anaphylaxis: allergies.some((a) => a.severity === 'ANAPHYLAXIS' || a.requiresEpinephrine),
        },
      };
    });
  }

  /** Photo for any role allowed to see the student: uploaded photos are streamed, Phidias photos redirect to S3. */
  async photo(user: AuthUser, studentId: string, refresh: boolean): Promise<{ redirect: string } | { data: Buffer; mimeType: string } | null> {
    const s = await this.prisma.forUser(user, (tx) => this.access.assertStudent(tx, user, studentId, 'basic'));
    const key = s.person.photoKey;
    if (key?.startsWith(LOCAL_PHOTO_PREFIX)) {
      const file = await this.prisma.forUser(user, (tx) => tx.storedFile.findUnique({ where: { id: key.slice(LOCAL_PHOTO_PREFIX.length) } }));
      return file ? { data: await this.storage.read(file), mimeType: file.mimeType } : null;
    }
    const url = await this.photos.signedUrl(key, s.code, refresh);
    return url ? { redirect: url } : null;
  }

  async uploadPhoto(user: AuthUser, studentId: string, file: { buffer: Buffer; size: number } | undefined, meta: RequestMeta) {
    if (!can(user, 'people:write', 'clinical:write')) throw forbidden('No tiene permiso para cambiar la foto del estudiante.');
    if (!file?.buffer?.length) throw badRequest('FILE_REQUIRED', 'Adjunte una imagen.');
    if (file.size > MAX_PHOTO_BYTES) throw new Problem(413, 'FILE_TOO_LARGE', 'La foto supera 5 MB.');
    const mime = sniffMime(file.buffer);
    if (!mime?.startsWith('image/')) throw new Problem(415, 'PHOTO_TYPE_NOT_ALLOWED', 'La foto debe ser una imagen JPG, PNG o WEBP.');
    const student = await this.prisma.forUser(user, (tx) => this.access.assertStudent(tx, user, studentId, 'basic'));
    const stored = await this.storage.save(user, { buffer: file.buffer, originalName: `foto-${student.code}.${mime.split('/')[1]}`, kind: 'STUDENT_PHOTO', ownerPersonId: student.personId });
    return this.prisma.forUser(user, async (tx) => {
      const photoKey = `${LOCAL_PHOTO_PREFIX}${stored.id}`;
      const photoHash = stored.sha256.slice(0, 16);
      await tx.person.update({ where: { id: student.personId }, data: { photoKey, photoHash } });
      await this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: 'people.photo_uploaded', entity: 'student', entityId: studentId, after: { fileId: stored.id, size: stored.size }, meta });
      return { photoUrl: studentPhotoUrl(studentId, { photoKey, photoHash }, true) };
    });
  }

  async removePhoto(user: AuthUser, studentId: string, meta: RequestMeta) {
    if (!can(user, 'people:write', 'clinical:write')) throw forbidden('No tiene permiso para cambiar la foto del estudiante.');
    return this.prisma.forUser(user, async (tx) => {
      const student = await this.access.assertStudent(tx, user, studentId, 'basic');
      await tx.person.update({ where: { id: student.personId }, data: { photoKey: null, photoHash: null } });
      await this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: 'people.photo_removed', entity: 'student', entityId: studentId, meta });
      return { photoUrl: null };
    });
  }

  // ── student master data (both modes; Phidias-owned fields locked for linked students in Phidias mode) ──
  async createStudent(user: AuthUser, b: z.infer<typeof studentCreateSchema>, meta: RequestMeta) {
    return this.prisma.forUser(user, async (tx) => {
      const tenantId = user.tenantId;
      if (await tx.student.findUnique({ where: { tenantId_code: { tenantId, code: b.code } } })) throw conflict('STUDENT_CODE_IN_USE', `Ya existe un estudiante con el código ${b.code}.`);
      if (b.documentNumber && (await tx.person.findFirst({ where: { kind: 'STUDENT', documentNumber: b.documentNumber } }))) throw conflict('STUDENT_DOCUMENT_IN_USE', 'Ya existe un estudiante con ese número de documento.');
      if (b.groupId && !(await tx.group.findUnique({ where: { id: b.groupId } }))) throw notFound('Grupo');
      const person = await tx.person.create({
        data: { tenantId, kind: 'STUDENT', source: 'LOCAL', firstName: b.firstName, lastName: b.lastName, documentType: b.documentType, documentNumber: b.documentNumber, birthDate: b.birthDate ? new Date(`${b.birthDate}T00:00:00Z`) : null, sex: b.sex ?? null, email: b.email, phone: b.phone, mobile: b.mobile, address: b.address, createdBy: user.id },
      });
      const student = await tx.student.create({ data: { tenantId, personId: person.id, code: b.code, currentGroupId: b.groupId ?? null, transport: b.transport, status: 'ACTIVE', enrollmentStatus: 'activo' } });
      if (b.groupId) await tx.enrollment.create({ data: { tenantId, studentId: student.id, groupId: b.groupId, yearLabel: String(new Date().getFullYear()), status: 'activo' } });
      await this.audit.log(tx, { tenantId, actor: user, action: 'people.student_created', entity: 'student', entityId: student.id, after: { code: b.code, groupId: b.groupId ?? null }, meta });
      return { id: student.id };
    });
  }

  async updateStudent(user: AuthUser, studentId: string, b: z.infer<typeof studentUpdateSchema>, meta: RequestMeta) {
    return this.prisma.forUser(user, async (tx) => {
      const before = await tx.student.findUnique({ where: { id: studentId }, include: { person: true } });
      if (!before) throw notFound('Estudiante');
      const current: Record<string, unknown> = {
        code: before.code,
        firstName: before.person.firstName,
        lastName: before.person.lastName,
        documentType: before.person.documentType,
        documentNumber: before.person.documentNumber,
        birthDate: before.person.birthDate?.toISOString().slice(0, 10) ?? null,
        sex: before.person.sex,
        groupId: before.currentGroupId,
        status: before.status,
      };
      const changed = PHIDIAS_OWNED_FIELDS.filter((f) => b[f] !== undefined && (b[f] ?? null) !== (current[f] ?? null));
      if (changed.length && (await this.dataSource(tx, user.tenantId)) === 'PHIDIAS' && (await this.phidiasLink(tx, studentId))) {
        throw conflict('PHIDIAS_OWNED', `Estos datos se administran en Phidias: ${changed.map((f) => FIELD_LABELS[f]).join(', ')}. Corríjalos en Phidias o cambie el colegio a modalidad independiente.`);
      }
      if (b.code !== undefined && b.code !== before.code && (await tx.student.findUnique({ where: { tenantId_code: { tenantId: user.tenantId, code: b.code } } }))) throw conflict('STUDENT_CODE_IN_USE', `Ya existe un estudiante con el código ${b.code}.`);
      if (b.groupId && b.groupId !== before.currentGroupId && !(await tx.group.findUnique({ where: { id: b.groupId } }))) throw notFound('Grupo');
      const inactive = b.status === 'INACTIVE';
      await tx.person.update({
        where: { id: before.personId },
        data: {
          firstName: b.firstName,
          lastName: b.lastName,
          documentType: b.documentType,
          documentNumber: b.documentNumber,
          birthDate: b.birthDate === undefined ? undefined : b.birthDate ? new Date(`${b.birthDate}T00:00:00Z`) : null,
          sex: b.sex,
          email: b.email,
          phone: b.phone,
          mobile: b.mobile,
          address: b.address,
          ...(b.status && { status: b.status, inactiveReason: inactive ? (b.inactiveReason ?? 'withdrawn') : null }),
          updatedBy: user.id,
        },
      });
      await tx.student.update({
        where: { id: studentId },
        data: { code: b.code, currentGroupId: b.groupId, transport: b.transport, ...(b.status && { status: b.status, inactiveReason: inactive ? (b.inactiveReason ?? 'withdrawn') : null }) },
      });
      if (b.groupId && b.groupId !== before.currentGroupId) {
        const yearLabel = String(new Date().getFullYear());
        await tx.enrollment.upsert({ where: { studentId_yearLabel: { studentId, yearLabel } }, create: { tenantId: user.tenantId, studentId, groupId: b.groupId, yearLabel, status: 'activo' }, update: { groupId: b.groupId } });
      }
      await this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: 'people.student_updated', entity: 'student', entityId: studentId, after: { fields: Object.keys(b).filter((k) => b[k as keyof typeof b] !== undefined) }, meta });
      return { id: studentId };
    });
  }

  // ── academic structure (independent mode) ────────────────────────────────
  private async assertStructureEditable(tx: Tx, user: AuthUser) {
    if (!can(user, 'people:write', 'admin:settings')) throw forbidden();
    if ((await this.dataSource(tx, user.tenantId)) === 'PHIDIAS') throw conflict('PHIDIAS_MANAGED', 'En modalidad Phidias las secciones, grados y grupos se administran en Phidias.');
  }

  async createSection(user: AuthUser, b: z.infer<typeof sectionUpsertSchema>, meta: RequestMeta) {
    return this.prisma.forUser(user, async (tx) => {
      await this.assertStructureEditable(tx, user);
      if (await tx.section.findUnique({ where: { tenantId_code: { tenantId: user.tenantId, code: b.code } } })) throw conflict('CODE_IN_USE', `Ya existe una sección con el código ${b.code}.`);
      const r = await tx.section.create({ data: { tenantId: user.tenantId, ...b } });
      await this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: 'structure.section_created', entity: 'section', entityId: r.id, after: b, meta });
      return r;
    });
  }

  async updateSection(user: AuthUser, id: string, b: Partial<z.infer<typeof sectionUpsertSchema>>, meta: RequestMeta) {
    return this.prisma.forUser(user, async (tx) => {
      await this.assertStructureEditable(tx, user);
      const before = await tx.section.findUnique({ where: { id } });
      if (!before) throw notFound('Sección');
      if (b.code && b.code !== before.code && (await tx.section.findUnique({ where: { tenantId_code: { tenantId: user.tenantId, code: b.code } } }))) throw conflict('CODE_IN_USE', `Ya existe una sección con el código ${b.code}.`);
      const r = await tx.section.update({ where: { id }, data: b });
      await this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: 'structure.section_updated', entity: 'section', entityId: id, before, after: r, meta });
      return r;
    });
  }

  async createGrade(user: AuthUser, b: z.infer<typeof gradeUpsertSchema>, meta: RequestMeta) {
    return this.prisma.forUser(user, async (tx) => {
      await this.assertStructureEditable(tx, user);
      if (!(await tx.section.findUnique({ where: { id: b.sectionId } }))) throw notFound('Sección');
      if (await tx.grade.findUnique({ where: { tenantId_code: { tenantId: user.tenantId, code: b.code } } })) throw conflict('CODE_IN_USE', `Ya existe un grado con el código ${b.code}.`);
      const r = await tx.grade.create({ data: { tenantId: user.tenantId, ...b } });
      await this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: 'structure.grade_created', entity: 'grade', entityId: r.id, after: b, meta });
      return r;
    });
  }

  async updateGrade(user: AuthUser, id: string, b: Partial<z.infer<typeof gradeUpsertSchema>>, meta: RequestMeta) {
    return this.prisma.forUser(user, async (tx) => {
      await this.assertStructureEditable(tx, user);
      const before = await tx.grade.findUnique({ where: { id } });
      if (!before) throw notFound('Grado');
      if (b.sectionId && !(await tx.section.findUnique({ where: { id: b.sectionId } }))) throw notFound('Sección');
      if (b.code && b.code !== before.code && (await tx.grade.findUnique({ where: { tenantId_code: { tenantId: user.tenantId, code: b.code } } }))) throw conflict('CODE_IN_USE', `Ya existe un grado con el código ${b.code}.`);
      const r = await tx.grade.update({ where: { id }, data: b });
      await this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: 'structure.grade_updated', entity: 'grade', entityId: id, before, after: r, meta });
      return r;
    });
  }

  async createGroup(user: AuthUser, b: z.infer<typeof groupUpsertSchema>, meta: RequestMeta) {
    return this.prisma.forUser(user, async (tx) => {
      await this.assertStructureEditable(tx, user);
      if (!(await tx.grade.findUnique({ where: { id: b.gradeId } }))) throw notFound('Grado');
      if (await tx.group.findUnique({ where: { tenantId_code: { tenantId: user.tenantId, code: b.code } } })) throw conflict('CODE_IN_USE', `Ya existe un grupo con el código ${b.code}.`);
      const r = await tx.group.create({ data: { tenantId: user.tenantId, ...b } });
      await this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: 'structure.group_created', entity: 'group', entityId: r.id, after: b, meta });
      return r;
    });
  }

  async updateGroup(user: AuthUser, id: string, b: Partial<z.infer<typeof groupUpsertSchema>>, meta: RequestMeta) {
    return this.prisma.forUser(user, async (tx) => {
      await this.assertStructureEditable(tx, user);
      const before = await tx.group.findUnique({ where: { id }, include: { _count: { select: { students: { where: { status: 'ACTIVE' } } } } } });
      if (!before) throw notFound('Grupo');
      if (b.active === false && before._count.students > 0) throw conflict('GROUP_HAS_STUDENTS', `El grupo tiene ${before._count.students} estudiantes activos. Muévalos a otro grupo antes de desactivarlo.`);
      if (b.gradeId && !(await tx.grade.findUnique({ where: { id: b.gradeId } }))) throw notFound('Grado');
      if (b.code && b.code !== before.code && (await tx.group.findUnique({ where: { tenantId_code: { tenantId: user.tenantId, code: b.code } } }))) throw conflict('CODE_IN_USE', `Ya existe un grupo con el código ${b.code}.`);
      const { _count: _c, ...plain } = before;
      const r = await tx.group.update({ where: { id }, data: b });
      await this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: 'structure.group_updated', entity: 'group', entityId: id, before: plain, after: r, meta });
      return r;
    });
  }

  /** Critical sheet for the one-click EMERGENCY mode (PLAN §2.3). */
  async emergencyCard(user: AuthUser, studentId: string, meta: RequestMeta) {
    return this.prisma.forUser(user, async (tx) => {
      const s = await this.access.assertStudent(tx, user, studentId, 'clinical', meta);
      const [profile, allergies, conditions, plans, devices, guardians, contacts, meds] = await Promise.all([
        tx.healthProfile.findUnique({ where: { personId: s.personId } }),
        tx.allergy.findMany({ where: { personId: s.personId, active: true }, orderBy: { severity: 'desc' } }),
        tx.chronicCondition.findMany({ where: { personId: s.personId, active: true } }),
        tx.carePlan.findMany({ where: { personId: s.personId, active: true } }),
        tx.medicalDevice.findMany({ where: { personId: s.personId, active: true } }),
        tx.studentGuardian.findMany({ where: { studentId, active: true }, include: { guardian: { include: { person: true } } }, orderBy: { priority: 'asc' } }),
        tx.emergencyContact.findMany({ where: { studentId, active: true } }),
        tx.medicationRequest.findMany({ where: { studentId, status: 'ACTIVE', isPrn: true } }),
      ]);
      const protocolKeys = new Set<string>();
      if (allergies.some((a) => a.severity === 'ANAPHYLAXIS' || a.requiresEpinephrine)) protocolKeys.add('anaphylaxis');
      for (const c of conditions) {
        const n = c.name.toLowerCase();
        if (n.includes('asma')) protocolKeys.add('asthma');
        if (n.includes('epilep')) protocolKeys.add('seizure');
        if (n.includes('diabetes')) protocolKeys.add('hypoglycemia');
      }
      protocolKeys.add('cpr');
      await this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: 'clinical.emergency_card_opened', entity: 'student', entityId: studentId, meta });
      return {
        student: studentSummary(s, { photosEnabled: this.photos.enabled }),
        bloodType: profile?.bloodType ?? null,
        insurance: { eps: profile?.eps, prepaid: profile?.prepaidPlan, accidentInsurance: profile?.accidentInsurance, policy: profile?.accidentPolicyNumber, preferredIps: profile?.preferredIps },
        allergies,
        conditions,
        carePlans: plans,
        devices,
        rescueMedications: meds.map((m) => ({ id: m.id, name: m.medicationName, dose: `${m.dose} ${m.doseUnit}`, route: m.route, criteria: m.prnCriteria })),
        contacts: [
          ...guardians.map((g) => ({ name: personName(g.guardian.person), relationship: g.relationship, phone: g.guardian.person.mobile ?? g.guardian.person.phone, priority: g.priority, canPickUp: g.canPickUp })),
          ...contacts.map((c) => ({ name: c.name, relationship: c.relationship, phone: c.phone, priority: 9, canPickUp: c.canPickUp })),
        ],
        protocols: EMERGENCY_PROTOCOLS.filter((p) => protocolKeys.has(p.key)),
        emergencyNumber: '123',
      };
    });
  }

  async timeline(user: AuthUser, studentId: string, meta: RequestMeta) {
    return this.prisma.forUser(user, async (tx) => {
      const s = await this.access.assertStudent(tx, user, studentId, 'clinical', meta);
      const isParent = !can(user, 'clinical:read');
      const tz = (await tx.tenant.findUniqueOrThrow({ where: { id: user.tenantId } })).timezone;
      const [encounters, passes, admins, consents, exits] = await Promise.all([
        tx.encounter.findMany({
          where: { personId: s.personId, ...(isParent ? { isMentalHealth: false, status: { not: 'ANNULLED' } } : {}) },
          include: { diagnoses: true, incident: true },
          orderBy: { startedAt: 'desc' },
          take: 200,
        }),
        tx.pass.findMany({ where: { studentId }, orderBy: { requestedAt: 'desc' }, take: 100 }),
        tx.medicationAdministration.findMany({ where: { studentId }, include: { request: { select: { medicationName: true } } }, orderBy: { administeredAt: 'desc' }, take: 200 }),
        tx.consent.findMany({ where: { studentId }, include: { template: { select: { title: true, version: true } } }, orderBy: { signedAt: 'desc' } }),
        tx.gateCheckout.findMany({ where: { studentId }, include: { exitAuthorization: true }, orderBy: { checkedOutAt: 'desc' }, take: 50 }),
      ]);
      const events = [
        ...encounters.map((e) => ({
          kind: 'ENCOUNTER',
          id: e.id,
          at: e.startedAt,
          title: e.chiefComplaint,
          subtitle: isParent ? (e.parentSummary ?? 'Atención en enfermería') : [e.diagnoses.map((d) => `${d.code} ${d.description}`).join(', '), e.attendedByName].filter(Boolean).join(' · '),
          status: e.status,
          accident: !!e.incident,
          historical: e.isHistorical,
        })),
        ...passes.map((p) => ({ kind: 'PASS', id: p.id, at: p.requestedAt, title: `Pase: ${p.reason}`, subtitle: `${PASS_STATE_LABELS[p.state as PassState]}${p.subject ? ` · ${p.subject}` : ''}`, status: p.state })),
        ...admins.map((a) => ({ kind: 'MEDICATION', id: a.id, at: a.administeredAt, title: a.request.medicationName, subtitle: `${a.outcome === 'GIVEN' ? 'Administrado' : 'No administrado'} ${timeInTz(a.administeredAt, tz)}`, status: a.outcome })),
        ...consents.map((c) => ({ kind: 'CONSENT', id: c.id, at: c.signedAt, title: `Consentimiento: ${c.template.title}`, subtitle: `v${c.template.version}`, status: c.status })),
        ...exits.map((x) => ({ kind: 'EXIT', id: x.id, at: x.checkedOutAt, title: 'Salida por portería', subtitle: `Recogido por ${x.exitAuthorization.pickupName ?? 'autorización permanente'}`, status: 'DONE' })),
      ].sort((a, b) => b.at.getTime() - a.at.getTime());
      return { student: studentSummary(s, { photosEnabled: this.photos.enabled }), events };
    });
  }

  async structure(user: AuthUser, includeInactive = false) {
    return this.prisma.forUser(user, async (tx) => {
      const all = includeInactive && can(user, 'people:write', 'admin:settings');
      const sections = await tx.section.findMany({
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        include: { grades: { orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], include: { groups: { where: all ? {} : { active: true }, orderBy: { code: 'asc' }, include: { _count: { select: { students: { where: { status: 'ACTIVE' } } } } } } } } },
      });
      const mine = hasRole(user, 'TEACHER') ? new Set(await this.access.teacherGroupIds(tx, user)) : new Set<string>();
      return sections.map((s) => ({
        id: s.id,
        code: s.code,
        name: s.name,
        sortOrder: s.sortOrder,
        external: !!s.externalId,
        grades: s.grades.map((g) => ({
          id: g.id,
          code: g.code,
          name: g.name,
          sortOrder: g.sortOrder,
          external: !!g.externalId,
          groups: g.groups.map((gr) => ({ id: gr.id, code: gr.code, name: gr.name, active: gr.active, external: !!gr.externalId, students: gr._count.students, mine: mine.has(gr.id) })),
        })),
      }));
    });
  }

  /** Teacher view: my groups (current class first, from schedule blocks) with students and live pass state. */
  async teacherClass(user: AuthUser) {
    return this.prisma.forUser(user, async (tx) => {
      const tz = (await tx.tenant.findUniqueOrThrow({ where: { id: user.tenantId } })).timezone;
      const now = new Date();
      const hhmm = timeInTz(now, tz);
      const dow = new Date(now.toLocaleString('en-US', { timeZone: tz })).getDay();
      const tgs = await tx.teacherGroup.findMany({ where: { userId: user.id }, include: { group: { include: { grade: true, scheduleBlocks: { where: { dayOfWeek: dow } } } } } });
      const groups = [];
      for (const tg of tgs) {
        const current = tg.group.scheduleBlocks.find((b) => b.startTime <= hhmm && b.endTime > hhmm && (!b.teacherUserId || b.teacherUserId === user.id));
        const students = await tx.student.findMany({
          where: { currentGroupId: tg.groupId, status: 'ACTIVE' },
          include: {
            person: { include: { allergies: { where: { active: true, severity: { in: ['SEVERE', 'ANAPHYLAXIS'] } }, select: { id: true } }, conditions: { where: { active: true, critical: true }, select: { id: true } } } },
            passes: { where: { state: { in: OPEN_STATES } }, orderBy: { requestedAt: 'desc' }, take: 1 },
          },
          orderBy: [{ person: { lastName: 'asc' } }, { person: { firstName: 'asc' } }],
        });
        groups.push({
          id: tg.groupId,
          name: tg.group.name,
          grade: tg.group.grade.name,
          subject: current?.subject ?? tg.subject,
          isCurrent: !!current,
          students: students.map((s) => ({
            id: s.id,
            code: s.code,
            name: personName(s.person),
            photoUrl: studentPhotoUrl(s.id, s.person, this.photos.enabled),
            medicalAlert: s.person.allergies.length > 0 || s.person.conditions.length > 0,
            openPass: s.passes[0] ? { id: s.passes[0].id, state: s.passes[0].state, label: PASS_STATE_LABELS[s.passes[0].state as PassState], requestedAt: s.passes[0].requestedAt } : null,
          })),
        });
      }
      return groups.sort((a, b) => Number(b.isCurrent) - Number(a.isCurrent));
    });
  }

  async linkGuardian(user: AuthUser, studentId: string, body: z.infer<typeof guardianLinkSchema>, meta: RequestMeta) {
    if (!can(user, 'people:write', 'clinical:write')) throw forbidden();
    return this.prisma.forUser(user, async (tx) => {
      await this.access.assertStudent(tx, user, studentId, 'basic');
      let personId = body.guardianPersonId ?? null;
      if (!personId) {
        if (!body.firstName || !body.lastName || !body.documentNumber) throw forbidden('Indique nombres, apellidos y documento del acudiente.');
        const existing = await tx.person.findFirst({ where: { kind: 'GUARDIAN', documentNumber: body.documentNumber } });
        personId =
          existing?.id ??
          (await tx.person.create({ data: { tenantId: user.tenantId, kind: 'GUARDIAN', firstName: body.firstName, lastName: body.lastName, documentType: body.documentType, documentNumber: body.documentNumber, email: body.email, mobile: body.phone, createdBy: user.id } })).id;
      }
      const guardian = (await tx.guardian.findUnique({ where: { personId } })) ?? (await tx.guardian.create({ data: { tenantId: user.tenantId, personId } }));
      const link = await tx.studentGuardian.upsert({
        where: { studentId_guardianId: { studentId, guardianId: guardian.id } },
        create: { tenantId: user.tenantId, studentId, guardianId: guardian.id, relationship: body.relationship, isPrimary: body.isPrimary, canPickUp: body.canPickUp, legalCustody: body.legalCustody, priority: body.priority, restrictions: body.restrictions ?? null },
        update: { relationship: body.relationship, isPrimary: body.isPrimary, canPickUp: body.canPickUp, legalCustody: body.legalCustody, priority: body.priority, restrictions: body.restrictions ?? null, active: true },
      });
      await this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: 'people.guardian_linked', entity: 'student_guardian', entityId: link.id, after: { studentId, guardianId: guardian.id, relationship: body.relationship, canPickUp: body.canPickUp }, meta });
      return link;
    });
  }

  async updateGuardianLink(user: AuthUser, studentId: string, linkId: string, body: Partial<z.infer<typeof guardianLinkSchema>> & { judicialRestriction?: boolean; active?: boolean }, meta: RequestMeta) {
    if (!can(user, 'people:write', 'clinical:write')) throw forbidden();
    return this.prisma.forUser(user, async (tx) => {
      const before = await tx.studentGuardian.findFirst({ where: { id: linkId, studentId } });
      if (!before) throw notFound('Vínculo');
      const after = await tx.studentGuardian.update({
        where: { id: linkId },
        data: { relationship: body.relationship, isPrimary: body.isPrimary, canPickUp: body.canPickUp, legalCustody: body.legalCustody, priority: body.priority, restrictions: body.restrictions, judicialRestriction: body.judicialRestriction, active: body.active },
      });
      await this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: 'people.guardian_link_updated', entity: 'student_guardian', entityId: linkId, before, after, meta });
      return after;
    });
  }

  async addEmergencyContact(user: AuthUser, studentId: string, body: z.infer<typeof emergencyContactSchema>, meta: RequestMeta) {
    return this.prisma.forUser(user, async (tx) => {
      const isParent = hasRole(user, 'PARENT') && (await this.access.childrenIds(tx, user)).includes(studentId);
      if (!isParent && !can(user, 'people:write', 'clinical:write')) throw forbidden();
      await this.access.assertStudent(tx, user, studentId, 'basic');
      const c = await tx.emergencyContact.create({ data: { tenantId: user.tenantId, studentId, ...body, verified: !isParent, verifiedAt: isParent ? null : new Date(), createdBy: user.id } });
      await this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: 'people.emergency_contact_added', entity: 'emergency_contact', entityId: c.id, after: { studentId, relationship: body.relationship, canPickUp: body.canPickUp }, meta });
      return c;
    });
  }

  async updateEmergencyContact(user: AuthUser, studentId: string, contactId: string, body: Partial<z.infer<typeof emergencyContactSchema>> & { active?: boolean; verified?: boolean }, meta: RequestMeta) {
    return this.prisma.forUser(user, async (tx) => {
      const isParent = hasRole(user, 'PARENT') && (await this.access.childrenIds(tx, user)).includes(studentId);
      if (!isParent && !can(user, 'people:write', 'clinical:write')) throw forbidden();
      const before = await tx.emergencyContact.findFirst({ where: { id: contactId, studentId } });
      if (!before) throw notFound('Contacto');
      const verified = isParent ? (body.phone || body.name ? false : before.verified) : (body.verified ?? before.verified);
      const after = await tx.emergencyContact.update({ where: { id: contactId }, data: { ...body, verified, verifiedAt: verified && !before.verified ? new Date() : before.verifiedAt } });
      await this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: 'people.emergency_contact_updated', entity: 'emergency_contact', entityId: contactId, before, after, meta });
      return after;
    });
  }

  async createInvitation(user: AuthUser, body: z.infer<typeof invitationCreateSchema>, meta: RequestMeta) {
    if (!can(user, 'people:write', 'clinical:write')) throw forbidden();
    return this.prisma.forUser(user, async (tx) => {
      await this.access.assertStudent(tx, user, body.studentId, 'basic');
      const code = randomCode(10);
      const inv = await tx.invitation.create({
        data: { tenantId: user.tenantId, code, studentId: body.studentId, relationship: body.relationship, email: body.email ?? null, expiresAt: new Date(Date.now() + body.expiresInDays * 86400000), createdBy: user.id },
      });
      await this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: 'people.invitation_created', entity: 'invitation', entityId: inv.id, after: { studentId: body.studentId }, meta });
      return { code, expiresAt: inv.expiresAt, link: `${config().PUBLIC_WEB_URL}/registro?codigo=${code}` };
    });
  }

  async staff(user: AuthUser, q?: string) {
    return this.prisma.forUser(user, (tx) =>
      tx.person.findMany({
        where: { kind: 'STAFF', status: 'ACTIVE', ...(q ? { OR: [{ firstName: { contains: q, mode: 'insensitive' } }, { lastName: { contains: q, mode: 'insensitive' } }, { documentNumber: { startsWith: q } }] } : {}) },
        select: { id: true, firstName: true, lastName: true, documentNumber: true, staff: { select: { position: true, isTeacher: true, isFirstResponder: true } } },
        orderBy: [{ lastName: 'asc' }],
        take: 50,
      }),
    );
  }

  async createStaff(user: AuthUser, body: { firstName: string; lastName: string; documentNumber: string; position?: string | null; isFirstResponder?: boolean }, meta: RequestMeta) {
    if (!can(user, 'people:write', 'clinical:write')) throw forbidden();
    return this.prisma.forUser(user, async (tx) => {
      const person = await tx.person.create({ data: { tenantId: user.tenantId, kind: 'STAFF', documentType: 'CC', documentNumber: body.documentNumber, firstName: body.firstName, lastName: body.lastName, createdBy: user.id } });
      await tx.staff.create({ data: { tenantId: user.tenantId, personId: person.id, position: body.position ?? null, isFirstResponder: !!body.isFirstResponder } });
      await this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: 'people.staff_created', entity: 'person', entityId: person.id, meta });
      return person;
    });
  }

  templatesFor() {
    return ENCOUNTER_TEMPLATES;
  }

  /** Health staff users (witness selection for controlled medication). */
  async clinicalStaff(user: AuthUser) {
    return this.prisma.forUser(user, async (tx) => {
      const users = await tx.user.findMany({
        where: { active: true, id: { not: user.id }, roles: { some: { role: { in: ['NURSE', 'DOCTOR', 'HEALTH_COORDINATOR'] } } } },
        select: { id: true, firstName: true, lastName: true },
        orderBy: { lastName: 'asc' },
      });
      return users.map((u) => ({ id: u.id, name: personName(u) }));
    });
  }
}
