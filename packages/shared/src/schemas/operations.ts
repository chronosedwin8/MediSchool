import { z } from 'zod';
import { PASS_STATES, PASS_URGENCIES } from '../flow/pass-machine';
import { ROUTES } from '../meds/five-rights';
import { CONSENT_TYPES } from '../compliance/profiles';
import { dateLike, hhmm, isoDate, optionalText, trimmed, uuid } from './common';

// ── flow ────────────────────────────────────────────────────────────────────
export const passCreateSchema = z.object({
  studentId: uuid,
  reason: trimmed(2, 200),
  urgency: z.enum(PASS_URGENCIES).default('MEDIUM'),
  accompanied: z.boolean().default(false),
  companionName: z.string().trim().max(150).optional().nullable(),
  subject: z.string().trim().max(120).optional().nullable(),
  classroom: z.string().trim().max(60).optional().nullable(),
  notes: optionalText(500),
  clientCreatedAt: dateLike.optional(),
});

export const passTransitionSchema = z.object({
  to: z.enum(PASS_STATES),
  note: z.string().trim().max(500).optional().nullable(),
});

export const passQuerySchema = z.object({
  state: z.string().optional(),
  open: z.coerce.boolean().optional(),
  studentId: uuid.optional(),
  mine: z.coerce.boolean().optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

export const exitAuthorizationCreateSchema = z.object({
  passId: uuid,
  reason: trimmed(2, 500),
  guardianIds: z.array(uuid).default([]),
  useStandingPermission: z.boolean().default(false),
});

export const guardianExitConfirmSchema = z.object({
  pickupGuardianPersonId: uuid.optional().nullable(),
  pickupName: trimmed(3, 150),
  pickupDocument: trimmed(3, 30),
  pickupRelationship: trimmed(2, 60),
  pickupPhone: z.string().trim().max(20).optional().nullable(),
  estimatedArrival: hhmm.optional().nullable(),
});

export const gateCheckoutSchema = z.object({
  exitAuthorizationId: uuid,
  method: z.enum(['QR', 'DOCUMENT', 'MANUAL']),
  verifiedDocument: z.string().trim().max(30).optional().nullable(),
  observations: optionalText(500),
  signature: z.string().max(200_000).optional().nullable(),
});

export const standingExitPermissionSchema = z.object({
  studentId: uuid,
  validFrom: isoDate,
  validTo: isoDate,
  conditions: trimmed(3, 1000),
});

// ── meds ────────────────────────────────────────────────────────────────────
export const MEDICATION_FREQUENCIES = ['ONCE', 'DAILY', 'WEEKDAYS', 'CUSTOM_DAYS', 'PRN'] as const;
export const MEDICATION_REQUEST_STATUSES = ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'ACTIVE', 'SUSPENDED', 'COMPLETED', 'CANCELLED'] as const;

export const medicationRequestSchema = z
  .object({
    studentId: uuid,
    catalogId: uuid.optional().nullable(),
    medicationName: trimmed(2, 150),
    activeIngredient: z.string().trim().max(150).optional().nullable(),
    presentation: z.string().trim().max(100).optional().nullable(),
    dose: z.number().positive('La dosis debe ser mayor que cero').max(10000),
    doseUnit: trimmed(1, 20),
    route: z.enum(ROUTES),
    frequency: z.enum(MEDICATION_FREQUENCIES),
    times: z.array(hhmm).max(8).default([]),
    daysOfWeek: z.array(z.number().int().min(0).max(6)).default([]),
    startDate: isoDate,
    endDate: isoDate,
    indication: trimmed(2, 300),
    prescriberName: z.string().trim().max(150).optional().nullable(),
    prescriberLicense: z.string().trim().max(40).optional().nullable(),
    prescriptionFileId: uuid.optional().nullable(),
    prescriptionDate: isoDate.optional().nullable(),
    isPrn: z.boolean().default(false),
    prnCriteria: z.string().trim().max(500).optional().nullable(),
    minIntervalMinutes: z.number().int().min(0).max(1440).optional().nullable(),
    maxDosesPerDay: z.number().int().min(1).max(24).optional().nullable(),
    selfAdministration: z.boolean().default(false),
    storage: z.enum(['SHELF', 'FRIDGE', 'CONTROLLED', 'STUDENT_CARRIES']).default('SHELF'),
    notes: optionalText(1000),
  })
  .refine((v) => v.endDate >= v.startDate, { message: 'La fecha fin debe ser igual o posterior a la de inicio', path: ['endDate'] })
  .refine((v) => v.isPrn || v.frequency === 'PRN' || v.times.length > 0, { message: 'Indique al menos un horario', path: ['times'] })
  .refine((v) => !(v.isPrn || v.frequency === 'PRN') || !!v.prnCriteria, { message: 'Indique cuándo administrar (PRN)', path: ['prnCriteria'] });

export const medicationReviewSchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT']),
  reason: z.string().trim().max(1000).optional().nullable(),
  checks: z.object({
    prescriptionMatches: z.boolean(),
    doseMatches: z.boolean(),
    notExpired: z.boolean(),
    packagingIntact: z.boolean(),
    labeled: z.boolean(),
  }),
});

