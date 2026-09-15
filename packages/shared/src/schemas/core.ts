import { z } from 'zod';
import { ROLES } from '../roles';
import { isoDate, optionalText, paginationQuery, trimmed, uuid } from './common';

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(200),
  tenantSlug: z.string().trim().max(60).optional(),
});

export const mfaVerifySchema = z.object({
  challengeToken: z.string().min(10),
  code: z.string().regex(/^\d{6}$/, 'Código de 6 dígitos'),
});

export const mfaEnableSchema = z.object({ code: z.string().regex(/^\d{6}$/) });

export const kioskLoginSchema = z.object({
  tenantSlug: z.string().trim().min(1).max(60),
  deviceCode: z.string().trim().min(3).max(40),
  pin: z.string().regex(/^\d{4,8}$/, 'PIN numérico de 4 a 8 dígitos'),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z
    .string()
    .min(10, 'Mínimo 10 caracteres')
    .max(200)
    .regex(/[A-Z]/, 'Debe incluir una mayúscula')
    .regex(/[a-z]/, 'Debe incluir una minúscula')
    .regex(/\d/, 'Debe incluir un número'),
});

export const parentRegisterSchema = z.object({
  invitationCode: z.string().trim().min(6).max(40),
  email: z.string().trim().toLowerCase().email(),
  password: changePasswordSchema.shape.newPassword,
  firstName: trimmed(1, 100),
  lastName: trimmed(1, 100),
  documentNumber: trimmed(3, 30),
  phone: z.string().trim().min(7).max(20),
});

export const userRoleAssignment = z.object({
  role: z.enum(ROLES),
  scopeSectionId: uuid.optional().nullable(),
});

export const userCreateSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  firstName: trimmed(1, 100),
  lastName: trimmed(1, 100),
  phone: z.string().trim().max(20).optional().nullable(),
  roles: z.array(userRoleAssignment).min(1),
  password: z.string().min(10).max(200).optional(),
  personId: uuid.optional().nullable(),
  teacherGroupIds: z.array(uuid).optional(),
  kioskPin: z.string().regex(/^\d{4,8}$/).optional(),
});

export const userUpdateSchema = userCreateSchema.partial().extend({
  active: z.boolean().optional(),
});

export const tenantSettingsSchema = z.object({
  timezone: z.string().default('America/Bogota'),
  locale: z.enum(['es-CO', 'es', 'en', 'de', 'pt']).default('es-CO'),
  mfaEnforced: z.boolean().default(false),
  passTransitAlertMinutes: z.number().int().min(1).max(120).default(10),
  passExpireMinutes: z.number().int().min(10).max(600).default(60),
  returnedAutoCloseMinutes: z.number().int().min(1).max(240).default(15),
  observationRecheckMinutes: z.number().int().min(5).max(240).default(20),
  medicationTimeWindowMinutes: z.number().int().min(5).max(120).default(30),
  medicationOmissionAlertMinutes: z.number().int().min(5).max(240).default(45),
  outbreak: z
    .object({ windowDays: z.number().int().min(1).max(30), minCases: z.number().int().min(2), attackRatePct: z.number().min(1).max(100) })
    .default({ windowDays: 7, minCases: 3, attackRatePct: 10 }),
  frequentVisitorThreshold: z.number().int().min(2).max(50).default(5),
  quietHours: z.object({ start: z.string(), end: z.string() }).default({ start: '20:00', end: '06:00' }),
  sessionMinutes: z.number().int().min(5).max(720).default(480),
  kioskSessionMinutes: z.number().int().min(5).max(720).default(720),
  enabledChannels: z.array(z.enum(['IN_APP', 'EMAIL', 'WHATSAPP', 'SMS', 'PUSH'])).default(['IN_APP', 'EMAIL']),
  annualUpdateMonth: z.number().int().min(1).max(12).default(8),
  requirePrescriptionForOtc: z.boolean().default(false),
});
export type TenantSettings = z.infer<typeof tenantSettingsSchema>;

export const auditQuerySchema = paginationQuery.extend({
  actorId: uuid.optional(),
  entity: z.string().max(60).optional(),
  entityId: z.string().max(80).optional(),
  action: z.string().max(60).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
});

export const studentSearchSchema = paginationQuery.extend({
  q: z.string().trim().max(100).optional(),
  groupId: uuid.optional(),
  gradeId: uuid.optional(),
  sectionId: uuid.optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ALL']).default('ACTIVE'),
  withAlerts: z.coerce.boolean().optional(),
});

export const guardianLinkSchema = z.object({
  guardianPersonId: uuid.optional(),
  firstName: trimmed(1, 100).optional(),
  lastName: trimmed(1, 100).optional(),
  documentType: z.enum(['CC', 'CE', 'PA', 'TI', 'RC', 'NIT', 'OTRO']).default('CC'),
  documentNumber: trimmed(3, 30).optional(),
  email: z.string().trim().toLowerCase().email().optional().nullable(),
  phone: z.string().trim().max(20).optional().nullable(),
  relationship: z.enum(['MOTHER', 'FATHER', 'GRANDPARENT', 'SIBLING', 'UNCLE_AUNT', 'LEGAL_GUARDIAN', 'OTHER']),
  isPrimary: z.boolean().default(false),
  canPickUp: z.boolean().default(true),
  legalCustody: z.boolean().default(true),
  priority: z.number().int().min(1).max(10).default(1),
  restrictions: optionalText(1000),
});

export const emergencyContactSchema = z.object({
  name: trimmed(2, 150),
  relationship: trimmed(2, 60),
  phone: z.string().trim().min(7).max(20),
  altPhone: z.string().trim().max(20).optional().nullable(),
  canPickUp: z.boolean().default(false),
  documentNumber: z.string().trim().max(30).optional().nullable(),
  notes: optionalText(500),
});

export const invitationCreateSchema = z.object({
  studentId: uuid,
  relationship: guardianLinkSchema.shape.relationship,
  email: z.string().trim().toLowerCase().email().optional(),
  expiresInDays: z.number().int().min(1).max(60).default(14),
});
