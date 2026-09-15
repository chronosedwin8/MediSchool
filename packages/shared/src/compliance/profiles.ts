/**
 * Legal compliance profiles (PLAN §4). Seeded into `compliance.compliance_profiles`
 * and editable per tenant. Nothing in the code branches on the country: it
 * reads these rules.
 */

export interface ComplianceRules {
  country: string;
  name: string;
  laws: string[];
  majorityAge: number;
  clinicalRecordRetentionYears: number;
  auditRetentionYears: number;
  requiredConsents: ConsentType[];
  /** OTC medication may be given without a prescription when the guardian authorized it. */
  otcWithoutPrescription: boolean;
  requirePrescriptionForControlled: boolean;
  signature: { method: 'OTP' | 'OTP+DRAWN'; hashAlgorithm: 'SHA-256' };
  dataSubjectRights: string[];
  dsrSlaDays: number;
  mandatoryReports: { type: string; label: string; authority: string; deadlineHours: number }[];
  healthDataEncryptionRequired: boolean;
  quietHoursForNonUrgent: boolean;
  minorsCanSelfConsentFromAge: number | null;
  notes: string;
}

export const CONSENT_TYPES = ['DATA_PROCESSING', 'HEALTH_DATA', 'MEDICATION_ADMIN', 'EMERGENCY_CARE', 'PHOTO_INJURY', 'MENTAL_HEALTH', 'STANDING_EXIT'] as const;
export type ConsentType = (typeof CONSENT_TYPES)[number];
export const CONSENT_TYPE_LABELS: Record<ConsentType, string> = {
  DATA_PROCESSING: 'Tratamiento de datos personales',
  HEALTH_DATA: 'Tratamiento de datos sensibles de salud',
  MEDICATION_ADMIN: 'Administración de medicamentos',
  EMERGENCY_CARE: 'Atención y traslado en emergencia',
  PHOTO_INJURY: 'Fotografías de lesiones',
  MENTAL_HEALTH: 'Atención en salud mental / orientación',
  STANDING_EXIT: 'Autorización permanente de salida',
};

const base = {
  signature: { method: 'OTP' as const, hashAlgorithm: 'SHA-256' as const },
  healthDataEncryptionRequired: true,
  quietHoursForNonUrgent: true,
};