export const medicationStatusChangeSchema = z.object({
  status: z.enum(['SUSPENDED', 'ACTIVE', 'COMPLETED', 'CANCELLED']),
  reason: trimmed(3, 500),
});

export const custodyReceiveSchema = z.object({
  requestId: uuid,
  quantity: z.number().positive().max(100000),
  unit: trimmed(1, 20),
  lot: trimmed(1, 40),
  expiryDate: isoDate,
  deliveredBy: trimmed(2, 150),
  storage: z.enum(['SHELF', 'FRIDGE', 'CONTROLLED']),
  locationId: uuid.optional().nullable(),
  packagingIntact: z.boolean(),
  labeled: z.boolean(),
  notes: optionalText(500),
});

export const custodyReturnSchema = z.object({
  quantity: z.number().min(0),
  action: z.enum(['RETURNED_TO_GUARDIAN', 'DISPOSED']),
  receivedBy: trimmed(2, 150),
  notes: optionalText(500),
});

export const administrationSchema = z.object({
  requestId: uuid,
  scheduleId: uuid.optional().nullable(),
  scannedStudentId: uuid,
  medicationName: trimmed(2, 150),
  catalogId: uuid.optional().nullable(),
  dose: z.number().positive().max(10000),
  doseUnit: trimmed(1, 20),
  route: z.enum(ROUTES),
  outcome: z.enum(['GIVEN', 'REFUSED', 'OMITTED', 'HELD']),
  reason: z.string().trim().max(500).optional().nullable(),
  adverseEffects: z.string().trim().max(1000).optional().nullable(),
  witnessUserId: uuid.optional().nullable(),
  encounterId: uuid.optional().nullable(),
  selfAdministered: z.boolean().default(false),
  notes: optionalText(1000),
}).refine((v) => v.outcome === 'GIVEN' || !!v.reason, { message: 'Indique el motivo', path: ['reason'] });

// ── inventory ───────────────────────────────────────────────────────────────
export const itemSchema = z.object({
  kind: z.enum(['MEDICATION', 'SUPPLY']),
  name: trimmed(2, 150),
  genericName: z.string().trim().max(150).optional().nullable(),
  presentation: z.string().trim().max(100).optional().nullable(),
  concentration: z.string().trim().max(60).optional().nullable(),
  unit: trimmed(1, 20),
  atcCode: z.string().trim().max(10).optional().nullable(),
  requiresRefrigeration: z.boolean().default(false),
  controlled: z.boolean().default(false),
  minStock: z.number().min(0).default(0),
  maxStock: z.number().min(0).optional().nullable(),
  unitCost: z.number().min(0).optional().nullable(),
  catalogMedicationId: uuid.optional().nullable(),
  active: z.boolean().default(true),
});

export const batchReceiveSchema = z.object({
  itemId: uuid,
  lot: trimmed(1, 40),
  expiryDate: isoDate.optional().nullable(),
  quantity: z.number().positive().max(1_000_000),
  locationId: uuid,
  supplierId: uuid.optional().nullable(),
  unitCost: z.number().min(0).optional().nullable(),
  source: z.enum(['PURCHASE', 'DONATION', 'GUARDIAN', 'TRANSFER']),
  purchaseOrderId: uuid.optional().nullable(),
  notes: optionalText(500),
});

