import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Permission, Role } from '@sgee/shared';
import type { Request } from 'express';

export interface AuthUser {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  personId: string | null;
  roles: Role[];
  permissions: Permission[];
  sectionScopes: string[];
  sessionId: string;
  kiosk: boolean;
  mustChangePassword: boolean;
}

export interface RequestMeta {
  ip: string | null;
  userAgent: string | null;
  requestId: string;
}

export type AppRequest = Request & { user?: AuthUser; meta: RequestMeta; authViaCookie?: boolean };

export const IS_PUBLIC = 'sgee:isPublic';
export const PERMS = 'sgee:perms';
export const IDEMPOTENT = 'sgee:idempotent';
export const ALLOW_PASSWORD_CHANGE = 'sgee:allowPwdChange';

/** Endpoint without authentication. */
export const Public = () => SetMetadata(IS_PUBLIC, true);
/** Requires ANY of the listed permissions. */
export const Perms = (...perms: Permission[]) => SetMetadata(PERMS, perms);
/** Critical write: Idempotency-Key header required and responses replayed. */
export const Idempotent = (required = true) => SetMetadata(IDEMPOTENT, { required });
export const AllowWhenPasswordChangeRequired = () => SetMetadata(ALLOW_PASSWORD_CHANGE, true);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest<AppRequest>().user!;
});

export const Meta = createParamDecorator((_: unknown, ctx: ExecutionContext): RequestMeta => {
  return ctx.switchToHttp().getRequest<AppRequest>().meta;
});

export const hasRole = (u: AuthUser, ...roles: Role[]) => u.roles.some((r) => roles.includes(r));
export const can = (u: AuthUser, ...perms: Permission[]) => perms.some((p) => u.permissions.includes(p));
export const isClinical = (u: AuthUser) => hasRole(u, 'NURSE', 'DOCTOR', 'HEALTH_COORDINATOR', 'SUPERADMIN');
