import { z } from 'zod';
import { ALLERGY_CATEGORIES, ALLERGY_SEVERITIES, BLOOD_TYPES, DISPOSITIONS, ENCOUNTER_TYPES, SCREENING_TYPES, ACCIDENT_SEVERITIES } from '../catalogs/clinical';
import { dateLike, isoDate, optionalText, trimmed, uuid } from './common';

export const healthProfileSchema = z.object({
  bloodType: z.enum(BLOOD_TYPES).optional().nullable(),
  eps: z.string().trim().max(120).optional().nullable(),
  prepaidPlan: z.string().trim().max(120).optional().nullable(),
  accidentInsurance: z.string().trim().max(120).optional().nullable(),
  accidentPolicyNumber: z.string().trim().max(60).optional().nullable(),
  preferredIps: z.string().trim().max(150).optional().nullable(),
  physicalActivityRestrictions: optionalText(2000),
  dietaryRestrictions: optionalText(2000),
  generalNotes: optionalText(4000),
});

export const allergySchema = z.object({
  category: z.enum(ALLERGY_CATEGORIES),
  agent: trimmed(2, 150),
  reaction: optionalText(500),
  severity: z.enum(ALLERGY_SEVERITIES),
  requiresEpinephrine: z.boolean().default(false),
  notes: optionalText(1000),
});

export const carePlanSchema = z.object({
  triggers: z.array(z.string().trim().max(200)).default([]),
  symptoms: z.array(z.string().trim().max(200)).default([]),
  steps: z.array(z.string().trim().max(500)).min(1),
  rescueMedications: z.array(z.string().trim().max(200)).default([]),
  contacts: z.array(z.string().trim().max(200)).default([]),
  reviewDate: isoDate.optional().nullable(),
});

export const chronicConditionSchema = z.object({
  name: trimmed(2, 150),
  icd10Code: z.string().trim().max(10).optional().nullable(),
  diagnosedAt: isoDate.optional().nullable(),
  critical: z.boolean().default(false),
  carePlan: carePlanSchema.optional().nullable(),
  treatingPhysician: z.string().trim().max(150).optional().nullable(),
  notes: optionalText(2000),
  active: z.boolean().default(true),
});

export const immunizationSchema = z.object({
  vaccine: trimmed(2, 100),
  doseLabel: z.string().trim().max(40).default('Única'),
  administeredOn: isoDate,
  lot: z.string().trim().max(40).optional().nullable(),
  provider: z.string().trim().max(150).optional().nullable(),
  cardFileId: uuid.optional().nullable(),
});

export const homeMedicationSchema = z.object({
  name: trimmed(2, 150),
  dose: z.string().trim().max(60),
  schedule: z.string().trim().max(120),
  reason: optionalText(300),
});

export const deviceSchema = z.object({
  type: z.enum(['INHALER', 'GLUCOMETER', 'INSULIN_PUMP', 'EPIPEN', 'HEARING_AID', 'GLASSES', 'ORTHOSIS', 'CGM', 'OTHER']),
  description: trimmed(2, 200),
  location: z.string().trim().max(150).optional().nullable(),
});

export const surgicalHistorySchema = z.object({
  kind: z.enum(['SURGERY', 'HOSPITALIZATION']),
  description: trimmed(2, 300),
  date: isoDate.optional().nullable(),
  notes: optionalText(1000),
});

export const disabilitySupportSchema = z.object({
  description: trimmed(2, 300),
  hasPiar: z.boolean().default(false),
  supports: optionalText(2000),
  reasonableAdjustments: optionalText(2000),
});

export const anthropometricSchema = z.object({
  measuredAt: isoDate,
  weightKg: z.number().min(1).max(250),
  heightCm: z.number().min(40).max(230),
  headCircumferenceCm: z.number().min(25).max(70).optional().nullable(),
  notes: optionalText(500),
});

export const screeningSchema = z.object({
  type: z.enum(SCREENING_TYPES),
  performedOn: isoDate,
  result: z.enum(['NORMAL', 'ABNORMAL', 'INCONCLUSIVE']),
  details: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}),
  referral: z.string().trim().max(300).optional().nullable(),
  notes: optionalText(1000),
});