export const stockMovementSchema = z
  .object({
    itemId: uuid,
    batchId: uuid.optional().nullable(),
    locationId: uuid,
    type: z.enum(['CONSUMPTION', 'EXPIRED', 'RETURN', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'TRANSFER_OUT', 'TRANSFER_IN', 'DAMAGED']),
    quantity: z.number().positive().max(1_000_000),
    reason: trimmed(3, 500),
    secondSignerEmail: z.string().email().optional().nullable(),
    secondSignerPassword: z.string().optional().nullable(),
    encounterId: uuid.optional().nullable(),
  });

export const locationSchema = z.object({
  name: trimmed(2, 120),
  kind: z.enum(['SHELF', 'FRIDGE', 'CONTROLLED_CABINET', 'KIT', 'WAREHOUSE']),
  campusId: uuid.optional().nullable(),
  minTempC: z.number().optional().nullable(),
  maxTempC: z.number().optional().nullable(),
});

export const supplierSchema = z.object({
  name: trimmed(2, 150),
  taxId: z.string().trim().max(30).optional().nullable(),
  contactName: z.string().trim().max(150).optional().nullable(),
  phone: z.string().trim().max(30).optional().nullable(),
  email: z.string().email().optional().nullable(),
});

export const purchaseOrderSchema = z.object({
  supplierId: uuid,
  expectedOn: isoDate.optional().nullable(),
  lines: z.array(z.object({ itemId: uuid, quantity: z.number().positive(), unitCost: z.number().min(0) })).min(1),
  notes: optionalText(500),
});

export const kitSchema = z.object({
  name: trimmed(2, 120),
  kind: z.enum(['EMERGENCY', 'FIRST_AID', 'FIELD_TRIP', 'SPORTS']),
  locationDescription: trimmed(2, 200),
  sectionId: uuid.optional().nullable(),
  checkEveryDays: z.number().int().min(1).max(365).default(30),
  items: z.array(z.object({ itemId: uuid, expectedQuantity: z.number().positive() })).default([]),
});

export const kitCheckSchema = z.object({
  lines: z.array(z.object({ itemId: uuid, present: z.number().min(0), expiryOk: z.boolean() })),
  notes: optionalText(1000),
});

export const fridgeLogSchema = z.object({
  locationId: uuid,
  temperatureC: z.number().min(-30).max(40),
  recordedAt: dateLike.optional(),
  notes: optionalText(300),
});

// ── comms ───────────────────────────────────────────────────────────────────
export const CHANNELS = ['IN_APP', 'EMAIL', 'WHATSAPP', 'SMS', 'PUSH'] as const;
export const NOTIFICATION_EVENTS = [
  'PASS_CREATED',
  'NURSING_ARRIVAL',
  'ENCOUNTER_CLOSED',
  'EXIT_AUTHORIZATION',
  'EXIT_COMPLETED',
  'TRANSFER_IPS',
  'DOSE_GIVEN',
  'DOSE_OMITTED',
  'MEDICATION_REQUEST_REVIEWED',
  'MEDICATION_EXPIRING',
  'PROFILE_UPDATE_REMINDER',
  'VACCINATION_PENDING',
  'OUTBREAK_ALERT',
  'CONSENT_OTP',
  'CONSENT_PENDING',
  'MESSAGE_RECEIVED',
  'CIRCULAR',
  'PASS_TRANSIT_ALERT',
  'OBSERVATION_RECHECK',
  'LOW_STOCK',
  'FRIDGE_OUT_OF_RANGE',
  'FREQUENT_VISITOR',
] as const;

export const notificationPreferencesSchema = z.object({
  channels: z.record(z.enum(CHANNELS), z.boolean()),
  quietHoursStart: hhmm.default('20:00'),
  quietHoursEnd: hhmm.default('06:00'),
  language: z.enum(['es-CO', 'es', 'en', 'de', 'pt']).default('es-CO'),
  whatsappNumber: z.string().trim().max(20).optional().nullable(),
});

