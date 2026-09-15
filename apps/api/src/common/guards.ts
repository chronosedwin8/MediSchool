import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type Permission, type Role, ROLE_PERMISSIONS } from '@sgee/shared';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { ALLOW_PASSWORD_CHANGE, type AppRequest, type AuthUser, IS_PUBLIC, PERMS } from './auth';
import { forbidden, Problem, unauthorized } from './errors';
import { PrismaService } from './prisma.service';

export const ACCESS_COOKIE = 'sgee_at';
export const REFRESH_COOKIE = 'sgee_rt';

export interface AccessClaims {
  sub: string;
  tid: string;
  sid: string;
  email: string;
  name: string;
  pid: string | null;
  roles: Role[];
  scopes: string[];
  kiosk: boolean;
  mcp: boolean;
}

export function signAccessToken(claims: AccessClaims, minutes = 15): string {
  return jwt.sign(claims, config().JWT_SECRET, { algorithm: 'HS256', expiresIn: minutes * 60, issuer: 'sgee', audience: 'sgee-api' });
}

export function verifyAccessToken(token: string): AccessClaims {
  return jwt.verify(token, config().JWT_SECRET, { algorithms: ['HS256'], issuer: 'sgee', audience: 'sgee-api' }) as AccessClaims;
}

/** Tenant-customizable role → permissions (core.role_permissions), cached 60 s. */
@Injectable()
export class RolePermissionsCache {
  private cache = new Map<string, { at: number; map: Map<string, Permission[]> }>();

  constructor(private readonly prisma: PrismaService) {}

  async permissionsFor(tenantId: string, roles: Role[]): Promise<Permission[]> {
    let entry = this.cache.get(tenantId);
    if (!entry || Date.now() - entry.at > 60_000) {
      const rows = await this.prisma.forTenant(tenantId, (tx) => tx.rolePermission.findMany({ select: { roleKey: true, permissionKey: true } }));
      const map = new Map<string, Permission[]>();
      for (const r of rows) map.set(r.roleKey, [...(map.get(r.roleKey) ?? []), r.permissionKey as Permission]);
      entry = { at: Date.now(), map };
      this.cache.set(tenantId, entry);
    }
    const set = new Set<Permission>();
    for (const role of roles) for (const p of entry.map.get(role) ?? ROLE_PERMISSIONS[role] ?? []) set.add(p);
    return [...set];
  }

  invalidate(tenantId?: string) {
    if (tenantId) this.cache.delete(tenantId);
    else this.cache.clear();
  }
}

function extractToken(req: AppRequest): { token: string | null; viaCookie: boolean } {
  const h = req.headers.authorization;
  if (h?.startsWith('Bearer ')) return { token: h.slice(7), viaCookie: false };
  const c = (req as unknown as { cookies?: Record<string, string> }).cookies?.[ACCESS_COOKIE];
  return { token: c ?? null, viaCookie: !!c };
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly perms: RolePermissionsCache,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (ctx.getType() !== 'http') return true;
    const req = ctx.switchToHttp().getRequest<AppRequest>();
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()]);
    const { token, viaCookie } = extractToken(req);

    if (!token) {
      if (isPublic) return true;
      throw unauthorized();
    }
    let claims: AccessClaims;
    try {
      claims = verifyAccessToken(token);
    } catch {
      if (isPublic) return true;
      throw unauthorized();
    }

    // CSRF: cookie-authenticated writes must carry the custom header (same-origin XHR only).
    if (viaCookie && !['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers['x-requested-with'] !== 'sgee') {
      throw new Problem(403, 'CSRF', 'Solicitud rechazada (CSRF).');
    }

    const user: AuthUser = {
      id: claims.sub,
      tenantId: claims.tid,
      email: claims.email,
      name: claims.name,
      personId: claims.pid,
      roles: claims.roles,
      permissions: await this.perms.permissionsFor(claims.tid, claims.roles),
      sectionScopes: claims.scopes ?? [],
      sessionId: claims.sid,
      kiosk: claims.kiosk,
      mustChangePassword: claims.mcp,
    };
    req.user = user;
    req.authViaCookie = viaCookie;

    if (user.mustChangePassword && !isPublic) {
      const allowed = this.reflector.getAllAndOverride<boolean>(ALLOW_PASSWORD_CHANGE, [ctx.getHandler(), ctx.getClass()]);
      if (!allowed) throw new Problem(403, 'PASSWORD_CHANGE_REQUIRED', 'Debe cambiar su contraseña antes de continuar.');
    }
    return true;
  }
}

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    if (ctx.getType() !== 'http') return true;
    const required = this.reflector.getAllAndOverride<Permission[]>(PERMS, [ctx.getHandler(), ctx.getClass()]);
    if (!required?.length) return true;
    const user = ctx.switchToHttp().getRequest<AppRequest>().user;
    if (!user) throw unauthorized();
    if (!required.some((p) => user.permissions.includes(p))) throw forbidden();
    return true;
  }
}
