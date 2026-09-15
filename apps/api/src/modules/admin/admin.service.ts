import { Injectable, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@sgee/db';
import {
  type auditQuerySchema,
  COMPLIANCE_PROFILES,
  PERMISSIONS,
  type Permission,
  ROLE_LABELS,
  ROLE_PERMISSIONS,
  type Role,
  ROLES,
  tenantSettingsSchema,
  type userCreateSchema,
  type userUpdateSchema,
} from '@sgee/shared';
import type { z } from 'zod';
import { AuditService } from '../../common/audit.service';
import { type AuthUser, hasRole, type RequestMeta } from '../../common/auth';
import { hashSecret, randomToken, sha256 } from '../../common/crypto';
import { badRequest, conflict, forbidden, notFound } from '../../common/errors';
import { RolePermissionsCache } from '../../common/guards';
import { PrismaService } from '../../common/prisma.service';
import { personName } from '../../common/serializers';
import { TenantSettingsService } from '../../common/tenant-settings.service';
import { config } from '../../config';
import { PhotoService } from '../files/storage.service';
import { JobsService } from '../jobs/jobs.service';
import { PhidiasClient } from '../phidias/phidias.client';
import { BackupService } from './backup.service';

function tempPassword() {
  return `Ms-${randomToken(9)}9a`;
}

@Injectable()
export class AdminService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly perms: RolePermissionsCache,
    private readonly settings: TenantSettingsService,
    private readonly jobs: JobsService,
    private readonly backups: BackupService,
    private readonly phidias: PhidiasClient,
    private readonly photos: PhotoService,
  ) {}

  onModuleInit() {
    this.jobs.register('audit.partitions', async () => {
      const [r] = await this.prisma.client.$queryRaw<{ created: number }[]>`SELECT audit.ensure_partitions(date_trunc('month', now())::date, 4) AS created`;
      return r;
    });
    this.jobs.dailyAt('audit.partitions', '00:10', false);
  }

  private assertCanManageRoles(user: AuthUser, roles: { role: string }[]) {
    if (roles.some((r) => r.role === 'SUPERADMIN') && !hasRole(user, 'SUPERADMIN')) throw forbidden('Solo un superadministrador puede asignar ese rol.');
  }

  async users(user: AuthUser, q: { q?: string; role?: string; active?: string }) {
    return this.prisma.forUser(user, async (tx) => {
      const rows = await tx.user.findMany({
        where: {
          ...(q.q ? { OR: [{ email: { contains: q.q, mode: 'insensitive' } }, { firstName: { contains: q.q, mode: 'insensitive' } }, { lastName: { contains: q.q, mode: 'insensitive' } }] } : {}),
          ...(q.role ? { roles: { some: { role: q.role } } } : {}),
          ...(q.active ? { active: q.active === 'true' } : {}),
        },
        include: { roles: true, teacherGroups: { include: { group: true } }, mfaDevices: { where: { confirmedAt: { not: null } }, select: { id: true } } },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        take: 500,
      });
      return rows.map((u) => ({
        id: u.id,
        email: u.email,
        name: personName(u),
        firstName: u.firstName,
        lastName: u.lastName,
        phone: u.phone,
        active: u.active,
        roles: u.roles.map((r) => ({ role: r.role, label: ROLE_LABELS[r.role as Role], scopeSectionId: r.scopeSectionId })),
        teacherGroups: u.teacherGroups.map((t) => ({ id: t.groupId, name: t.group.name, subject: t.subject })),
        mfaEnabled: u.mfaDevices.length > 0,
        locked: !!u.lockedUntil && u.lockedUntil > new Date(),
        lastLoginAt: u.lastLoginAt,
        kioskDeviceCode: u.kioskDeviceCode,
        personId: u.personId,
      }));
    });
  }

  async createUser(user: AuthUser, b: z.infer<typeof userCreateSchema>, meta: RequestMeta) {
    this.assertCanManageRoles(user, b.roles);
    return this.prisma.forUser(user, async (tx) => {
      if (await tx.user.findUnique({ where: { tenantId_email: { tenantId: user.tenantId, email: b.email } } })) throw conflict('EMAIL_IN_USE', 'Ya existe un usuario con ese correo.');
      const password = b.password ?? tempPassword();
      const created = await tx.user.create({
        data: {
          tenantId: user.tenantId,
          email: b.email,
          firstName: b.firstName,
          lastName: b.lastName,
          phone: b.phone ?? null,
          personId: b.personId ?? null,
          passwordHash: await hashSecret(password),
          mustChangePassword: !b.password,
          kioskDeviceCode: b.kioskPin ? `KIOSK-${randomToken(4).toUpperCase()}` : null,
          kioskPinHash: b.kioskPin ? await hashSecret(b.kioskPin) : null,
          createdBy: user.id,
          roles: { create: b.roles.map((r) => ({ tenantId: user.tenantId, role: r.role, scopeSectionId: r.scopeSectionId ?? null })) },
          teacherGroups: b.teacherGroupIds?.length ? { create: b.teacherGroupIds.map((groupId) => ({ tenantId: user.tenantId, groupId })) } : undefined,
          preference: { create: { tenantId: user.tenantId } },
        },
      });
      await this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: 'admin.user_created', entity: 'user', entityId: created.id, after: { email: b.email, roles: b.roles }, meta });
      return { id: created.id, email: created.email, temporaryPassword: b.password ? undefined : password, kioskDeviceCode: created.kioskDeviceCode };
    });
  }

  async updateUser(user: AuthUser, id: string, b: z.infer<typeof userUpdateSchema> & { resetPassword?: boolean; unlock?: boolean; resetMfa?: boolean }, meta: RequestMeta) {
    if (b.roles) this.assertCanManageRoles(user, b.roles);
    return this.prisma.forUser(user, async (tx) => {
      const before = await tx.user.findUnique({ where: { id }, include: { roles: true } });
      if (!before) throw notFound('Usuario');
      if (before.roles.some((r) => r.role === 'SUPERADMIN') && !hasRole(user, 'SUPERADMIN')) throw forbidden();
      if (id === user.id && b.active === false) throw badRequest('SELF_DEACTIVATE', 'No puede desactivar su propia cuenta.');
      let temporaryPassword: string | undefined;
      const data: Prisma.UserUpdateInput = {
        firstName: b.firstName,
        lastName: b.lastName,
        phone: b.phone,
        active: b.active,
        email: b.email,
        person: b.personId ? { connect: { id: b.personId } } : undefined,
      };
      if (b.resetPassword) {
        temporaryPassword = tempPassword();
        data.passwordHash = await hashSecret(temporaryPassword);
        data.mustChangePassword = true;
      }
      if (b.unlock) {
        data.failedLogins = 0;
        data.lockedUntil = null;
      }
      if (b.kioskPin) {
        data.kioskPinHash = await hashSecret(b.kioskPin);
        data.kioskDeviceCode = before.kioskDeviceCode ?? `KIOSK-${randomToken(4).toUpperCase()}`;
      }
      await tx.user.update({ where: { id }, data });
      if (b.roles) {
        await tx.userRole.deleteMany({ where: { userId: id } });
        await tx.userRole.createMany({ data: b.roles.map((r) => ({ tenantId: user.tenantId, userId: id, role: r.role, scopeSectionId: r.scopeSectionId ?? null })) });
      }
      if (b.teacherGroupIds) {
        await tx.teacherGroup.deleteMany({ where: { userId: id } });
        if (b.teacherGroupIds.length) await tx.teacherGroup.createMany({ data: b.teacherGroupIds.map((groupId) => ({ tenantId: user.tenantId, userId: id, groupId })) });
      }
      if (b.resetMfa) await tx.mfaDevice.deleteMany({ where: { userId: id } });
      if (b.active === false || b.resetPassword || b.roles) await tx.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: 'admin.user_updated', entity: 'user', entityId: id, before: { active: before.active, roles: before.roles.map((r) => r.role) }, after: { ...b, kioskPin: b.kioskPin ? '[set]' : undefined }, meta });
      return { updated: true, temporaryPassword };
    });
  }

  async roleMatrix(user: AuthUser) {
    return this.prisma.forUser(user, async (tx) => {
      const rows = await tx.rolePermission.findMany();
      return {
        permissions: PERMISSIONS,
        roles: ROLES.map((role) => ({
          role,
          label: ROLE_LABELS[role],
          permissions: rows.filter((r) => r.roleKey === role).map((r) => r.permissionKey),
          defaults: ROLE_PERMISSIONS[role],
        })),
      };
    });
  }

  async setRolePermissions(user: AuthUser, role: string, permissions: string[], meta: RequestMeta) {
    if (!(ROLES as readonly string[]).includes(role)) throw notFound('Rol');
    if (role === 'SUPERADMIN' && !hasRole(user, 'SUPERADMIN')) throw forbidden();
    const invalid = permissions.filter((p) => !(PERMISSIONS as readonly string[]).includes(p));
    if (invalid.length) throw badRequest('INVALID_PERMISSION', `Permisos desconocidos: ${invalid.join(', ')}`);
    if (role === 'ADMIN' && !permissions.includes('admin:users')) throw badRequest('LOCKOUT', 'El rol Administrador debe conservar la gestión de usuarios.');
    return this.prisma.forUser(user, async (tx) => {
      const before = await tx.rolePermission.findMany({ where: { roleKey: role } });
      await tx.rolePermission.deleteMany({ where: { roleKey: role } });
      await tx.rolePermission.createMany({ data: permissions.map((permissionKey) => ({ tenantId: user.tenantId, roleKey: role, permissionKey })) });
      await this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: 'admin.role_permissions_updated', entity: 'role', entityId: role, before: before.map((b) => b.permissionKey), after: permissions, meta });
      this.perms.invalidate(user.tenantId);
      return { role, permissions: permissions as Permission[] };
    });
  }

  async getSettings(user: AuthUser) {
    return this.prisma.forUser(user, async (tx) => {
      const t = await tx.tenant.findUniqueOrThrow({ where: { id: user.tenantId } });
      return { tenant: { id: t.id, slug: t.slug, name: t.name, country: t.country, timezone: t.timezone, logoUrl: t.logoUrl }, settings: tenantSettingsSchema.parse(t.settings ?? {}) };
    });
  }

  async updateSettings(user: AuthUser, b: { name?: string; timezone?: string; logoUrl?: string | null; settings?: Record<string, unknown> }, meta: RequestMeta) {
    return this.prisma.forUser(user, async (tx) => {
      const t = await tx.tenant.findUniqueOrThrow({ where: { id: user.tenantId } });
      const merged = tenantSettingsSchema.parse({ ...(t.settings as object), ...(b.settings ?? {}) });
      await tx.$executeRaw`UPDATE core.tenants SET name = ${b.name ?? t.name}, timezone = ${b.timezone ?? t.timezone}, logo_url = ${b.logoUrl === undefined ? t.logoUrl : b.logoUrl}, settings = ${JSON.stringify(merged)}::jsonb, updated_at = now() WHERE id = ${user.tenantId}::uuid`;
      await this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: 'admin.settings_updated', entity: 'tenant', entityId: user.tenantId, before: t.settings, after: merged, meta });
      this.settings.invalidate(user.tenantId);
      return { settings: merged };
    });
  }

  async auditLog(user: AuthUser, q: z.infer<typeof auditQuerySchema>) {
    return this.prisma.forUser(user, async (tx) => {
      const rows = await tx.auditLog.findMany({
        where: {
          ...(q.actorId ? { actorUserId: q.actorId } : {}),
          ...(q.entity ? { entity: q.entity } : {}),
          ...(q.entityId ? { entityId: q.entityId } : {}),
          ...(q.action ? { action: { contains: q.action } } : {}),
          ...(q.from || q.to ? { createdAt: { gte: q.from ? new Date(`${q.from}T00:00:00-05:00`) : undefined, lte: q.to ? new Date(`${q.to}T23:59:59-05:00`) : undefined } } : {}),
          ...(q.cursor ? { createdAt: { lt: new Date(q.cursor) } } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: q.limit + 1,
      });
      const users = await tx.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.actorUserId).filter((x): x is string => !!x))] } }, select: { id: true, firstName: true, lastName: true, email: true } });
      const items = rows.slice(0, q.limit).map((r) => ({ ...r, actor: users.find((u) => u.id === r.actorUserId) ? `${personName(users.find((u) => u.id === r.actorUserId)!)} <${users.find((u) => u.id === r.actorUserId)!.email}>` : r.actorRole }));
      return { items, nextCursor: rows.length > q.limit ? rows[q.limit - 1].createdAt.toISOString() : null };
    });
  }

  /** Verifies the audit hash chain (linked list through prev_hash). */
  async verifyAudit(user: AuthUser) {
    return this.prisma.forUser(user, async (tx) => {
      const rows = await tx.$queryRaw<{ id: string; hash: string; prev_hash: string | null; ok: boolean }[]>`
        SELECT id, hash, prev_hash,
          hash = encode(digest(coalesce(prev_hash, 'GENESIS') || '|' || concat_ws('|', id, audit.ts(created_at), coalesce(tenant_id::text, ''), coalesce(actor_user_id::text, ''), action, entity, coalesce(entity_id, ''), coalesce(before::text, ''), coalesce(after::text, '')), 'sha256'), 'hex') AS ok
        FROM audit.audit_log WHERE tenant_id = ${user.tenantId}::uuid`;
      const hashes = new Set(rows.map((r) => r.hash));
      const referenced = new Map<string, number>();
      for (const r of rows) if (r.prev_hash) referenced.set(r.prev_hash, (referenced.get(r.prev_hash) ?? 0) + 1);
      const tampered = rows.filter((r) => !r.ok).length;
      const brokenLinks = rows.filter((r) => r.prev_hash && !hashes.has(r.prev_hash)).length;
      const forks = [...referenced.values()].filter((n) => n > 1).length;
      const geneses = rows.filter((r) => !r.prev_hash).length;
      return { total: rows.length, tampered, brokenLinks, forks, geneses, ok: tampered === 0 && brokenLinks === 0 && forks === 0 && geneses <= 1, verifiedAt: new Date() };
    });
  }

  async system(user: AuthUser) {
    const c = config();
    const [db, jobs, queued, lastRuns, backups] = await Promise.all([
      this.prisma.client.$queryRaw<{ size: string; version: string }[]>`SELECT pg_size_pretty(pg_database_size(current_database())) AS size, version() AS version`,
      this.prisma.client.$queryRaw<{ status: string; n: bigint }[]>`SELECT status, count(*) AS n FROM integration.jobs WHERE created_at > now() - interval '24 hours' GROUP BY status`,
      this.prisma.forUser(user, (tx) => tx.notification.count({ where: { status: 'QUEUED' } })),
      this.prisma.forUser(user, (tx) => tx.syncRun.findMany({ orderBy: { startedAt: 'desc' }, take: 5 })),
      this.backups.list(),
    ]);
    const failed = await this.prisma.client.$queryRaw<{ name: string; last_error: string | null; finished_at: Date | null }[]>`SELECT name, last_error, finished_at FROM integration.jobs WHERE status = 'FAILED' AND (tenant_id = ${user.tenantId}::uuid OR tenant_id IS NULL) ORDER BY finished_at DESC NULLS LAST LIMIT 10`;
    return {
      version: '1.0.0',
      node: process.version,
      uptimeSeconds: Math.round(process.uptime()),
      database: { size: db[0]?.size, version: db[0]?.version?.split(',')[0] },
      jobs: Object.fromEntries(jobs.map((j) => [j.status, Number(j.n)])),
      failedJobs: failed,
      notificationsQueued: queued,
      integrations: {
        phidias: { mock: this.phidias.mock, lastRuns },
        photos: { enabled: this.photos.enabled, bucket: c.S3_PHOTOS_BUCKET ?? null },
        storage: { driver: c.STORAGE_DRIVER },
        smtp: !!c.SMTP_HOST,
        whatsapp: !!c.WHATSAPP_TOKEN,
        sms: !!c.TWILIO_ACCOUNT_SID,
        push: !!c.VAPID_PUBLIC_KEY,
        clamav: !!c.CLAMAV_HOST,
      },
      backups: { enabled: process.env.BACKUP_ENABLED === 'true', latest: backups.slice(0, 5) },
      jobsEnabled: c.JOBS_ENABLED,
    };
  }

  async recentJobs(user: AuthUser) {
    return this.prisma.client.$queryRaw<unknown[]>`
      SELECT id, name, status, attempts, run_at AS "runAt", finished_at AS "finishedAt", last_error AS "lastError", result
      FROM integration.jobs WHERE tenant_id = ${user.tenantId}::uuid OR tenant_id IS NULL ORDER BY created_at DESC LIMIT 100`;
  }

  async runJob(user: AuthUser, name: string, meta: RequestMeta) {
    const allowed = ['flow.sla', 'meds.schedule', 'meds.omissions', 'meds.expiring', 'inventory.alerts', 'publichealth.outbreaks', 'publichealth.frequent', 'compliance.retention', 'compliance.access_anomalies', 'reporting.refresh', 'stats.scheduled', 'audit.partitions', 'system.backup', 'phidias.sync.incremental', 'phidias.sync.full', 'phidias.photos', 'phidias.history'];
    if (!allowed.includes(name)) throw notFound('Tarea');
    const system = ['reporting.refresh', 'audit.partitions', 'system.backup'].includes(name);
    const result = await this.jobs.runNow(name, { triggeredBy: user.id }, system ? null : user.tenantId);
    await this.prisma.forUser(user, (tx) => this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: 'admin.job_run', entity: 'job', entityId: name, after: result, meta }));
    return { name, result };
  }

  async verifyBackup(_user: AuthUser) {
    return this.backups.verifyLatest();
  }

  // ── schedule blocks & CSV import (Phidias fallback / Fase 10 migration) ──
  scheduleBlocks(user: AuthUser, groupId?: string) {
    return this.prisma.forUser(user, (tx) => tx.scheduleBlock.findMany({ where: groupId ? { groupId } : {}, orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }] }));
  }

  async createScheduleBlock(user: AuthUser, b: { groupId: string; dayOfWeek: number; startTime: string; endTime: string; subject: string; teacherUserId?: string | null }, meta: RequestMeta) {
    return this.prisma.forUser(user, async (tx) => {
      const r = await tx.scheduleBlock.create({ data: { tenantId: user.tenantId, ...b, teacherUserId: b.teacherUserId ?? null } });
      await this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: 'admin.schedule_block_created', entity: 'schedule_block', entityId: r.id, meta });
      return r;
    });
  }

  /** CSV: codigo;documento;nombres;apellidos;fecha_nacimiento(YYYY-MM-DD);sexo(M/F);grupo */
  async importStudentsCsv(user: AuthUser, csv: string, meta: RequestMeta) {
    const lines = csv.replace(/^\uFEFF/, '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) throw badRequest('CSV_EMPTY', 'El archivo no tiene filas.');
    const sep = lines[0].includes(';') ? ';' : ',';
    const header = lines[0].toLowerCase().split(sep).map((h) => h.trim());
    const idx = (n: string) => header.indexOf(n);
    for (const h of ['codigo', 'nombres', 'apellidos', 'grupo']) if (idx(h) < 0) throw badRequest('CSV_HEADER', `Falta la columna ${h}.`);
    return this.prisma.forUser(
      user,
      async (tx) => {
        const groups = await tx.group.findMany();
        const out = { inserted: 0, updated: 0, errors: [] as { line: number; error: string }[] };
        for (const [i, line] of lines.slice(1).entries()) {
          const c = line.split(sep).map((x) => x.trim());
          const code = c[idx('codigo')];
          const group = groups.find((g) => g.code.toUpperCase() === (c[idx('grupo')] ?? '').toUpperCase());
          if (!code || !group) {
            out.errors.push({ line: i + 2, error: !code ? 'Código vacío' : `Grupo ${c[idx('grupo')]} no existe` });
            continue;
          }
          const personData = {
            firstName: c[idx('nombres')],
            lastName: c[idx('apellidos')],
            documentNumber: idx('documento') >= 0 ? c[idx('documento')] || null : null,
            birthDate: idx('fecha_nacimiento') >= 0 && /^\d{4}-\d{2}-\d{2}$/.test(c[idx('fecha_nacimiento')]) ? new Date(c[idx('fecha_nacimiento')]) : null,
            sex: idx('sexo') >= 0 && ['M', 'F'].includes(c[idx('sexo')]?.toUpperCase()) ? c[idx('sexo')].toUpperCase() : null,
          };
          const existing = await tx.student.findUnique({ where: { tenantId_code: { tenantId: user.tenantId, code } } });
          if (existing) {
            await tx.person.update({ where: { id: existing.personId }, data: personData });
            await tx.student.update({ where: { id: existing.id }, data: { currentGroupId: group.id, status: 'ACTIVE' } });
            out.updated++;
          } else {
            const person = await tx.person.create({ data: { tenantId: user.tenantId, kind: 'STUDENT', source: 'CSV', ...personData } });
            await tx.student.create({ data: { tenantId: user.tenantId, personId: person.id, code, currentGroupId: group.id } });
            out.inserted++;
          }
        }
        await this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: 'admin.students_imported', entity: 'student', after: { inserted: out.inserted, updated: out.updated, errors: out.errors.length, sha256: sha256(csv) }, meta });
        return out;
      },
      { timeout: 300_000 },
    );
  }

  // ── tenants (superadmin) ─────────────────────────────────────────────────
  async tenants(user: AuthUser) {
    if (!hasRole(user, 'SUPERADMIN')) throw forbidden();
    return this.prisma.system((tx) => tx.tenant.findMany({ orderBy: { name: 'asc' }, select: { id: true, slug: true, name: true, country: true, active: true, createdAt: true } }));
  }

  async createTenant(user: AuthUser, b: { slug: string; name: string; country: string; adminEmail: string }, meta: RequestMeta) {
    if (!hasRole(user, 'SUPERADMIN')) throw forbidden();
    const password = tempPassword();
    const tenant = await this.prisma.system(async (tx) => {
      if (await tx.tenant.findUnique({ where: { slug: b.slug } })) throw conflict('SLUG_IN_USE', 'El identificador ya existe.');
      const t = await tx.tenant.create({ data: { slug: b.slug, name: b.name, country: b.country, settings: {} } });
      await tx.roleDef.createMany({ data: ROLES.map((key) => ({ tenantId: t.id, key, label: ROLE_LABELS[key] })) });
      await tx.rolePermission.createMany({ data: ROLES.flatMap((role) => ROLE_PERMISSIONS[role].map((permissionKey) => ({ tenantId: t.id, roleKey: role, permissionKey }))) });
      await tx.complianceProfile.createMany({ data: COMPLIANCE_PROFILES.map((p) => ({ tenantId: t.id, country: p.country, name: p.name, rules: p as unknown as Prisma.InputJsonValue, active: p.country === b.country })) });
      const profile = COMPLIANCE_PROFILES.find((p) => p.country === b.country) ?? COMPLIANCE_PROFILES[0];
      await tx.retentionPolicy.create({ data: { tenantId: t.id, entity: 'clinical_record', retentionYears: profile.clinicalRecordRetentionYears } });
      await tx.user.create({ data: { tenantId: t.id, email: b.adminEmail, firstName: 'Administrador', lastName: b.name, passwordHash: await hashSecret(password), mustChangePassword: true, roles: { create: { tenantId: t.id, role: 'ADMIN' } } } });
      await this.audit.log(tx, { tenantId: t.id, actor: user, action: 'admin.tenant_created', entity: 'tenant', entityId: t.id, after: { slug: b.slug, country: b.country }, meta });
      return t;
    });
    return { tenant, adminEmail: b.adminEmail, temporaryPassword: password };
  }
}