export const messageCreateSchema = z.object({
  threadId: uuid.optional().nullable(),
  studentId: uuid.optional().nullable(),
  encounterId: uuid.optional().nullable(),
  subject: z.string().trim().max(150).optional().nullable(),
  body: trimmed(1, 4000),
  attachmentIds: z.array(uuid).max(5).default([]),
});

export const circularSchema = z.object({
  title: trimmed(3, 150),
  body: trimmed(3, 10000),
  category: z.enum(['OUTBREAK', 'CAMPAIGN', 'RECOMMENDATION', 'GENERAL']).default('GENERAL'),
  sectionIds: z.array(uuid).default([]),
  gradeIds: z.array(uuid).default([]),
  groupIds: z.array(uuid).default([]),
  channels: z.array(z.enum(CHANNELS)).min(1).default(['IN_APP', 'EMAIL']),
});

export const templateUpdateSchema = z.object({
  subject: z.string().max(200).optional().nullable(),
  body: trimmed(3, 4000),
  active: z.boolean().default(true),
});

// ── compliance ──────────────────────────────────────────────────────────────
export const consentOtpRequestSchema = z.object({
  templateId: uuid,
  studentId: uuid,
});

export const consentSignSchema = z.object({
  templateId: uuid,
  studentId: uuid,
  otp: z.string().regex(/^\d{6}$/),
  accepted: z.literal(true),
});

export const consentRevokeSchema = z.object({ reason: trimmed(3, 500) });

export const consentTemplateSchema = z.object({
  type: z.enum(CONSENT_TYPES),
  title: trimmed(3, 200),
  body: trimmed(20, 50000),
  version: trimmed(1, 20),
  effectiveFrom: isoDate,
  mandatory: z.boolean().default(true),
});

export const dsrCreateSchema = z.object({
  type: z.enum(['ACCESS', 'RECTIFICATION', 'CANCELLATION', 'OPPOSITION', 'PORTABILITY', 'ERASURE']),
  subjectPersonId: uuid,
  description: trimmed(5, 2000),
});

export const dsrResolveSchema = z.object({
  status: z.enum(['IN_PROGRESS', 'RESOLVED', 'REJECTED']),
  resolution: trimmed(3, 4000),
});

export const legalHoldSchema = z.object({
  personId: uuid,
  reason: trimmed(5, 1000),
  reference: z.string().trim().max(100).optional().nullable(),
});

export const mandatoryReportSchema = z.object({
  type: trimmed(2, 40),
  studentId: uuid.optional().nullable(),
  encounterId: uuid.optional().nullable(),
  authority: trimmed(2, 150),
  details: trimmed(5, 8000),
  filedReference: z.string().trim().max(100).optional().nullable(),
});

// ── public health ───────────────────────────────────────────────────────────
export const campaignSchema = z.object({
  name: trimmed(3, 150),
  kind: z.enum(['VACCINATION', 'DEWORMING', 'SCREENING', 'HEALTH_EDUCATION', 'LICE_CONTROL', 'ORAL_HEALTH', 'PROFILE_UPDATE']),
  startsOn: isoDate,
  endsOn: isoDate,
  description: optionalText(4000),
  sectionIds: z.array(uuid).default([]),
  gradeIds: z.array(uuid).default([]),
});

export const absenceExcuseSchema = z.object({
  studentId: uuid,
  from: isoDate,
  to: isoDate,
  reason: trimmed(3, 500),
  illness: z.boolean().default(true),
  symptoms: z.string().trim().max(300).optional().nullable(),
  attachmentId: uuid.optional().nullable(),
});

export const fieldTripSchema = z.object({
  name: trimmed(3, 150),
  date: isoDate,
  destination: trimmed(3, 200),
  groupIds: z.array(uuid).min(1),
  kitId: uuid.optional().nullable(),
  responsibleStaff: z.string().trim().max(200).optional().nullable(),
});

export const drillSchema = z.object({
  protocolKey: trimmed(2, 40),
  performedOn: isoDate,
  participants: z.number().int().min(0).default(0),
  durationMinutes: z.number().int().min(0).optional().nullable(),
  findings: optionalText(4000),
});

export const statsQuerySchema = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  sectionId: uuid.optional(),
  gradeId: uuid.optional(),
  groupId: uuid.optional(),
  compareYear: z.coerce.boolean().optional(),
});
