/**
 * Pediatric vital sign reference ranges by age group.
 * Sources: PALS 2020 reference tables (HR/RR), PALS hypotension rule
 * (SBP < 70 + 2×age for 1–10 y), WHO/usual clinical thresholds for temperature,
 * SpO2 and capillary glucose. They are *referential* and configurable per
 * tenant — clinical judgement prevails (validated by the institutional doctor).
 */

export type VitalKey =
  | 'temperatureC'
  | 'heartRate'
  | 'respiratoryRate'
  | 'systolic'
  | 'diastolic'
  | 'spo2'
  | 'glucoseMgDl'
  | 'painScore'
  | 'glasgow';

export type VitalLevel = 'normal' | 'warning' | 'critical';

interface Band {
  normal: [number, number];
  critical: [number, number]; // below [0] or above [1] = critical
}

type AgeGroup = 'infant' | 'toddler' | 'preschool' | 'school' | 'adolescent' | 'adult';

export function ageGroup(ageYears: number): AgeGroup {
  if (ageYears < 1) return 'infant';
  if (ageYears < 3) return 'toddler';
  if (ageYears < 6) return 'preschool';
  if (ageYears < 12) return 'school';
  if (ageYears < 18) return 'adolescent';
  return 'adult';
}

const HR: Record<AgeGroup, Band> = {
  infant: { normal: [100, 160], critical: [80, 205] },
  toddler: { normal: [90, 150], critical: [70, 190] },
  preschool: { normal: [80, 140], critical: [60, 180] },
  school: { normal: [70, 120], critical: [50, 150] },
  adolescent: { normal: [60, 100], critical: [45, 140] },
  adult: { normal: [60, 100], critical: [40, 130] },
};

const RR: Record<AgeGroup, Band> = {
  infant: { normal: [30, 53], critical: [20, 70] },
  toddler: { normal: [22, 37], critical: [15, 50] },
  preschool: { normal: [20, 28], critical: [14, 40] },
  school: { normal: [18, 25], critical: [12, 35] },
  adolescent: { normal: [12, 20], critical: [8, 30] },
  adult: { normal: [12, 20], critical: [8, 30] },
};

function sbpBand(ageYears: number): Band {
  const hypotension = ageYears < 1 ? 70 : ageYears <= 10 ? 70 + 2 * Math.floor(ageYears) : 90;
  const upper = ageYears < 6 ? 110 : ageYears < 10 ? 118 : ageYears < 13 ? 125 : 130;
  return { normal: [hypotension + 10, upper], critical: [hypotension, upper + 30] };
}

function dbpBand(ageYears: number): Band {
  const upper = ageYears < 6 ? 70 : ageYears < 13 ? 80 : 85;
  return { normal: [40, upper], critical: [30, upper + 25] };
}

const FIXED: Record<'temperatureC' | 'spo2' | 'glucoseMgDl' | 'painScore' | 'glasgow', Band> = {
  temperatureC: { normal: [36.0, 37.5], critical: [35.0, 39.5] },
  spo2: { normal: [95, 100], critical: [92, 101] },
  glucoseMgDl: { normal: [70, 140], critical: [54, 300] },
  painScore: { normal: [0, 3], critical: [-1, 6] },
  glasgow: { normal: [15, 15], critical: [13, 16] },
};

export function vitalBand(key: VitalKey, ageYears: number): Band {
  const g = ageGroup(ageYears);
  switch (key) {
    case 'heartRate':
      return HR[g];
    case 'respiratoryRate':
      return RR[g];
    case 'systolic':
      return sbpBand(ageYears);
    case 'diastolic':
      return dbpBand(ageYears);
    default:
      return FIXED[key];
  }
}

export function classifyVital(key: VitalKey, value: number | null | undefined, ageYears: number): VitalLevel | null {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  const b = vitalBand(key, ageYears);
  if (value < b.critical[0] || value > b.critical[1]) return 'critical';
  if (value < b.normal[0] || value > b.normal[1]) return 'warning';
  return 'normal';
}

export const VITAL_META: Record<VitalKey, { label: string; unit: string; min: number; max: number; step: number }> = {
  temperatureC: { label: 'Temperatura', unit: '°C', min: 30, max: 43, step: 0.1 },
  heartRate: { label: 'Frecuencia cardiaca', unit: 'lpm', min: 20, max: 250, step: 1 },
  respiratoryRate: { label: 'Frecuencia respiratoria', unit: 'rpm', min: 4, max: 90, step: 1 },
  systolic: { label: 'TA sistólica', unit: 'mmHg', min: 40, max: 250, step: 1 },
  diastolic: { label: 'TA diastólica', unit: 'mmHg', min: 20, max: 150, step: 1 },
  spo2: { label: 'SatO₂', unit: '%', min: 50, max: 100, step: 1 },
  glucoseMgDl: { label: 'Glucometría', unit: 'mg/dL', min: 10, max: 700, step: 1 },
  painScore: { label: 'Dolor (EVA)', unit: '/10', min: 0, max: 10, step: 1 },
  glasgow: { label: 'Glasgow', unit: '/15', min: 3, max: 15, step: 1 },
};

export function classifyAll(vitals: Partial<Record<VitalKey, number | null>>, ageYears: number) {
  const out: Partial<Record<VitalKey, VitalLevel>> = {};
  let worst: VitalLevel = 'normal';
  for (const key of Object.keys(VITAL_META) as VitalKey[]) {
    const lvl = classifyVital(key, vitals[key] ?? null, ageYears);
    if (!lvl) continue;
    out[key] = lvl;
    if (lvl === 'critical' || (lvl === 'warning' && worst === 'normal')) worst = lvl;
  }
  return { levels: out, worst };
}
