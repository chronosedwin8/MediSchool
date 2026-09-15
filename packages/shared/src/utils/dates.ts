/** Timezone helpers. All timestamps are stored in UTC; business days follow the tenant timezone. */

export function dateInTz(d: Date, timeZone = 'America/Bogota'): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

export function timeInTz(d: Date, timeZone = 'America/Bogota'): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
}

/** Offset in minutes of a timezone at a given instant (e.g. Bogotá → -300). */
export function tzOffsetMinutes(d: Date, timeZone = 'America/Bogota'): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return Math.round((asUtc - d.getTime()) / 60000);
}

/** UTC instant for a local date (YYYY-MM-DD) and time (HH:mm) in a timezone. */
export function zonedToUtc(date: string, time = '00:00', timeZone = 'America/Bogota'): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, hh, mm));
  const offset = tzOffsetMinutes(guess, timeZone);
  return new Date(guess.getTime() - offset * 60000);
}

export function dayBounds(date: string, timeZone = 'America/Bogota'): { start: Date; end: Date } {
  const start = zonedToUtc(date, '00:00', timeZone);
  return { start, end: new Date(start.getTime() + 86400000) };
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

export function isWithinQuietHours(now: Date, start: string, end: string, timeZone = 'America/Bogota'): boolean {
  const t = timeInTz(now, timeZone);
  return start <= end ? t >= start && t < end : t >= start || t < end;
}

export function minutesBetween(a: Date | string, b: Date | string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000);
}
