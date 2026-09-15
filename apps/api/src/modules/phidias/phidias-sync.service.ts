import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { Tx } from '@sgee/db';
import { AuditService } from '../../common/audit.service';
import { PrismaService } from '../../common/prisma.service';
import { config } from '../../config';
import { PhotoService } from '../files/storage.service';
import { JobsService } from '../jobs/jobs.service';
import {
  type CanonicalRelative,
  type CanonicalStudent,
  PARENTAL,
  parseConsolidate,
  parseNursingPoll,
  parseRelatives,
  relativeHash,
  splitFullName,
  structureHash,
  studentHash,
} from './phidias.adapter';
import { PhidiasClient, PhidiasPermissionError } from './phidias.client';

export const SOURCE = 'phidias';
export type SyncKind = 'FULL' | 'INCREMENTAL' | 'ONE' | 'PHOTOS' | 'HISTORY' | 'RELATIVES';

/** Links that already existed locally keep this hash prefix and are never deactivated by the sync. */
const LOCAL_PREFIX = 'local:';
const sameHash = (stored: string | undefined, hash: string) => !!stored && stored.replace(LOCAL_PREFIX, '') === hash;
type Counters = { inserted: number; updated: number; skipped: number; deactivated: number; errors: number };

export interface SyncSummary {
  runId: string;
  kind: SyncKind;
  status: 'SUCCESS' | 'FAILED';
  inserted: number;
  updated: number;
  skipped: number;
  deactivated: number;
  errors: number;
  details: Record<string, unknown>;
}

/** Default owner of each synchronized field (PLAN §6.1). */
export const DEFAULT_FIELD_OWNERSHIP: { entity: string; field: string; owner: 'PHIDIAS' | 'LOCAL' | 'MERGE' }[] = [
  { entity: 'person', field: 'documentType', owner: 'PHIDIAS' },
  { entity: 'person', field: 'documentNumber', owner: 'PHIDIAS' },
  { entity: 'person', field: 'firstName', owner: 'PHIDIAS' },
  { entity: 'person', field: 'lastName', owner: 'PHIDIAS' },
  { entity: 'person', field: 'birthDate', owner: 'PHIDIAS' },
  { entity: 'person', field: 'sex', owner: 'PHIDIAS' },
  { entity: 'person', field: 'nationality', owner: 'PHIDIAS' },
  { entity: 'person', field: 'email', owner: 'MERGE' },
  { entity: 'person', field: 'phone', owner: 'MERGE' },
  { entity: 'person', field: 'mobile', owner: 'MERGE' },
  { entity: 'person', field: 'address', owner: 'MERGE' },
  { entity: 'student', field: 'code', owner: 'PHIDIAS' },
  { entity: 'student', field: 'currentGroupId', owner: 'PHIDIAS' },
  { entity: 'student', field: 'enrollmentStatus', owner: 'PHIDIAS' },
  { entity: 'student', field: 'transport', owner: 'LOCAL' },
  { entity: 'student', field: 'shift', owner: 'LOCAL' },
  { entity: 'student_guardian', field: 'relationship', owner: 'PHIDIAS' },
  { entity: 'student_guardian', field: 'isPrimary', owner: 'PHIDIAS' },
  { entity: 'student_guardian', field: 'canPickUp', owner: 'LOCAL' },
  { entity: 'student_guardian', field: 'judicialRestriction', owner: 'LOCAL' },
  { entity: 'emergency_contact', field: 'phone', owner: 'PHIDIAS' },
  { entity: 'health_profile', field: '*', owner: 'LOCAL' },
  { entity: 'emergency_contact', field: '*', owner: 'LOCAL' },
  { entity: 'notification_preference', field: '*', owner: 'LOCAL' },
];

const PERSON_FIELDS = ['documentType', 'documentNumber', 'firstName', 'lastName', 'birthDate', 'sex', 'nationality', 'email', 'phone', 'mobile', 'address'] as const;

@Injectable()
export class PhidiasSyncService implements OnModuleInit {
  private readonly logger = new Logger('PhidiasSync');

  constructor(
    private readonly prisma: PrismaService,
    private readonly client: PhidiasClient,
    private readonly photos: PhotoService,
    private readonly jobs: JobsService,
    private readonly audit: AuditService,
  ) {}

  onModuleInit() {
    const guard = (fn: (tenantId: string) => Promise<unknown>) => async (job: { tenantId: string | null }) => {
      if (!job.tenantId || !(await this.enabled(job.tenantId))) return { skipped: 'integration disabled' };
      return fn(job.tenantId);
    };
    this.jobs.register('phidias.sync.full', guard((t) => this.syncStudents(t, 'FULL')));
    this.jobs.register('phidias.sync.incremental', guard((t) => this.syncStudents(t, 'INCREMENTAL')));
    this.jobs.register('phidias.photos', guard((t) => this.syncPhotos(t)));
    this.jobs.register('phidias.history', guard((t) => this.importHistory(t)));
    this.jobs.register('phidias.relatives', guard((t) => this.syncRelatives(t)));
    this.jobs.every('phidias.sync.incremental', 60);
    this.jobs.dailyAt('phidias.sync.full', '02:00');
    this.jobs.dailyAt('phidias.relatives', '02:30');
    this.jobs.dailyAt('phidias.photos', '03:00');
    this.jobs.every('phidias.history', 60);
  }

