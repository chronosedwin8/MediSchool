/**
 * Roles and permissions (RBAC). Section-scoped access (ABAC) is applied on top
 * of these in the API through `user_roles.scope_section_id`.
 */
export const ROLES = [
  'SUPERADMIN',
  'ADMIN',
  'HEALTH_COORDINATOR',
  'NURSE',
  'DOCTOR',
  'PSYCHOLOGIST',
  'TEACHER',
  'GATE',
  'PARENT',
  'DIRECTOR',
  'STUDENT',
] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  SUPERADMIN: 'Superadministrador',
  ADMIN: 'Administrador',
  HEALTH_COORDINATOR: 'Coordinación de enfermería',
  NURSE: 'Enfermería',
  DOCTOR: 'Médico institucional',
  PSYCHOLOGIST: 'Psicología / Orientación',
  TEACHER: 'Docente',
  GATE: 'Portería',
  PARENT: 'Padre / Acudiente',
  DIRECTOR: 'Directivo',
  STUDENT: 'Estudiante',
};

export const PERMISSIONS = [
  'students:read',
  'students:read_all',
  'people:write',
  'clinical:read',
  'clinical:write',
  'clinical:annul',
  'mental_health:read',
  'mental_health:write',
  'encounters:read',
  'encounters:write',
  'encounters:annul',
  'passes:create',
  'passes:read_own',
  'passes:read_all',
  'passes:nursing',
  'exits:authorize',
  'exits:confirm',
  'gate:checkout',
  'meds:request',
  'meds:read',
  'meds:approve',
  'meds:administer',
  'inventory:read',
  'inventory:write',
  'inventory:approve',
  'comms:read',
  'comms:send',
  'comms:circulars',
  'stats:clinical',
  'stats:anonymous',
  'public_health:manage',
  'admin:users',
  'admin:settings',
  'admin:integrations',
  'audit:read',
  'compliance:manage',
  'consents:sign',
  'guardian:portal',
  'student:portal',
  'tenants:manage',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const CLINICAL: Permission[] = [
  'students:read',
  'students:read_all',
  'clinical:read',
  'clinical:write',
  'encounters:read',
  'encounters:write',
  'passes:read_all',
  'passes:nursing',
  'passes:create',
  'exits:authorize',
  'meds:read',
  'meds:approve',
  'meds:administer',
  'inventory:read',
  'inventory:write',
  'comms:read',
  'comms:send',
  'stats:clinical',
  'stats:anonymous',
  'public_health:manage',
];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  SUPERADMIN: [...PERMISSIONS],
  ADMIN: [
    'students:read',
    'students:read_all',
    'people:write',
    'passes:read_all',
    'inventory:read',
    'comms:read',
    'comms:circulars',
    'stats:anonymous',
    'admin:users',
    'admin:settings',
    'admin:integrations',
    'audit:read',
    'compliance:manage',
  ],
  HEALTH_COORDINATOR: [
    ...CLINICAL,
    'clinical:annul',
    'encounters:annul',
    'inventory:approve',
    'comms:circulars',
    'audit:read',
    'compliance:manage',
    'people:write',
    'admin:settings',
  ],
  NURSE: [...CLINICAL],
  DOCTOR: [...CLINICAL, 'clinical:annul', 'encounters:annul', 'mental_health:read', 'mental_health:write', 'inventory:approve'],
  PSYCHOLOGIST: ['students:read', 'students:read_all', 'mental_health:read', 'mental_health:write', 'encounters:read', 'stats:anonymous'],
  TEACHER: ['students:read', 'passes:create', 'passes:read_own'],
  GATE: ['students:read', 'gate:checkout', 'passes:read_all'],
  PARENT: ['guardian:portal', 'meds:request', 'exits:confirm', 'consents:sign', 'comms:read'],
  DIRECTOR: ['students:read', 'students:read_all', 'stats:anonymous', 'passes:read_all', 'comms:circulars'],
  STUDENT: ['student:portal'],
};

export function permissionsFor(roles: readonly Role[]): Set<Permission> {
  const set = new Set<Permission>();
  for (const r of roles) for (const p of ROLE_PERMISSIONS[r] ?? []) set.add(p);
  return set;
}

export function hasPermission(roles: readonly Role[], permission: Permission): boolean {
  return permissionsFor(roles).has(permission);
}

/** Roles that must use MFA when the tenant enforces it (PLAN §10). */
export const MFA_ROLES: Role[] = ['SUPERADMIN', 'ADMIN', 'HEALTH_COORDINATOR', 'NURSE', 'DOCTOR', 'PSYCHOLOGIST'];

/** Landing route for each role in the web app. */
export const ROLE_HOME: Record<Role, string> = {
  SUPERADMIN: '/admin',
  ADMIN: '/admin',
  HEALTH_COORDINATOR: '/enfermeria',
  NURSE: '/enfermeria',
  DOCTOR: '/enfermeria',
  PSYCHOLOGIST: '/estudiantes',
  TEACHER: '/docente',
  GATE: '/porteria',
  PARENT: '/familia',
  DIRECTOR: '/estadisticas',
  STUDENT: '/estudiante',
};

/** Priority order used to pick the primary home when a user has several roles. */
export const ROLE_PRIORITY: Role[] = [
  'SUPERADMIN',
  'NURSE',
  'DOCTOR',
  'HEALTH_COORDINATOR',
  'ADMIN',
  'PSYCHOLOGIST',
  'DIRECTOR',
  'GATE',
  'TEACHER',
  'PARENT',
  'STUDENT',
];

export function primaryRole(roles: readonly Role[]): Role {
  return ROLE_PRIORITY.find((r) => roles.includes(r)) ?? 'STUDENT';
}
