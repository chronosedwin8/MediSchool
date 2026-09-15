/**
 * "5 correctos" verification for medication administration (PLAN §5.5):
 * right patient, right medication, right dose, right route, right time.
 * Plus hard safety stops: documented allergy to the medication, expired custody
 * batch, inactive order and PRN minimum interval / max daily doses.
 */

export const ROUTES = [
  'ORAL',
  'SUBLINGUAL',
  'BUCCAL',
  'INHALED',
  'NASAL',
  'OPHTHALMIC',
  'OTIC',
  'TOPICAL',
  'SUBCUTANEOUS',
  'INTRAMUSCULAR',
  'RECTAL',
  'TRANSDERMAL',
] as const;
export type Route = (typeof ROUTES)[number];

export const ROUTE_LABELS: Record<Route, string> = {
  ORAL: 'Oral',
  SUBLINGUAL: 'Sublingual',
  BUCCAL: 'Bucal',
  INHALED: 'Inhalada',
  NASAL: 'Nasal',
  OPHTHALMIC: 'Oftálmica',
  OTIC: 'Ótica',
  TOPICAL: 'Tópica',
  SUBCUTANEOUS: 'Subcutánea',
  INTRAMUSCULAR: 'Intramuscular',
  RECTAL: 'Rectal',
  TRANSDERMAL: 'Transdérmica',
};

export interface MedicationOrder {
  id: string;
  studentId: string;
  medicationName: string;
  catalogId?: string | null;
  activeIngredient?: string | null;
  dose: number;
  doseUnit: string;
  route: Route;
  status: string;
  isPrn: boolean;
  startDate: Date | string;
  endDate: Date | string;
  maxDosesPerDay?: number | null;
  minIntervalMinutes?: number | null;
}

export interface AdministrationAttempt {
  scannedStudentId: string;
  medicationName: string;
  catalogId?: string | null;
  dose: number;
  doseUnit: string;
  route: Route;
  at: Date;
  scheduledFor?: Date | null;
}

export interface SafetyContext {
  allergies: { agent: string; severity: string }[];
  batchExpiry?: Date | string | null;
  dosesGivenToday: number;
  lastGivenAt?: Date | null;
  /** Minutes allowed before/after the scheduled time. */
  timeWindowMinutes?: number;
}

export type RightKey = 'patient' | 'medication' | 'dose' | 'route' | 'time';
export type SafetyStop = 'ALLERGY' | 'EXPIRED' | 'ORDER_INACTIVE' | 'OUT_OF_DATE_RANGE' | 'PRN_INTERVAL' | 'PRN_MAX_DAILY';

export interface FiveRightsResult {
  ok: boolean;
  rights: Record<RightKey, boolean>;
  stops: SafetyStop[];
  messages: string[];
}

export const normalizeDrug = (s: string | null | undefined) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** True when an allergy agent matches a drug name/ingredient (token containment). */
export function allergyMatches(agent: string, ...drugNames: (string | null | undefined)[]): boolean {
  const a = normalizeDrug(agent);
  if (a.length < 3) return false;
  return drugNames.some((d) => {
    const n = normalizeDrug(d);
    return n.length > 0 && (n.includes(a) || a.split(' ').every((tok) => tok.length > 2 && n.includes(tok)));
  });
}