  async enabled(tenantId: string) {
    const s = await this.prisma.forTenant(tenantId, (tx) => tx.integrationSetting.findUnique({ where: { tenantId_provider: { tenantId, provider: 'PHIDIAS' } } }));
    return !!s?.enabled;
  }

  private async startRun(tenantId: string, kind: SyncKind, userId?: string | null) {
    return this.prisma.forTenant(tenantId, (tx) => tx.syncRun.create({ data: { tenantId, source: SOURCE, kind, triggeredByUserId: userId ?? null, details: { mock: this.client.mock } } }));
  }

  private async finishRun(tenantId: string, runId: string, kind: SyncKind, s: Omit<SyncSummary, 'runId' | 'kind' | 'status'>, error?: Error): Promise<SyncSummary> {
    const status = error ? 'FAILED' : 'SUCCESS';
    const details = { ...s.details, mock: this.client.mock, ...(error ? { error: error.message } : {}) };
    await this.prisma.forTenant(tenantId, async (tx) => {
      await tx.syncRun.update({ where: { id: runId }, data: { status, finishedAt: new Date(), inserted: s.inserted, updated: s.updated, skipped: s.skipped, deactivated: s.deactivated, errors: s.errors, details: details as object } });
      await this.audit.log(tx, { tenantId, action: `phidias.sync.${kind.toLowerCase()}`, entity: 'sync_run', entityId: runId, after: { status, ...s, details: undefined } });
    });
    this.logger.log(`${kind} ${status}: +${s.inserted} ~${s.updated} =${s.skipped} -${s.deactivated} !${s.errors}`);
    return { runId, kind, status, ...s, details };
  }

  // ── students & academic structure ────────────────────────────────────────
  async syncStudents(tenantId: string, kind: 'FULL' | 'INCREMENTAL' | 'ONE', userId?: string | null, onlyExternalId?: string): Promise<SyncSummary> {
    const run = await this.startRun(tenantId, kind, userId);
    const c = { inserted: 0, updated: 0, skipped: 0, deactivated: 0, errors: 0, details: {} as Record<string, unknown> };
    try {
      const tz = (await this.prisma.forTenant(tenantId, (tx) => tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { timezone: true } }))).timezone;
      const raw = await this.client.get<unknown>('/1/course/consolidate', { limit: 10000 }, { cacheMs: kind === 'ONE' ? 5 * 60_000 : 0 });
      const parsed = parseConsolidate(raw, tz);
      if (!parsed.students.length && !this.client.mock) throw new Error('Phidias devolvió 0 estudiantes; se aborta para no desactivar la base.');

      const groupIds = await this.prisma.forTenant(tenantId, (tx) => this.syncStructure(tx, tenantId, parsed, c), { timeout: 120_000 });
      const ownership = await this.ownership(tenantId);
      const students = onlyExternalId ? parsed.students.filter((s) => s.externalId === onlyExternalId) : parsed.students;
      const seenCodes = new Map<string, string>();
      for (const s of parsed.students) if (s.code) seenCodes.set(s.code, seenCodes.has(s.code) ? 'DUP' : s.externalId);

      for (let i = 0; i < students.length; i += 150) {
        const chunk = students.slice(i, i + 150);
        await this.prisma.forTenant(tenantId, (tx) => this.applyStudents(tx, tenantId, run.id, chunk, groupIds, ownership, seenCodes, c), { timeout: 180_000 });
      }