export const COMPLIANCE_PROFILES: ComplianceRules[] = [
  {
    ...base,
    country: 'CO',
    name: 'Colombia',
    laws: [
      'Ley 1581 de 2012 y Decreto 1377 de 2013 (Habeas Data)',
      'Ley 1098 de 2006 (Código de Infancia y Adolescencia)',
      'Resolución 1995 de 1999 y Resolución 866 de 2021 (Historia clínica)',
      'Ley 1616 de 2013 (Salud mental)',
      'Ley 1355 de 2009 (Obesidad) y Ley 2047 de 2020',
      'Resolución 3100 de 2019 y Decreto 780 de 2016',
      'Ley 911 de 2004 y Ley 1090 de 2006 (Ética)',
      'Decreto 1421 de 2017 (Inclusión, PIAR)',
      'Ley 1523 de 2012 (Gestión del riesgo)',
      'Ley 2300 de 2023 (Comunicaciones fuera de horario)',
    ],
    majorityAge: 18,
    clinicalRecordRetentionYears: 15,
    auditRetentionYears: 15,
    requiredConsents: ['DATA_PROCESSING', 'HEALTH_DATA', 'EMERGENCY_CARE'],
    otcWithoutPrescription: true,
    requirePrescriptionForControlled: true,
    dataSubjectRights: ['ACCESS', 'RECTIFICATION', 'CANCELLATION', 'OPPOSITION', 'PORTABILITY'],
    dsrSlaDays: 15,
    mandatoryReports: [
      { type: 'SIVIGILA', label: 'Evento de notificación obligatoria (SIVIGILA)', authority: 'Secretaría de Salud / INS', deadlineHours: 24 },
      { type: 'ABUSE_SUSPICION', label: 'Sospecha de maltrato o abuso', authority: 'ICBF / Comisaría de Familia', deadlineHours: 24 },
      { type: 'SEVERE_ACCIDENT', label: 'Accidente escolar grave', authority: 'Aseguradora / Secretaría de Educación', deadlineHours: 48 },
      { type: 'WORK_ACCIDENT', label: 'Accidente laboral (personal)', authority: 'ARL', deadlineHours: 48 },
    ],
    minorsCanSelfConsentFromAge: null,
    notes: 'Retención mínima de historia clínica 15 años desde el último registro (Res. 839/2017). Aviso de privacidad y registro de bases de datos ante la SIC.',
  },
  {
    ...base,
    country: 'US',
    name: 'Estados Unidos',
    laws: ['FERPA', 'HIPAA (si aplica)', 'Section 504 / IDEA (IHP, 504 plans)', 'State school epinephrine and medication laws'],
    majorityAge: 18,
    clinicalRecordRetentionYears: 7,
    auditRetentionYears: 6,
    requiredConsents: ['DATA_PROCESSING', 'MEDICATION_ADMIN', 'EMERGENCY_CARE'],
    otcWithoutPrescription: false,
    requirePrescriptionForControlled: true,
    dataSubjectRights: ['ACCESS', 'RECTIFICATION'],
    dsrSlaDays: 45,
    mandatoryReports: [
      { type: 'COMMUNICABLE_DISEASE', label: 'Reportable communicable disease', authority: 'Local health department', deadlineHours: 24 },
      { type: 'ABUSE_SUSPICION', label: 'Suspected child abuse', authority: 'Child Protective Services', deadlineHours: 24 },
    ],
    minorsCanSelfConsentFromAge: null,
    notes: 'Education records under FERPA; HIPAA applies only when the school is a covered entity.',
  },
  {
    ...base,
    country: 'DE',
    name: 'Unión Europea / Alemania',
    laws: ['GDPR / DSGVO art. 9', 'BDSG', 'Schulgesetze der Länder (Medikamentengabe)'],
    majorityAge: 18,
    clinicalRecordRetentionYears: 10,
    auditRetentionYears: 6,
    requiredConsents: ['DATA_PROCESSING', 'HEALTH_DATA', 'MEDICATION_ADMIN', 'EMERGENCY_CARE'],
    otcWithoutPrescription: false,
    requirePrescriptionForControlled: true,
    dataSubjectRights: ['ACCESS', 'RECTIFICATION', 'ERASURE', 'RESTRICTION', 'PORTABILITY', 'OBJECTION'],
    dsrSlaDays: 30,
    mandatoryReports: [{ type: 'IFSG', label: 'Meldepflichtige Krankheit (IfSG)', authority: 'Gesundheitsamt', deadlineHours: 24 }],
    minorsCanSelfConsentFromAge: 16,
    notes: 'DPIA obligatoria; DPO designado; derecho al olvido con excepción de retención legal.',
  },
  {
    ...base,
    country: 'MX',
    name: 'México',
    laws: ['LFPDPPP', 'LGPDPPSO', 'NOM-004-SSA3-2012 (Expediente clínico)', 'Ley General de los Derechos de NNA'],
    majorityAge: 18,
    clinicalRecordRetentionYears: 5,
    auditRetentionYears: 5,
    requiredConsents: ['DATA_PROCESSING', 'HEALTH_DATA', 'EMERGENCY_CARE'],
    otcWithoutPrescription: true,
    requirePrescriptionForControlled: true,
    dataSubjectRights: ['ACCESS', 'RECTIFICATION', 'CANCELLATION', 'OPPOSITION'],
    dsrSlaDays: 20,
    mandatoryReports: [{ type: 'EPI', label: 'Notificación epidemiológica', authority: 'SINAVE', deadlineHours: 24 }],
    minorsCanSelfConsentFromAge: null,
    notes: '',
  },
  {
    ...base,
    country: 'AR',
    name: 'Argentina',
    laws: ['Ley 25.326', 'Ley 26.529', 'Ley 26.061'],
    majorityAge: 18,
    clinicalRecordRetentionYears: 10,
    auditRetentionYears: 10,
    requiredConsents: ['DATA_PROCESSING', 'HEALTH_DATA', 'EMERGENCY_CARE'],
    otcWithoutPrescription: true,
    requirePrescriptionForControlled: true,
    dataSubjectRights: ['ACCESS', 'RECTIFICATION', 'SUPPRESSION'],
    dsrSlaDays: 10,
    mandatoryReports: [{ type: 'SNVS', label: 'Notificación SNVS', authority: 'Ministerio de Salud', deadlineHours: 24 }],
    minorsCanSelfConsentFromAge: 16,
    notes: '',
  },
  {
    ...base,
    country: 'CL',
    name: 'Chile',
    laws: ['Ley 19.628 / Ley 21.719', 'Ley 20.584'],
    majorityAge: 18,
    clinicalRecordRetentionYears: 15,
    auditRetentionYears: 10,
    requiredConsents: ['DATA_PROCESSING', 'HEALTH_DATA', 'EMERGENCY_CARE'],
    otcWithoutPrescription: true,
    requirePrescriptionForControlled: true,
    dataSubjectRights: ['ACCESS', 'RECTIFICATION', 'CANCELLATION', 'OPPOSITION', 'PORTABILITY'],
    dsrSlaDays: 30,
    mandatoryReports: [{ type: 'ENO', label: 'Enfermedad de notificación obligatoria', authority: 'SEREMI de Salud', deadlineHours: 24 }],
    minorsCanSelfConsentFromAge: 14,
    notes: '',
  },
  {
    ...base,
    country: 'PE',
    name: 'Perú',
    laws: ['Ley 29733', 'Ley 29414'],
    majorityAge: 18,
    clinicalRecordRetentionYears: 20,
    auditRetentionYears: 10,
    requiredConsents: ['DATA_PROCESSING', 'HEALTH_DATA', 'EMERGENCY_CARE'],
    otcWithoutPrescription: true,
    requirePrescriptionForControlled: true,
    dataSubjectRights: ['ACCESS', 'RECTIFICATION', 'CANCELLATION', 'OPPOSITION'],
    dsrSlaDays: 20,
    mandatoryReports: [{ type: 'NOTI', label: 'Notificación epidemiológica', authority: 'CDC-MINSA', deadlineHours: 24 }],
    minorsCanSelfConsentFromAge: 14,
    notes: '',
  },
  {
    ...base,
    country: 'BR',
    name: 'Brasil',
    laws: ['LGPD (dados sensíveis)', 'ECA'],
    majorityAge: 18,
    clinicalRecordRetentionYears: 20,
    auditRetentionYears: 5,
    requiredConsents: ['DATA_PROCESSING', 'HEALTH_DATA', 'EMERGENCY_CARE'],
    otcWithoutPrescription: false,
    requirePrescriptionForControlled: true,
    dataSubjectRights: ['ACCESS', 'CORRECTION', 'ANONYMIZATION', 'PORTABILITY', 'DELETION'],
    dsrSlaDays: 15,
    mandatoryReports: [{ type: 'SINAN', label: 'Notificação compulsória (SINAN)', authority: 'Secretaria de Saúde', deadlineHours: 24 }],
    minorsCanSelfConsentFromAge: null,
    notes: '',
  },
  {
    ...base,
    country: 'ES',
    name: 'España',
    laws: ['LOPDGDD', 'Ley 41/2002 (autonomía del paciente)', 'Protocolos autonómicos de administración de medicación'],
    majorityAge: 18,
    clinicalRecordRetentionYears: 5,
    auditRetentionYears: 5,
    requiredConsents: ['DATA_PROCESSING', 'HEALTH_DATA', 'MEDICATION_ADMIN', 'EMERGENCY_CARE'],
    otcWithoutPrescription: false,
    requirePrescriptionForControlled: true,
    dataSubjectRights: ['ACCESS', 'RECTIFICATION', 'ERASURE', 'RESTRICTION', 'PORTABILITY', 'OBJECTION'],
    dsrSlaDays: 30,
    mandatoryReports: [{ type: 'EDO', label: 'Enfermedad de declaración obligatoria', authority: 'Salud Pública autonómica', deadlineHours: 24 }],
    minorsCanSelfConsentFromAge: 14,
    notes: '',
  },
];

export function profileFor(country: string): ComplianceRules {
  return COMPLIANCE_PROFILES.find((p) => p.country === country) ?? COMPLIANCE_PROFILES[0];
}