export const vitalSignsSchema = z.object({
  takenAt: dateLike.optional(),
  temperatureC: z.number().min(30).max(43).optional().nullable(),
  heartRate: z.number().int().min(20).max(250).optional().nullable(),
  respiratoryRate: z.number().int().min(4).max(90).optional().nullable(),
  systolic: z.number().int().min(40).max(250).optional().nullable(),
  diastolic: z.number().int().min(20).max(150).optional().nullable(),
  spo2: z.number().int().min(50).max(100).optional().nullable(),
  glucoseMgDl: z.number().int().min(10).max(700).optional().nullable(),
  painScore: z.number().int().min(0).max(10).optional().nullable(),
  glasgow: z.number().int().min(3).max(15).optional().nullable(),
});

export const diagnosisSchema = z.object({
  system: z.enum(['ICD10', 'ICD11']).default('ICD10'),
  code: z.string().trim().min(1).max(12),
  description: trimmed(2, 300),
  primary: z.boolean().default(false),
});

export const treatmentSchema = z.object({
  description: trimmed(2, 300),
  itemId: uuid.optional().nullable(),
  quantity: z.number().positive().max(1000).optional().nullable(),
});

export const incidentSchema = z.object({
  place: z.string().trim().max(150),
  activity: z.string().trim().max(200).optional().nullable(),
  mechanism: z.string().trim().max(300),
  severity: z.enum(ACCIDENT_SEVERITIES).default('MILD'),
  witnesses: z.array(z.string().trim().max(150)).default([]),
  supervisingStaff: z.string().trim().max(150).optional().nullable(),
  insuranceNotified: z.boolean().default(false),
  workAccidentReport: z.boolean().default(false),
  preventiveActions: optionalText(1000),
});

export const encounterCreateSchema = z
  .object({
    subjectType: z.enum(['STUDENT', 'STAFF']).default('STUDENT'),
    studentId: uuid.optional().nullable(),
    staffPersonId: uuid.optional().nullable(),
    passId: uuid.optional().nullable(),
    type: z.enum(ENCOUNTER_TYPES),
    chiefComplaint: trimmed(2, 300),
    templateKey: z.string().max(40).optional().nullable(),
    referredBy: z.string().trim().max(150).optional().nullable(),
    referredFrom: z.string().trim().max(100).optional().nullable(),
    startedAt: dateLike.optional(),
  })
  .refine((v) => (v.subjectType === 'STUDENT' ? !!v.studentId : !!v.staffPersonId), {
    message: 'Debe indicar el estudiante o la persona del personal',
    path: ['studentId'],
  });

export const encounterUpdateSchema = z.object({
  type: z.enum(ENCOUNTER_TYPES).optional(),
  chiefComplaint: trimmed(2, 300).optional(),
  subjective: optionalText(),
  objective: optionalText(),
  assessment: optionalText(),
  plan: optionalText(),
  physicalExam: z.record(z.string(), z.string().max(500)).optional(),
  diagnoses: z.array(diagnosisSchema).max(10).optional(),
  treatments: z.array(treatmentSchema).max(30).optional(),
  incident: incidentSchema.optional().nullable(),
  restMinutes: z.number().int().min(0).max(480).optional().nullable(),
  parentSummary: optionalText(1000),
  isMentalHealth: z.boolean().optional(),
});

export const observationStartSchema = z.object({
  minutes: z.number().int().min(5).max(240),
  reason: trimmed(2, 300),
});

export const referralSchema = z.object({
  destination: trimmed(2, 200),
  transport: z.enum(['AMBULANCE', 'GUARDIAN', 'SCHOOL_VEHICLE', 'OTHER']),
  departedAt: dateLike.optional().nullable(),
  companion: z.string().trim().max(150).optional().nullable(),
  reason: trimmed(2, 500),
});

export const encounterCloseSchema = z.object({
  disposition: z.enum(DISPOSITIONS),
  parentSummary: optionalText(1000),
  referral: referralSchema.optional().nullable(),
  notifyGuardians: z.boolean().default(true),
  guardianSignature: z.string().max(200_000).optional().nullable(),
});

export const annulSchema = z.object({
  reason: z.string().trim().min(10, 'Explique el motivo (mínimo 10 caracteres)').max(1000),
});

export const addendumSchema = z.object({
  note: z.string().trim().min(3).max(4000),
});

export const mentalHealthNoteSchema = z.object({
  studentId: uuid,
  encounterId: uuid.optional().nullable(),
  note: z.string().trim().min(3).max(8000),
  riskLevel: z.enum(['NONE', 'LOW', 'MODERATE', 'HIGH']).default('NONE'),
  referral: z.string().trim().max(300).optional().nullable(),
});

export const encounterQuerySchema = z.object({
  studentId: uuid.optional(),
  status: z.enum(['OPEN', 'OBSERVATION', 'CLOSED', 'ANNULLED']).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  q: z.string().max(100).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