      if (kind === 'FULL') {
        const present = new Set(parsed.students.map((s) => s.externalId));
        await this.prisma.forTenant(tenantId, async (tx) => {
          const links = await tx.externalId.findMany({ where: { source: SOURCE, entity: 'student', missingSince: null } });
          for (const l of links) {
            if (present.has(l.externalId)) continue;
            await tx.student.update({ where: { id: l.localId }, data: { status: 'INACTIVE', inactiveReason: 'source_missing', person: { update: { status: 'INACTIVE', inactiveReason: 'source_missing' } } } });
            await tx.externalId.update({ where: { id: l.id }, data: { missingSince: new Date() } });
            c.deactivated++;
          }
        }, { timeout: 120_000 });
      }
      c.details = { ...c.details, totalFromSource: parsed.students.length, groups: parsed.groups.length };
      return await this.finishRun(tenantId, run.id, kind, c);
    } catch (e) {
      c.errors++;
      await this.finishRun(tenantId, run.id, kind, c, e as Error);
      throw e;
    }
  }

  private async ownership(tenantId: string) {
    const rows = await this.prisma.forTenant(tenantId, (tx) => tx.fieldOwnership.findMany());
    const map = new Map<string, string>(DEFAULT_FIELD_OWNERSHIP.map((r) => [`${r.entity}.${r.field}`, r.owner]));
    for (const r of rows) map.set(`${r.entity}.${r.field}`, r.owner);
    return map;
  }

  private async syncStructure(tx: Tx, tenantId: string, parsed: ReturnType<typeof parseConsolidate>, c: { inserted: number; updated: number; skipped: number }) {
    const links = await tx.externalId.findMany({ where: { source: SOURCE, entity: { in: ['section', 'grade', 'group'] } } });
    const byKey = new Map(links.map((l) => [`${l.entity}:${l.externalId}`, l]));
    const sectionIds = new Map<string, string>();
    const gradeIds = new Map<string, string>();
    const groupIds = new Map<string, string>();

    const upsert = async (entity: string, externalId: string, payload: object, create: () => Promise<string>, update: (id: string) => Promise<unknown>) => {
      const hash = structureHash(payload);
      const link = byKey.get(`${entity}:${externalId}`);
      if (link) {
        if (link.contentHash !== hash) {
          await update(link.localId);
          await tx.externalId.update({ where: { id: link.id }, data: { contentHash: hash, syncedAt: new Date() } });
        }
        return link.localId;
      }
      const id = await create();
      await tx.externalId.create({ data: { tenantId, source: SOURCE, entity, externalId, localId: id, contentHash: hash } });
      c.inserted++;
      return id;
    };

    // Sections with the same code (e.g. two raw names mapping to PRE) share a row.
    for (const s of parsed.sections) {
      const existing = await tx.section.findUnique({ where: { tenantId_code: { tenantId, code: s.code } } });
      const id = await upsert(
        'section',
        s.externalId,
        s,
        async () => existing?.id ?? (await tx.section.create({ data: { tenantId, code: s.code, name: s.name, sortOrder: s.sortOrder, externalId: s.externalId } })).id,
        (id) => tx.section.update({ where: { id }, data: { name: s.name, sortOrder: s.sortOrder } }),
      );
      sectionIds.set(s.externalId, id);
    }
    for (const g of parsed.grades) {
      const sectionId = sectionIds.get(g.sectionExternalId)!;
      const existing = await tx.grade.findUnique({ where: { tenantId_code: { tenantId, code: g.code } } });
      const id = await upsert(
        'grade',
        g.externalId,
        g,
        async () => existing?.id ?? (await tx.grade.create({ data: { tenantId, sectionId, code: g.code, name: g.name, sortOrder: g.sortOrder, externalId: g.externalId } })).id,
        (id) => tx.grade.update({ where: { id }, data: { sectionId, name: g.name, sortOrder: g.sortOrder } }),
      );
      gradeIds.set(g.externalId, id);
    }
    for (const gr of parsed.groups) {
      const gradeId = gradeIds.get(gr.gradeExternalId)!;
      const existing = await tx.group.findUnique({ where: { tenantId_code: { tenantId, code: gr.code } } });
      const id = await upsert(
        'group',
        gr.externalId,
        gr,
        async () => existing?.id ?? (await tx.group.create({ data: { tenantId, gradeId, code: gr.code, name: gr.name, externalId: gr.externalId } })).id,
        (id) => tx.group.update({ where: { id }, data: { gradeId, name: gr.name, active: true } }),
      );
      groupIds.set(gr.externalId, id);
    }
    return groupIds;
  }

  private async applyStudents(
    tx: Tx,
    tenantId: string,
    runId: string,
    chunk: CanonicalStudent[],
    groupIds: Map<string, string>,
    ownership: Map<string, string>,
    seenCodes: Map<string, string>,
    c: { inserted: number; updated: number; skipped: number; errors: number },
  ) {
    const links = await tx.externalId.findMany({ where: { source: SOURCE, entity: 'student', externalId: { in: chunk.map((s) => s.externalId) } } });
    const byExt = new Map(links.map((l) => [l.externalId, l]));
    const conflict = (s: CanonicalStudent, kind: string, details: object) =>
      tx.syncConflict.create({ data: { tenantId, syncRunId: runId, entity: 'student', externalId: s.externalId, kind, details: details as object } });

    for (const s of chunk) {
      const hash = studentHash(s);
      const link = byExt.get(s.externalId);
      if (link && link.contentHash === hash && !link.missingSince) {
        c.skipped++;
        continue;
      }
      let code = s.code;
      if (!code) {
        code = `PH${s.externalId}`;
        if (!link) await conflict(s, 'MISSING_CODE', { assignedCode: code, name: `${s.firstName} ${s.lastName}` });
      } else if (seenCodes.get(code) === 'DUP') {
        code = `${code}-PH${s.externalId}`;
        if (!link) await conflict(s, 'DUPLICATE_CODE', { sourceCode: s.code, assignedCode: code });
      }
      const groupId = groupIds.get(s.groupExternalId) ?? null;
      const personData = {
        documentType: s.documentType,
        documentNumber: s.documentNumber,
        firstName: s.firstName || 'Sin nombre',
        lastName: s.lastName || '',
        birthDate: s.birthDate ? new Date(`${s.birthDate}T00:00:00Z`) : null,
        sex: s.sex,
        nationality: s.nationality,
        email: s.email,
        phone: s.phone,
        mobile: s.mobile,
        address: s.address,
      };
      const status = s.active ? 'ACTIVE' : 'INACTIVE';

      try {
        if (link) {
          const student = await tx.student.findUniqueOrThrow({ where: { id: link.localId }, include: { person: true } });
          const personUpdate: Record<string, unknown> = {};
          for (const f of PERSON_FIELDS) {
            const owner = ownership.get(`person.${f}`) ?? 'PHIDIAS';
            const current = (student.person as Record<string, unknown>)[f];
            if (owner === 'PHIDIAS' || (owner === 'MERGE' && (current === null || current === ''))) personUpdate[f] = personData[f];
          }
          await tx.person.update({ where: { id: student.personId }, data: { ...personUpdate, status, inactiveReason: s.active ? null : 'withdrawn' } });
          await tx.student.update({
            where: { id: student.id },
            data: {
              ...(ownership.get('student.code') !== 'LOCAL' && { code }),
              ...(ownership.get('student.currentGroupId') !== 'LOCAL' && { currentGroupId: groupId }),
              enrollmentStatus: s.enrollmentStatus,
              status,
              inactiveReason: s.active ? null : 'withdrawn',
            },
          });
          await tx.externalId.update({ where: { id: link.id }, data: { contentHash: hash, syncedAt: new Date(), sourceUpdatedAt: toDate(s.sourceUpdatedAt), missingSince: null } });
          c.updated++;
          continue;
        }

        // New in Phidias: link to a locally created student with the same document, otherwise create.
        let studentId: string | null = null;
        if (s.documentNumber) {
          const local = await tx.person.findFirst({ where: { kind: 'STUDENT', documentNumber: s.documentNumber }, include: { student: true } });
          if (local?.student) {
            const alreadyLinked = await tx.externalId.findFirst({ where: { source: SOURCE, entity: 'student', localId: local.student.id } });
            if (alreadyLinked) {
              await conflict(s, 'DUPLICATE_DOCUMENT', { documentNumber: s.documentNumber, otherExternalId: alreadyLinked.externalId });
            } else {
              studentId = local.student.id;
              await tx.person.update({ where: { id: local.id }, data: { ...personData, source: 'PHIDIAS', status } });
              await tx.student.update({ where: { id: studentId }, data: { code, currentGroupId: groupId, enrollmentStatus: s.enrollmentStatus, status, externalId: s.externalId } });
              await conflict(s, 'LINKED_BY_DOCUMENT', { localStudentId: studentId });
            }
          }
        }
        if (!studentId) {
          const person = await tx.person.create({ data: { tenantId, kind: 'STUDENT', source: 'PHIDIAS', status, ...personData } });
          const student = await tx.student.create({
            data: { tenantId, personId: person.id, code, currentGroupId: groupId, enrollmentStatus: s.enrollmentStatus, status, externalId: s.externalId, inactiveReason: s.active ? null : 'withdrawn' },
          });
          studentId = student.id;
          const year = String(new Date().getFullYear());
          await tx.enrollment.create({ data: { tenantId, studentId, groupId, yearLabel: year, status: s.enrollmentStatus ?? 'activo' } });
        }
        await tx.externalId.create({ data: { tenantId, source: SOURCE, entity: 'student', externalId: s.externalId, localId: studentId, contentHash: hash, sourceUpdatedAt: toDate(s.sourceUpdatedAt) } });
        c.inserted++;
      } catch (e) {
        c.errors++;
        await conflict(s, 'APPLY_ERROR', { message: (e as Error).message.slice(0, 300) });
      }
    }
  }

  // ── photos ───────────────────────────────────────────────────────────────
  async syncPhotos(tenantId: string, userId?: string | null): Promise<SyncSummary> {
    const run = await this.startRun(tenantId, 'PHOTOS', userId);
    const c = { inserted: 0, updated: 0, skipped: 0, deactivated: 0, errors: 0, details: {} as Record<string, unknown> };
    try {
      if (!this.photos.enabled) {
        c.details = { reason: 'S3 no configurado' };
        return await this.finishRun(tenantId, run.id, 'PHOTOS', c);
      }
      const students = await this.prisma.forTenant(tenantId, (tx) =>
        tx.student.findMany({ where: { status: 'ACTIVE' }, select: { id: true, code: true, personId: true, person: { select: { photoKey: true, photoHash: true } } } }),
      );
      const queue = [...students];
      const worker = async () => {
        while (queue.length) {
          const s = queue.shift()!;
          try {
            const found = await this.photos.find(s.code);
            if ((found?.key ?? null) === s.person.photoKey && (found?.etag ?? null) === s.person.photoHash) {
              c.skipped++;
              continue;
            }
            await this.prisma.forTenant(tenantId, (tx) => tx.person.update({ where: { id: s.personId }, data: { photoKey: found?.key ?? null, photoHash: found?.etag ?? null } }));
            if (found && !s.person.photoKey) c.inserted++;
            else if (!found) c.deactivated++;
            else c.updated++;
          } catch {
            c.errors++;
          }
        }
      };
      await Promise.all(Array.from({ length: 8 }, worker));
      c.details = { students: students.length };
      return await this.finishRun(tenantId, run.id, 'PHOTOS', c);
    } catch (e) {
      await this.finishRun(tenantId, run.id, 'PHOTOS', c, e as Error);
      throw e;
    }
  }

  // ── relatives: guardians and emergency contacts ───────────────────────────
  /**
   * Imports each student's relatives. Parents, legal guardians and relatives
   * marked as responsible or authorized to pick up become guardians linked to
   * the student; the remaining relatives marked as emergency contacts become
   * emergency contacts. Other relatives are not stored (data minimization).
   * Local decisions (who can pick up, judicial restrictions) are never overwritten.
   */
  async syncRelatives(tenantId: string, userId?: string | null, onlyStudentExternalId?: string): Promise<SyncSummary> {
    const run = await this.startRun(tenantId, 'RELATIVES', userId);
    const c = { inserted: 0, updated: 0, skipped: 0, deactivated: 0, errors: 0, details: {} as Record<string, unknown> };
    try {
      const cfg = config();
      const links = await this.prisma.forTenant(tenantId, (tx) =>
        tx.externalId.findMany({ where: { source: SOURCE, entity: 'student', missingSince: null, ...(onlyStudentExternalId ? { externalId: onlyStudentExternalId } : {}) }, select: { externalId: true, localId: true } }),
      );
      if (!links.length) {
        c.details = { reason: 'Sin estudiantes vinculados: ejecute primero la sincronización de estudiantes.' };
        return await this.finishRun(tenantId, run.id, 'RELATIVES', c);
      }
      const fetchRelatives = (studentExternalId: string) => this.client.get<unknown>(cfg.PHIDIAS_RELATIVES_ENDPOINT, { [cfg.PHIDIAS_RELATIVES_PARAM]: studentExternalId }, { cacheMs: 0 });
      // Probe the permission before downloading the people directory.
      const firstRaw = await fetchRelatives(links[0].externalId);
      const directory = new Map((await this.client.listPeople()).map((p) => [String(p.id), p]));
      const ownership = await this.ownership(tenantId);
      const seen = new Set<string>();
      let withRelatives = 0;
      let responseKeys: string[] = [];

      for (let i = 0; i < links.length; i += 25) {
        const batch: { link: { externalId: string; localId: string }; relatives: CanonicalRelative[] }[] = [];
        for (const link of links.slice(i, i + 25)) {
          const raw = i === 0 && link === links[0] ? firstRaw : await fetchRelatives(link.externalId);
          const first = Array.isArray(raw) ? raw[0] : raw;
          if (!responseKeys.length && first && typeof first === 'object') responseKeys = Object.keys(first).sort();
          const relatives = parseRelatives(raw, link.externalId, directory);
          if (relatives.length) withRelatives++;
          batch.push({ link, relatives });
        }
        await this.prisma.forTenant(tenantId, (tx) => this.applyRelatives(tx, tenantId, run.id, batch, ownership, seen, c), { timeout: 180_000 });
      }

      // Deactivate synced links that disappeared from Phidias (never on an empty answer for everyone).
      const suspicious = withRelatives === 0 && links.length > 20 && !this.client.mock;
      if (!onlyStudentExternalId && !suspicious) {
        await this.prisma.forTenant(tenantId, async (tx) => {
          const synced = await tx.externalId.findMany({ where: { source: SOURCE, entity: { in: ['student_guardian', 'emergency_contact'] }, missingSince: null } });
          for (const s of synced) {
            if (seen.has(`${s.entity}:${s.externalId}`)) continue;
            if (!s.contentHash.startsWith(LOCAL_PREFIX)) {
              if (s.entity === 'student_guardian') await tx.studentGuardian.update({ where: { id: s.localId }, data: { active: false } });
              else await tx.emergencyContact.update({ where: { id: s.localId }, data: { active: false } });
              c.deactivated++;
            }
            await tx.externalId.update({ where: { id: s.id }, data: { missingSince: new Date() } });
          }
        }, { timeout: 120_000 });
      }
      c.details = { students: links.length, studentsWithRelatives: withRelatives, directory: directory.size, responseKeys, ...(suspicious ? { deactivationSkipped: 'Phidias no devolvió parientes para ningún estudiante' } : {}) };
      return await this.finishRun(tenantId, run.id, 'RELATIVES', c);
    } catch (e) {
      c.errors++;
      if (e instanceof PhidiasPermissionError) {
        c.details = { ...c.details, reason: 'PERMISSION_DENIED', module: e.module, action: `Solicite a Phidias habilitar para el token de integración los permisos "${e.module}" y "people/details".` };
        return this.finishRun(tenantId, run.id, 'RELATIVES', c, new Error(`Phidias no autoriza la consulta de acudientes (${e.module}).`));
      }
      await this.finishRun(tenantId, run.id, 'RELATIVES', c, e as Error);
      throw e;
    }
  }

  private async applyRelatives(tx: Tx, tenantId: string, runId: string, batch: { link: { externalId: string; localId: string }; relatives: CanonicalRelative[] }[], ownership: Map<string, string>, seen: Set<string>, c: Counters) {
    const conflict = (externalId: string, kind: string, details: object) => tx.syncConflict.create({ data: { tenantId, syncRunId: runId, entity: 'relative', externalId, kind, details: details as object } });
    for (const { link, relatives } of batch) {
      for (const r of relatives) {
        const key = `${link.externalId}:${r.relativeExternalId}`;
        const hash = relativeHash(r);
        const phone = r.person?.mobile ?? r.person?.phone ?? null;
        const asGuardian = r.isResponsible || r.canPickUp === true || PARENTAL.includes(r.relationship);
        const asContact = !asGuardian && r.isEmergencyContact && !!phone;
        if (!asGuardian && !asContact) {
          c.skipped++;
          continue;
        }
        if (!r.person) {
          await conflict(key, 'RELATIVE_WITHOUT_PERSON', { relationship: r.relationshipLabel });
          c.errors++;
          continue;
        }
        const entity = asGuardian ? 'student_guardian' : 'emergency_contact';
        seen.add(`${entity}:${key}`);
        const existing = await tx.externalId.findUnique({ where: { tenantId_source_entity_externalId: { tenantId, source: SOURCE, entity, externalId: key } } });
        if (existing && sameHash(existing.contentHash, hash) && !existing.missingSince) {
          c.skipped++;
          continue;
        }
        try {
          if (asGuardian) await this.applyGuardian(tx, tenantId, runId, link.localId, r, key, hash, existing, ownership, c);
          else await this.applyEmergencyContact(tx, tenantId, link.localId, r, phone!, key, hash, existing, ownership, c);
        } catch (e) {
          c.errors++;
          await conflict(key, 'APPLY_ERROR', { message: (e as Error).message.slice(0, 300) });
        }
      }
    }
  }

  private async guardianPerson(tx: Tx, tenantId: string, runId: string, r: CanonicalRelative, ownership: Map<string, string>) {
    const p = r.person!;
    const data = { documentType: p.documentType, documentNumber: p.documentNumber, firstName: p.firstName || 'Sin nombre', lastName: p.lastName, sex: p.sex, email: p.email, phone: p.phone, mobile: p.mobile, address: p.address };
    const dataHash = structureHash(data);
    const link = await tx.externalId.findUnique({ where: { tenantId_source_entity_externalId: { tenantId, source: SOURCE, entity: 'guardian_person', externalId: r.relativeExternalId } } });
    let personId: string;
    if (link) {
      personId = link.localId;
      if (link.contentHash !== dataHash) {
        const current = (await tx.person.findUniqueOrThrow({ where: { id: personId } })) as unknown as Record<string, unknown>;
        const update: Record<string, unknown> = {};
        for (const [f, v] of Object.entries(data)) {
          const owner = ownership.get(`person.${f}`) ?? 'PHIDIAS';
          if (owner === 'PHIDIAS' || (owner === 'MERGE' && (current[f] === null || current[f] === ''))) update[f] = v;
        }
        await tx.person.update({ where: { id: personId }, data: update });
        await tx.externalId.update({ where: { id: link.id }, data: { contentHash: dataHash, syncedAt: new Date(), missingSince: null } });
      }
    } else {
      const local = p.documentNumber ? await tx.person.findFirst({ where: { kind: 'GUARDIAN', documentNumber: p.documentNumber } }) : null;
      const localLinked = local ? await tx.externalId.findFirst({ where: { source: SOURCE, entity: 'guardian_person', localId: local.id } }) : null;
      if (local && !localLinked) {
        // A guardian registered locally (e.g. by invitation): link it and only fill empty contact data.
        personId = local.id;
        await tx.person.update({ where: { id: local.id }, data: { documentType: data.documentType, email: local.email ?? data.email, mobile: local.mobile ?? data.mobile, phone: local.phone ?? data.phone, address: local.address ?? data.address } });
        await tx.syncConflict.create({ data: { tenantId, syncRunId: runId, entity: 'guardian_person', externalId: r.relativeExternalId, kind: 'LINKED_BY_DOCUMENT', details: { localPersonId: local.id } } });
      } else {
        personId = (await tx.person.create({ data: { tenantId, kind: 'GUARDIAN', source: 'PHIDIAS', ...data } })).id;
      }
      await tx.externalId.create({ data: { tenantId, source: SOURCE, entity: 'guardian_person', externalId: r.relativeExternalId, localId: personId, contentHash: dataHash } });
    }
    return (await tx.guardian.findUnique({ where: { personId } })) ?? (await tx.guardian.create({ data: { tenantId, personId } }));
  }

  private async applyGuardian(tx: Tx, tenantId: string, runId: string, studentId: string, r: CanonicalRelative, key: string, hash: string, existing: { id: string; contentHash: string } | null, ownership: Map<string, string>, c: Counters) {
    const guardian = await this.guardianPerson(tx, tenantId, runId, r, ownership);
    const owner = (f: string) => ownership.get(`student_guardian.${f}`) ?? 'PHIDIAS';
    const parental = PARENTAL.includes(r.relationship);
    const current = await tx.studentGuardian.findUnique({ where: { studentId_guardianId: { studentId, guardianId: guardian.id } } });
    let linkId: string;
    let created = false;
    if (!current) {
      linkId = (
        await tx.studentGuardian.create({
          data: { tenantId, studentId, guardianId: guardian.id, relationship: r.relationship, isPrimary: r.isResponsible, canPickUp: r.canPickUp ?? parental, legalCustody: parental || r.isResponsible },
        })
      ).id;
      created = true;
    } else {
      linkId = current.id;
      await tx.studentGuardian.update({
        where: { id: current.id },
        data: {
          ...(owner('relationship') !== 'LOCAL' && { relationship: r.relationship }),
          ...(owner('isPrimary') !== 'LOCAL' && { isPrimary: r.isResponsible }),
          ...(owner('canPickUp') === 'PHIDIAS' && r.canPickUp !== null && { canPickUp: r.canPickUp }),
          active: true,
        },
      });
    }
    if (existing) {
      await tx.externalId.update({ where: { id: existing.id }, data: { contentHash: existing.contentHash.startsWith(LOCAL_PREFIX) ? `${LOCAL_PREFIX}${hash}` : hash, syncedAt: new Date(), missingSince: null } });
      c.updated++;
    } else {
      await tx.externalId.create({ data: { tenantId, source: SOURCE, entity: 'student_guardian', externalId: key, localId: linkId, contentHash: created ? hash : `${LOCAL_PREFIX}${hash}` } });
      if (created) c.inserted++;
      else c.updated++;
    }
  }

  private async applyEmergencyContact(tx: Tx, tenantId: string, studentId: string, r: CanonicalRelative, phone: string, key: string, hash: string, existing: { id: string; localId: string; contentHash: string } | null, ownership: Map<string, string>, c: Counters) {
    const p = r.person!;
    const name = `${p.firstName} ${p.lastName}`.trim() || 'Contacto';
    const altPhone = p.mobile && p.phone && p.mobile !== p.phone ? p.phone : null;
    const syncPhone = (ownership.get('emergency_contact.phone') ?? 'PHIDIAS') !== 'LOCAL';
    if (existing) {
      await tx.emergencyContact.update({ where: { id: existing.localId }, data: { ...(syncPhone && { name, relationship: r.relationshipLabel, phone, altPhone }), active: true } });
      await tx.externalId.update({ where: { id: existing.id }, data: { contentHash: existing.contentHash.startsWith(LOCAL_PREFIX) ? `${LOCAL_PREFIX}${hash}` : hash, syncedAt: new Date(), missingSince: null } });
      c.updated++;
      return;
    }
    const digits = phone.replace(/\D/g, '');
    const local = (await tx.emergencyContact.findMany({ where: { studentId, active: true } })).find((x) => x.phone.replace(/\D/g, '') === digits);
    if (local) {
      await tx.externalId.create({ data: { tenantId, source: SOURCE, entity: 'emergency_contact', externalId: key, localId: local.id, contentHash: `${LOCAL_PREFIX}${hash}` } });
      c.updated++;
      return;
    }
    const contact = await tx.emergencyContact.create({
      data: { tenantId, studentId, name, relationship: r.relationshipLabel, phone, altPhone, canPickUp: r.canPickUp ?? false, documentNumber: p.documentNumber, notes: 'Sincronizado desde Phidias', verified: true, verifiedAt: new Date() },
    });
    await tx.externalId.create({ data: { tenantId, source: SOURCE, entity: 'emergency_contact', externalId: key, localId: contact.id, contentHash: hash } });
    c.inserted++;
  }

  // ── historical nursing records from Phidias polls ─────────────────────────
  async importHistory(tenantId: string, userId?: string | null): Promise<SyncSummary> {
    const run = await this.startRun(tenantId, 'HISTORY', userId);
    const c = { inserted: 0, updated: 0, skipped: 0, deactivated: 0, errors: 0, details: {} as Record<string, unknown> };
    try {
      const tz = (await this.prisma.forTenant(tenantId, (tx) => tx.tenant.findUniqueOrThrow({ where: { id: tenantId } }))).timezone;
      const cfg = config();
      const polls: [number, 'STUDENT' | 'STAFF'][] = [
        [cfg.POLL_ID_ENFERMERIA, 'STUDENT'],
        [cfg.POLL_ID_ENFERMERIA_COLAB, 'STAFF'],
      ];
      for (const [pollId, subject] of polls) {
        const raw = await this.client.get<unknown>('/1/poll/consolidate', { pollId }, { cacheMs: 0 });
        const records = parseNursingPoll(raw, pollId, subject, tz);
        c.details[`poll${pollId}`] = records.length;
        const existing = new Set(
          (await this.prisma.forTenant(tenantId, (tx) => tx.encounter.findMany({ where: { source: 'PHIDIAS_POLL', externalId: { startsWith: `${pollId}:` } }, select: { externalId: true } }))).map(
            (e) => e.externalId,
          ),
        );
        const pending = records.filter((r) => !existing.has(r.externalId));
        c.skipped += records.length - pending.length;
        for (let i = 0; i < pending.length; i += 50) {
          await this.prisma.forTenant(tenantId, async (tx) => {
            for (const r of pending.slice(i, i + 50)) {
              try {
                await this.importEncounter(tx, tenantId, r);
                c.inserted++;
              } catch (e) {
                c.errors++;
                this.logger.warn(`history ${r.externalId}: ${(e as Error).message.slice(0, 200)}`);
              }
            }
          }, { timeout: 120_000 });
        }
      }
      return await this.finishRun(tenantId, run.id, 'HISTORY', c);
    } catch (e) {
      await this.finishRun(tenantId, run.id, 'HISTORY', c, e as Error);
      throw e;
    }
  }

  private async importEncounter(tx: Tx, tenantId: string, r: ReturnType<typeof parseNursingPoll>[number]) {
    let personId: string;
    let studentId: string | null = null;
    const studentLink = r.subjectType === 'STUDENT' ? await tx.externalId.findFirst({ where: { source: SOURCE, entity: 'student', externalId: r.personExternalId } }) : null;
    if (studentLink) {
      const st = await tx.student.findUniqueOrThrow({ where: { id: studentLink.localId }, select: { id: true, personId: true } });
      personId = st.personId;
      studentId = st.id;
    } else {
      const entity = r.subjectType === 'STAFF' ? 'staff_person' : 'person';
      const link = await tx.externalId.findFirst({ where: { source: SOURCE, entity, externalId: r.personExternalId } });
      if (link) personId = link.localId;
      else {
        const names = splitFullName(r.personName);
        const person = await tx.person.create({
          data: {
            tenantId,
            kind: r.subjectType === 'STAFF' ? 'STAFF' : 'STUDENT',
            source: 'PHIDIAS',
            status: r.subjectType === 'STAFF' ? 'ACTIVE' : 'INACTIVE',
            inactiveReason: r.subjectType === 'STAFF' ? null : 'not_enrolled',
            documentNumber: r.personDocument,
            ...names,
          },
        });
        if (r.subjectType === 'STAFF') await tx.staff.create({ data: { tenantId, personId: person.id, externalId: r.personExternalId } });
        await tx.externalId.create({ data: { tenantId, source: SOURCE, entity, externalId: r.personExternalId, localId: person.id, contentHash: 'history' } });
        personId = person.id;
      }
    }

    const treatments = r.medication ? [{ description: `Medicamento: ${r.medication}` }] : [];
    const encounter = await tx.encounter.create({
      data: {
        tenantId,
        personId,
        studentId,
        subjectType: r.subjectType,
        type: r.type,
        status: 'OPEN',
        chiefComplaint: r.chiefComplaint.slice(0, 300),
        subjective: [r.symptoms, r.description].filter(Boolean).join('\n') || null,
        assessment: r.diagnosisText,
        referredBy: r.referredBy,
        referredFrom: r.referredFrom,
        startedAt: r.startedAt,
        endedAt: r.startedAt,
        treatments,
        isHistorical: true,
        source: 'PHIDIAS_POLL',
        externalId: r.externalId,
        attendedByName: r.attendedBy,
        historicalData: { pollId: r.pollId, schoolSection: r.schoolSection, medication: r.medication, classification: r.accident?.classification ?? null },
      },
    });
    if (r.accident) {
      await tx.incidentReport.create({
        data: { tenantId, encounterId: encounter.id, place: r.accident.zone, mechanism: r.chiefComplaint.slice(0, 300), severity: r.accident.severity, activity: r.referredFrom },
      });
    }
    await tx.encounter.update({ where: { id: encounter.id }, data: { status: 'CLOSED' } });
  }

  async status(tenantId: string) {
    return this.prisma.forTenant(tenantId, async (tx) => {
      const [setting, runs, conflicts, students, active, withPhoto, historical, guardians, contacts, lastRelatives] = await Promise.all([
        tx.integrationSetting.findUnique({ where: { tenantId_provider: { tenantId, provider: 'PHIDIAS' } } }),
        tx.syncRun.findMany({ orderBy: { startedAt: 'desc' }, take: 20 }),
        tx.syncConflict.count({ where: { status: 'OPEN' } }),
        tx.externalId.count({ where: { source: SOURCE, entity: 'student' } }),
        tx.student.count({ where: { status: 'ACTIVE' } }),
        tx.person.count({ where: { kind: 'STUDENT', photoKey: { not: null } } }),
        tx.encounter.count({ where: { source: 'PHIDIAS_POLL' } }),
        tx.externalId.count({ where: { source: SOURCE, entity: 'student_guardian', missingSince: null } }),
        tx.externalId.count({ where: { source: SOURCE, entity: 'emergency_contact', missingSince: null } }),
        tx.syncRun.findFirst({ where: { kind: 'RELATIVES', status: { not: 'RUNNING' } }, orderBy: { startedAt: 'desc' } }),
      ]);
      const rd = (lastRelatives?.details ?? {}) as { reason?: string; module?: string };
      return {
        enabled: !!setting?.enabled,
        mock: this.client.mock,
        photosEnabled: this.photos.enabled,
        runs,
        openConflicts: conflicts,
        linkedStudents: students,
        activeStudents: active,
        studentsWithPhoto: withPhoto,
        historicalEncounters: historical,
        guardiansLinked: guardians,
        emergencyContactsLinked: contacts,
        relativesPermission: lastRelatives ? { denied: rd.reason === 'PERMISSION_DENIED', module: rd.module ?? null, checkedAt: lastRelatives.startedAt } : null,
      };
    });
  }
}

function toDate(v: string | null): Date | null {
  if (!v) return null;
  const d = new Date(v.replace(' ', 'T') + '-05:00');
  return Number.isNaN(d.getTime()) ? null : d;
}
