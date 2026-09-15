const TZ = 'America/Bogota';

export function fmtDate(d: string | Date | null | undefined, opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' }) {
  if (!d) return '—';
  return new Intl.DateTimeFormat('es-CO', { timeZone: TZ, ...opts }).format(new Date(d));
}

export function fmtTime(d: string | Date | null | undefined) {
  if (!d) return '—';
  return new Intl.DateTimeFormat('es-CO', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(d));
}

export function fmtDateTime(d: string | Date | null | undefined) {
  if (!d) return '—';
  return `${fmtDate(d)} ${fmtTime(d)}`;
}

export function todayIso() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export function addDaysIso(date: string, days: number) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function minutesSince(d: string | Date | null | undefined) {
  if (!d) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 60000));
}

export function relative(d: string | Date | null | undefined) {
  if (!d) return '—';
  const m = minutesSince(d);
  if (m < 1) return 'ahora';
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  return fmtDate(d);
}

export function fmtNumber(n: number | null | undefined, digits = 0) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return new Intl.NumberFormat('es-CO', { maximumFractionDigits: digits }).format(n);
}

export function fmtMoney(n: number | null | undefined) {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);
}

export const RELATIONSHIP_LABELS: Record<string, string> = {
  MOTHER: 'Madre',
  FATHER: 'Padre',
  GRANDPARENT: 'Abuelo(a)',
  SIBLING: 'Hermano(a)',
  UNCLE_AUNT: 'Tío(a)',
  LEGAL_GUARDIAN: 'Tutor legal',
  OTHER: 'Otro',
};
