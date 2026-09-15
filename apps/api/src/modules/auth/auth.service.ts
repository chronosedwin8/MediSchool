import { Injectable } from '@nestjs/common';
import type { Tx } from '@sgee/db';
import { MFA_ROLES, primaryRole, ROLE_HOME, type Role, type parentRegisterSchema } from '@sgee/shared';
import jwt from 'jsonwebtoken';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import type { z } from 'zod';
import type { AuthUser, RequestMeta } from '../../common/auth';
import { AuditService } from '../../common/audit.service';
import { getEncryptor, hashSecret, randomToken, sha256, verifySecret } from '../../common/crypto';
import { badRequest, conflict, Problem, unauthorized } from '../../common/errors';
import { type AccessClaims, signAccessToken } from '../../common/guards';
import { PrismaService } from '../../common/prisma.service';
import { TenantSettingsService } from '../../common/tenant-settings.service';
import { config } from '../../config';

authenticator.options = { window: 1 };

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  refreshMaxAgeMs: number;
  user: { id: string; name: string; email: string; roles: Role[]; home: string; mustChangePassword: boolean };
}

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly settings: TenantSettingsService,
  ) {}

  async login(email: string, password: string, tenantSlug: string | undefined, meta: RequestMeta) {
    const candidates = await this.prisma.client.$queryRaw<{ user_id: string; tenant_id: string; tenant_slug: string; tenant_name: string }[]>`
      SELECT * FROM core.login_candidates(${email})`;
    const filtered = tenantSlug ? candidates.filter((c) => c.tenant_slug === tenantSlug) : candidates;
    if (filtered.length > 1) {
      throw conflict('TENANT_REQUIRED', 'Su usuario pertenece a varios colegios. Seleccione uno.', {
        tenants: filtered.map((c) => ({ slug: c.tenant_slug, name: c.tenant_name })),
      });
    }
    // Same timing for unknown users.
    if (!filtered.length) {
      await verifySecret(password, 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAA');
      throw unauthorized('Correo o contraseña incorrectos.');
    }
    const { user_id: userId, tenant_id: tenantId } = filtered[0];

    // Failures are persisted inside the transaction and thrown after commit,
    // otherwise the rollback would erase the failed-attempt counter.
    const result = await this.prisma.forTenant(tenantId, async (tx) => {
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, include: { roles: true, mfaDevices: true } });
      if (user.lockedUntil && user.lockedUntil > new Date()) {
        throw new Problem(423, 'ACCOUNT_LOCKED', `Cuenta bloqueada temporalmente por intentos fallidos. Intente después de ${LOCK_MINUTES} minutos.`);
      }
      if (!(await verifySecret(password, user.passwordHash))) {
        const failed = user.failedLogins + 1;
        await tx.user.update({
          where: { id: user.id },
          data: { failedLogins: failed, lockedUntil: failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null },
        });
        await this.audit.log(tx, { tenantId, actor: { id: user.id, roles: [] }, action: 'auth.login_failed', entity: 'user', entityId: user.id, meta });
        return { failed: true as const };
      }
      const roles = user.roles.map((r) => r.role as Role);
      const confirmed = user.mfaDevices.find((d) => d.confirmedAt);
      const settings = await this.settings.get(tx, tenantId);
      const mfaRequired = !!confirmed || (settings.mfaEnforced && roles.some((r) => MFA_ROLES.includes(r)));
      if (mfaRequired) {
        const challengeToken = jwt.sign({ sub: user.id, tid: tenantId, purpose: 'mfa' }, config().JWT_SECRET, { expiresIn: 300, issuer: 'sgee', audience: 'sgee-mfa' });
        return { mfaRequired: true as const, mfaSetupRequired: !confirmed, challengeToken };
      }
      return this.issueSession(tx, user.id, meta, false);
    });
    if ('failed' in result) throw unauthorized('Correo o contraseña incorrectos.');
    return result;
  }

  private verifyChallenge(token: string): { sub: string; tid: string } {
    try {
      return jwt.verify(token, config().JWT_SECRET, { issuer: 'sgee', audience: 'sgee-mfa' }) as { sub: string; tid: string };
    } catch {
      throw unauthorized('El desafío MFA expiró. Inicie sesión de nuevo.');
    }
  }

  /** First-time enrolment during an enforced-MFA login. */
  async mfaSetupWithChallenge(challengeToken: string) {
    const c = this.verifyChallenge(challengeToken);
    return this.prisma.forTenant(c.tid, (tx) => this.createPendingDevice(tx, c.tid, c.sub));
  }

  async verifyMfa(challengeToken: string, code: string, meta: RequestMeta) {
    const c = this.verifyChallenge(challengeToken);
    const result = await this.prisma.forTenant(c.tid, async (tx) => {
      const devices = await tx.mfaDevice.findMany({ where: { userId: c.sub }, orderBy: { createdAt: 'desc' } });
      const device = devices.find((d) => d.confirmedAt) ?? devices[0];
      if (!device) throw badRequest('MFA_NOT_CONFIGURED', 'Configure primero su aplicación autenticadora.');
      const secret = getEncryptor().decryptString(device.secretEnc);
      if (!authenticator.verify({ token: code, secret })) {
        await this.audit.log(tx, { tenantId: c.tid, actor: { id: c.sub, roles: [] }, action: 'auth.mfa_failed', entity: 'user', entityId: c.sub, meta });
        return { failed: true as const };
      }
      if (!device.confirmedAt) await tx.mfaDevice.update({ where: { id: device.id }, data: { confirmedAt: new Date() } });
      return this.issueSession(tx, c.sub, meta, false);
    });
    if ('failed' in result) throw unauthorized('Código incorrecto.');
    return result;
  }

  private async createPendingDevice(tx: Tx, tenantId: string, userId: string) {
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const secret = authenticator.generateSecret();
    await tx.mfaDevice.create({ data: { tenantId, userId, secretEnc: getEncryptor().encryptString(secret) } });
    const otpauth = authenticator.keyuri(user.email, `MediSchool ${tenant.name}`, secret);
    return { otpauth, secret, qr: await QRCode.toDataURL(otpauth) };
  }

  mfaSetup(user: AuthUser) {
    return this.prisma.forUser(user, (tx) => this.createPendingDevice(tx, user.tenantId, user.id));
  }

  async mfaEnable(user: AuthUser, code: string, meta: RequestMeta) {
    return this.prisma.forUser(user, async (tx) => {
      const device = await tx.mfaDevice.findFirst({ where: { userId: user.id, confirmedAt: null }, orderBy: { createdAt: 'desc' } });
      if (!device) throw badRequest('MFA_NOT_PENDING', 'No hay una configuración MFA pendiente.');
      if (!authenticator.verify({ token: code, secret: getEncryptor().decryptString(device.secretEnc) })) throw unauthorized('Código incorrecto.');
      await tx.mfaDevice.update({ where: { id: device.id }, data: { confirmedAt: new Date() } });
      await tx.mfaDevice.deleteMany({ where: { userId: user.id, id: { not: device.id } } });
      await this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: 'auth.mfa_enabled', entity: 'user', entityId: user.id, meta });
      return { enabled: true };
    });
  }

  async issueSession(tx: Tx, userId: string, meta: RequestMeta, kiosk: boolean): Promise<SessionTokens> {
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, include: { roles: true } });
    const settings = await this.settings.get(tx, user.tenantId);
    const minutes = kiosk ? settings.kioskSessionMinutes : settings.sessionMinutes;
    const refreshToken = randomToken(48);
    const session = await tx.session.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        refreshTokenHash: sha256(refreshToken),
        kiosk,
        ip: meta.ip,
        userAgent: meta.userAgent?.slice(0, 300),
        expiresAt: new Date(Date.now() + minutes * 60_000),
      },
    });
    await tx.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() } });
    await this.audit.log(tx, { tenantId: user.tenantId, actor: { id: user.id, roles: user.roles.map((r) => r.role as Role) }, action: kiosk ? 'auth.kiosk_login' : 'auth.login', entity: 'session', entityId: session.id, meta });
    return {
      accessToken: signAccessToken(this.claims(user, session.id, kiosk)),
      refreshToken,
      refreshMaxAgeMs: minutes * 60_000,
      user: this.publicUser(user),
    };
  }

  private claims(
    user: { id: string; tenantId: string; email: string; firstName: string; lastName: string; personId: string | null; mustChangePassword: boolean; roles: { role: string; scopeSectionId: string | null }[] },
    sessionId: string,
    kiosk: boolean,
  ): AccessClaims {
    return {
      sub: user.id,
      tid: user.tenantId,
      sid: sessionId,
      email: user.email,
      name: `${user.firstName} ${user.lastName}`,
      pid: user.personId,
      roles: [...new Set(user.roles.map((r) => r.role as Role))],
      scopes: user.roles.map((r) => r.scopeSectionId).filter((s): s is string => !!s),
      kiosk,
      mcp: user.mustChangePassword,
    };
  }

  private publicUser(user: { id: string; firstName: string; lastName: string; email: string; mustChangePassword: boolean; roles: { role: string }[] }) {
    const roles = [...new Set(user.roles.map((r) => r.role as Role))];
    return {
      id: user.id,
      name: `${user.firstName} ${user.lastName}`,
      email: user.email,
      roles,
      home: ROLE_HOME[primaryRole(roles)],
      mustChangePassword: user.mustChangePassword,
    };
  }

  async refresh(refreshToken: string, meta: RequestMeta): Promise<SessionTokens> {
    const hash = sha256(refreshToken);
    const rows = await this.prisma.client.$queryRaw<{ session_id: string; tenant_id: string; user_id: string }[]>`SELECT * FROM core.session_tenant(${hash})`;
    if (!rows.length) throw unauthorized();
    const { tenant_id: tenantId, session_id: sessionId } = rows[0];
    return this.prisma.forTenant(tenantId, async (tx) => {
      const session = await tx.session.findUnique({ where: { id: sessionId }, include: { user: { include: { roles: true } } } });
      if (!session || session.revokedAt || session.expiresAt < new Date() || !session.user.active) throw unauthorized();
      const next = randomToken(48);
      const settings = await this.settings.get(tx, tenantId);
      const minutes = session.kiosk ? settings.kioskSessionMinutes : settings.sessionMinutes;
      await tx.session.update({
        where: { id: session.id },
        data: { refreshTokenHash: sha256(next), lastUsedAt: new Date(), ip: meta.ip, expiresAt: new Date(Date.now() + minutes * 60_000) },
      });
      return {
        accessToken: signAccessToken(this.claims(session.user, session.id, session.kiosk)),
        refreshToken: next,
        refreshMaxAgeMs: minutes * 60_000,
        user: this.publicUser(session.user),
      };
    });
  }

  async logout(user: AuthUser | undefined, refreshToken: string | undefined, meta: RequestMeta) {
    if (user) {
      await this.prisma.forUser(user, async (tx) => {
        await tx.session.updateMany({ where: { id: user.sessionId, revokedAt: null }, data: { revokedAt: new Date() } });
        await this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: 'auth.logout', entity: 'session', entityId: user.sessionId, meta });
      });
    } else if (refreshToken) {
      const rows = await this.prisma.client.$queryRaw<{ session_id: string; tenant_id: string }[]>`SELECT * FROM core.session_tenant(${sha256(refreshToken)})`;
      if (rows[0]) await this.prisma.forTenant(rows[0].tenant_id, (tx) => tx.session.update({ where: { id: rows[0].session_id }, data: { revokedAt: new Date() } }));
    }
  }

  async kioskLogin(tenantSlug: string, deviceCode: string, pin: string, meta: RequestMeta) {
    const rows = await this.prisma.client.$queryRaw<{ user_id: string; tenant_id: string }[]>`SELECT * FROM core.kiosk_candidate(${tenantSlug}, ${deviceCode})`;
    if (!rows.length) {
      await verifySecret(pin, 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAA');
      throw unauthorized('Dispositivo o PIN incorrectos.');
    }
    const result = await this.prisma.forTenant(rows[0].tenant_id, async (tx) => {
      const user = await tx.user.findUniqueOrThrow({ where: { id: rows[0].user_id }, include: { roles: true } });
      if (user.lockedUntil && user.lockedUntil > new Date()) throw new Problem(423, 'ACCOUNT_LOCKED', 'Kiosco bloqueado temporalmente.');
      if (!user.roles.some((r) => r.role === 'GATE')) throw unauthorized('Dispositivo o PIN incorrectos.');
      if (!(await verifySecret(pin, user.kioskPinHash))) {
        const failed = user.failedLogins + 1;
        await tx.user.update({ where: { id: user.id }, data: { failedLogins: failed, lockedUntil: failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null } });
        return { failed: true as const };
      }
      return this.issueSession(tx, user.id, meta, true);
    });
    if ('failed' in result) throw unauthorized('Dispositivo o PIN incorrectos.');
    return result;
  }

  async me(user: AuthUser) {
    return this.prisma.forUser(user, async (tx) => {
      const u = await tx.user.findUniqueOrThrow({
        where: { id: user.id },
        include: { roles: true, mfaDevices: { where: { confirmedAt: { not: null } } }, teacherGroups: { include: { group: { include: { grade: true } } } } },
      });
      const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: user.tenantId } });
      const settings = await this.settings.get(tx, user.tenantId);
      let children: { id: string; name: string; code: string; group: string | null }[] = [];
      if (user.personId) {
        const links = await tx.studentGuardian.findMany({
          where: { active: true, guardian: { personId: user.personId } },
          include: { student: { include: { person: true, group: true } } },
        });
        children = links.map((l) => ({
          id: l.student.id,
          name: `${l.student.person.firstName} ${l.student.person.lastName}`,
          code: l.student.code,
          group: l.student.group?.name ?? null,
        }));
      }
      return {
        ...this.publicUser(u),
        tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name, country: tenant.country, timezone: tenant.timezone, locale: settings.locale },
        permissions: user.permissions,
        mfaEnabled: u.mfaDevices.length > 0,
        kiosk: user.kiosk,
        locale: u.locale,
        teacherGroups: u.teacherGroups.map((tg) => ({ id: tg.groupId, name: tg.group.name, grade: tg.group.grade.name, subject: tg.subject })),
        children,
        settings: {
          dataSource: settings.dataSource,
          passTransitAlertMinutes: settings.passTransitAlertMinutes,
          observationRecheckMinutes: settings.observationRecheckMinutes,
          medicationTimeWindowMinutes: settings.medicationTimeWindowMinutes,
        },
      };
    });
  }

  async changePassword(user: AuthUser, current: string, next: string, meta: RequestMeta) {
    return this.prisma.forUser(user, async (tx) => {
      const u = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
      if (!(await verifySecret(current, u.passwordHash))) throw unauthorized('La contraseña actual no es correcta.');
      if (current === next) throw badRequest('PASSWORD_REUSED', 'La nueva contraseña debe ser diferente.');
      await tx.user.update({ where: { id: u.id }, data: { passwordHash: await hashSecret(next), mustChangePassword: false } });
      await tx.session.updateMany({ where: { userId: u.id, id: { not: user.sessionId }, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: 'auth.password_changed', entity: 'user', entityId: u.id, meta });
      return this.issueSession(tx, u.id, meta, user.kiosk);
    });
  }

  async registerParent(input: z.infer<typeof parentRegisterSchema>, meta: RequestMeta) {
    const rows = await this.prisma.client.$queryRaw<{ invitation_id: string; tenant_id: string }[]>`SELECT * FROM core.invitation_tenant(${input.invitationCode.toUpperCase()})`;
    if (!rows.length) throw badRequest('INVITATION_INVALID', 'El código de invitación no es válido.');
    return this.prisma.forTenant(rows[0].tenant_id, async (tx) => {
      const tenantId = rows[0].tenant_id;
      const inv = await tx.invitation.findUniqueOrThrow({ where: { id: rows[0].invitation_id } });
      if (inv.usedAt || inv.expiresAt < new Date()) throw badRequest('INVITATION_EXPIRED', 'La invitación ya fue usada o expiró.');
      if (inv.email && inv.email.toLowerCase() !== input.email) throw badRequest('INVITATION_EMAIL', 'La invitación fue emitida para otro correo.');
      if (await tx.user.findUnique({ where: { tenantId_email: { tenantId, email: input.email } } })) {
        throw conflict('EMAIL_IN_USE', 'Ya existe una cuenta con este correo. Inicie sesión y solicite vincular al estudiante.');
      }
      let person = await tx.person.findFirst({ where: { documentNumber: input.documentNumber, kind: 'GUARDIAN' } });
      person ??= await tx.person.create({
        data: {
          tenantId,
          kind: 'GUARDIAN',
          documentType: 'CC',
          documentNumber: input.documentNumber,
          firstName: input.firstName,
          lastName: input.lastName,
          email: input.email,
          mobile: input.phone,
        },
      });
      const guardian = (await tx.guardian.findUnique({ where: { personId: person.id } })) ?? (await tx.guardian.create({ data: { tenantId, personId: person.id } }));
      await tx.studentGuardian.upsert({
        where: { studentId_guardianId: { studentId: inv.studentId, guardianId: guardian.id } },
        create: { tenantId, studentId: inv.studentId, guardianId: guardian.id, relationship: inv.relationship, isPrimary: true },
        update: { active: true },
      });
      const user = await tx.user.create({
        data: {
          tenantId,
          email: input.email,
          passwordHash: await hashSecret(input.password),
          firstName: input.firstName,
          lastName: input.lastName,
          phone: input.phone,
          personId: person.id,
          roles: { create: { tenantId, role: 'PARENT' } },
          preference: { create: { tenantId, channels: { IN_APP: true, EMAIL: true, WHATSAPP: true } } },
        },
      });
      await tx.invitation.update({ where: { id: inv.id }, data: { usedAt: new Date(), usedByUserId: user.id } });
      await this.audit.log(tx, { tenantId, actor: { id: user.id, roles: ['PARENT'] }, action: 'auth.parent_registered', entity: 'user', entityId: user.id, after: { studentId: inv.studentId }, meta });
      return this.issueSession(tx, user.id, meta, false);
    });
  }

  wsToken(user: AuthUser) {
    return {
      token: signAccessToken(
        { sub: user.id, tid: user.tenantId, sid: user.sessionId, email: user.email, name: user.name, pid: user.personId, roles: user.roles, scopes: user.sectionScopes, kiosk: user.kiosk, mcp: false },
        10,
      ),
    };
  }

  async tenantInfo(slug: string) {
    const rows = await this.prisma.client.$queryRaw<{ tenant_id: string; name: string }[]>`SELECT * FROM core.tenant_by_slug(${slug})`;
    return rows[0] ? { slug, name: rows[0].name } : null;
  }
}
