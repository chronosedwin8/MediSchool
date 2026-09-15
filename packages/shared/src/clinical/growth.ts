import data from './who-growth-data.json';

/**
 * WHO growth z-scores and percentiles (LMS method).
 * 0–60 months: WHO Child Growth Standards (2006).
 * 61–228 months: WHO Growth Reference 2007 (5–19 y). Weight-for-age ends at 120 months.
 * For weight and BMI, |z| > 3 uses the WHO restricted computation (SD23).
 */

type Row = [number, number, number, number];
type Indicator = 'bmi' | 'wfa' | 'hfa';
export type Sex = 'M' | 'F';

const TABLES = data as unknown as Record<Indicator, Record<'1' | '2', Row[]>>;

function lms(indicator: Indicator, sex: Sex, ageMonths: number): Row | null {
  const table = TABLES[indicator][sex === 'M' ? '1' : '2'];
  const m = Math.round(ageMonths);
  if (m < table[0][0] || m > table[table.length - 1][0]) return null;
  return table[m - table[0][0]] ?? null;
}

function zFromLms(x: number, L: number, M: number, S: number, restricted: boolean): number {
  let z = Math.abs(L) < 1e-9 ? Math.log(x / M) / S : (Math.pow(x / M, L) - 1) / (L * S);
  if (!restricted) return z;
  const sd = (k: number) => M * Math.pow(1 + L * S * k, 1 / L);
  if (z > 3) {
    const sd3 = sd(3);
    z = 3 + (x - sd3) / (sd3 - sd(2));
  } else if (z < -3) {
    const sdm3 = sd(-3);
    z = -3 + (x - sdm3) / (sd(-2) - sdm3);
  }
  return z;
}

/** Standard normal CDF (Abramowitz–Stegun 26.2.17), accurate to ~1e-7. */
export function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp((-z * z) / 2);
  const p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z > 0 ? 1 - p : p;
}

export function ageInMonths(birthDate: Date | string, at: Date | string = new Date()): number {
  const b = new Date(birthDate);
  const a = new Date(at);
  const days = (a.getTime() - b.getTime()) / 86400000;
  return days / 30.4375;
}

export function ageInYears(birthDate: Date | string, at: Date | string = new Date()): number {
  const b = new Date(birthDate);
  const a = new Date(at);
  let y = a.getFullYear() - b.getFullYear();
  if (a.getMonth() < b.getMonth() || (a.getMonth() === b.getMonth() && a.getDate() < b.getDate())) y--;
  return y;
}

export interface GrowthIndicator {
  z: number;
  percentile: number;
}

export interface GrowthResult {
  ageMonths: number;
  bmi: number;
  bmiForAge: GrowthIndicator | null;
  weightForAge: GrowthIndicator | null;
  heightForAge: GrowthIndicator | null;
  classification: { code: string; label: string; level: 'normal' | 'warning' | 'critical' } | null;
  stunting: boolean;
}

const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

function indicator(ind: Indicator, sex: Sex, ageMonths: number, value: number): GrowthIndicator | null {
  const row = lms(ind, sex, ageMonths);
  if (!row || !(value > 0)) return null;
  const z = zFromLms(value, row[1], row[2], row[3], ind !== 'hfa');
  return { z: round(z), percentile: round(normalCdf(z) * 100, 1) };
}

export function classifyBmiZ(z: number, ageMonths: number): GrowthResult['classification'] {
  if (ageMonths < 61) {
    if (z > 3) return { code: 'OBESITY', label: 'Obesidad', level: 'critical' };
    if (z > 2) return { code: 'OVERWEIGHT', label: 'Sobrepeso', level: 'warning' };
    if (z > 1) return { code: 'RISK_OVERWEIGHT', label: 'Riesgo de sobrepeso', level: 'warning' };
    if (z < -3) return { code: 'SEVERE_WASTING', label: 'Desnutrición aguda severa', level: 'critical' };
    if (z < -2) return { code: 'WASTING', label: 'Desnutrición aguda moderada', level: 'critical' };
    if (z < -1) return { code: 'RISK_WASTING', label: 'Riesgo de desnutrición', level: 'warning' };
    return { code: 'NORMAL', label: 'Adecuado', level: 'normal' };
  }
  if (z > 2) return { code: 'OBESITY', label: 'Obesidad', level: 'critical' };
  if (z > 1) return { code: 'OVERWEIGHT', label: 'Sobrepeso', level: 'warning' };
  if (z < -3) return { code: 'SEVERE_THINNESS', label: 'Delgadez severa', level: 'critical' };
  if (z < -2) return { code: 'THINNESS', label: 'Delgadez', level: 'critical' };
  if (z < -1) return { code: 'RISK_THINNESS', label: 'Riesgo de delgadez', level: 'warning' };
  return { code: 'NORMAL', label: 'Adecuado', level: 'normal' };
}

export function computeGrowth(input: { sex: Sex; birthDate: Date | string; measuredAt: Date | string; weightKg: number; heightCm: number }): GrowthResult {
  const ageMonths = ageInMonths(input.birthDate, input.measuredAt);
  const bmi = input.weightKg / Math.pow(input.heightCm / 100, 2);
  const bmiForAge = indicator('bmi', input.sex, ageMonths, bmi);
  const heightForAge = indicator('hfa', input.sex, ageMonths, input.heightCm);
  return {
    ageMonths: round(ageMonths, 1),
    bmi: round(bmi),
    bmiForAge,
    weightForAge: indicator('wfa', input.sex, ageMonths, input.weightKg),
    heightForAge,
    classification: bmiForAge ? classifyBmiZ(bmiForAge.z, ageMonths) : null,
    stunting: !!heightForAge && heightForAge.z < -2,
  };
}