const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export function verifyFiveRights(order: MedicationOrder, attempt: AdministrationAttempt, ctx: SafetyContext): FiveRightsResult {
  const messages: string[] = [];
  const stops: SafetyStop[] = [];
  const window = ctx.timeWindowMinutes ?? 30;

  const patient = order.studentId === attempt.scannedStudentId;
  if (!patient) messages.push('Paciente incorrecto: el estudiante verificado no corresponde a la orden.');

  const medication = order.catalogId && attempt.catalogId
    ? order.catalogId === attempt.catalogId
    : normalizeDrug(order.medicationName) === normalizeDrug(attempt.medicationName);
  if (!medication) messages.push('Medicamento incorrecto: no coincide con el autorizado.');

  const dose = Math.abs(order.dose - attempt.dose) < 1e-9 && normalizeDrug(order.doseUnit) === normalizeDrug(attempt.doseUnit);
  if (!dose) messages.push(`Dosis incorrecta: autorizada ${order.dose} ${order.doseUnit}.`);

  const route = order.route === attempt.route;
  if (!route) messages.push('Vía incorrecta.');

  let time = true;
  if (!order.isPrn) {
    if (!attempt.scheduledFor) {
      time = false;
      messages.push('Hora incorrecta: la dosis no está programada.');
    } else {
      const diff = Math.abs(attempt.at.getTime() - new Date(attempt.scheduledFor).getTime()) / 60000;
      time = diff <= window;
      if (!time) messages.push(`Hora incorrecta: fuera de la ventana de ±${window} min.`);
    }
  } else {
    if (order.minIntervalMinutes && ctx.lastGivenAt) {
      const since = (attempt.at.getTime() - ctx.lastGivenAt.getTime()) / 60000;
      if (since < order.minIntervalMinutes) {
        time = false;
        stops.push('PRN_INTERVAL');
        messages.push(`Intervalo mínimo no cumplido (${order.minIntervalMinutes} min).`);
      }
    }
    if (order.maxDosesPerDay && ctx.dosesGivenToday >= order.maxDosesPerDay) {
      time = false;
      stops.push('PRN_MAX_DAILY');
      messages.push(`Máximo de ${order.maxDosesPerDay} dosis diarias alcanzado.`);
    }
  }

  if (!['ACTIVE', 'APPROVED'].includes(order.status)) {
    stops.push('ORDER_INACTIVE');
    messages.push('La autorización de medicación no está activa.');
  }
  const today = dayStart(attempt.at).getTime();
  if (today < dayStart(new Date(order.startDate)).getTime() || today > dayStart(new Date(order.endDate)).getTime()) {
    stops.push('OUT_OF_DATE_RANGE');
    messages.push('Fuera del rango de fechas autorizado.');
  }
  const allergic = ctx.allergies.filter((a) => allergyMatches(a.agent, attempt.medicationName, order.activeIngredient, order.medicationName));
  if (allergic.length) {
    stops.push('ALLERGY');
    messages.push(`ALERGIA registrada: ${allergic.map((a) => a.agent).join(', ')}.`);
  }
  if (ctx.batchExpiry && dayStart(new Date(ctx.batchExpiry)).getTime() < today) {
    stops.push('EXPIRED');
    messages.push('Medicamento vencido: no administrar.');
  }

  const rights = { patient, medication, dose, route, time };
  return { ok: Object.values(rights).every(Boolean) && stops.length === 0, rights, stops, messages };
}

/**
 * Expands an order into the scheduled doses of a given day (local times 'HH:mm').
 */
export function dosesForDay(
  order: { frequency: string; times: string[]; daysOfWeek?: number[] | null; startDate: Date | string; endDate: Date | string; isPrn: boolean },
  day: Date,
): Date[] {
  if (order.isPrn || order.frequency === 'PRN') return [];
  const d0 = dayStart(day).getTime();
  if (d0 < dayStart(new Date(order.startDate)).getTime() || d0 > dayStart(new Date(order.endDate)).getTime()) return [];
  if (order.daysOfWeek?.length && !order.daysOfWeek.includes(day.getDay())) return [];
  if (order.frequency === 'ONCE' && d0 !== dayStart(new Date(order.startDate)).getTime()) return [];
  return order.times
    .filter((t) => /^\d{2}:\d{2}$/.test(t))
    .map((t) => {
      const [h, m] = t.split(':').map(Number);
      return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m, 0, 0);
    })
    .sort((a, b) => a.getTime() - b.getTime());
}
