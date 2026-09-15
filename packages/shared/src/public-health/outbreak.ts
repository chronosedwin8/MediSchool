/**
 * Outbreak signal detection (PLAN §5.8). A signal is raised for a group/grade
 * when, inside a sliding window, the number of distinct students with the same
 * syndrome reaches a minimum AND the attack rate crosses a threshold.
 */

export interface CaseRecord {
  studentId: string;
  groupId: string | null;
  gradeId: string | null;
  syndrome: string;
  date: Date | string;
}

export interface OutbreakRules {
  windowDays: number;
  minCases: number;
  attackRatePct: number;
}

export const DEFAULT_OUTBREAK_RULES: OutbreakRules = { windowDays: 7, minCases: 3, attackRatePct: 10 };

export interface OutbreakSignal {
  scope: 'GROUP' | 'GRADE';
  scopeId: string;
  syndrome: string;
  cases: number;
  population: number;
  attackRatePct: number;
  firstCaseAt: string;
  lastCaseAt: string;
  studentIds: string[];
}

/** Maps a free-text motive / ICD-10 code to a surveillance syndrome. */
export function syndromeOf(motive: string | null | undefined, icd10?: string | null): string | null {
  const code = (icd10 ?? '').toUpperCase();
  if (/^(A0[0-9]|K52|R11)/.test(code)) return 'GASTROINTESTINAL';
  if (/^(J0|J1|J20|J21|U07|R05)/.test(code)) return 'RESPIRATORIO';
  if (/^(B01|B05|B06|B08|B09|R21)/.test(code)) return 'EXANTEMATICO';
  if (/^H10/.test(code)) return 'CONJUNTIVITIS';
  if (/^B85/.test(code)) return 'PEDICULOSIS';
  if (/^R50/.test(code)) return 'FEBRIL';
  const m = (motive ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  if (!m) return null;
  if (/(vomito|nausea|diarrea|estomac|gastro)/.test(m)) return 'GASTROINTESTINAL';
  if (/(gripa|tos|garganta|congestion|resfri|influenza|covid)/.test(m)) return 'RESPIRATORIO';
  if (/(varicela|sarampion|exantema|brote en la piel|mano pie boca|erupcion)/.test(m)) return 'EXANTEMATICO';
  if (/(conjuntivitis|ojo rojo|ojos irritados)/.test(m)) return 'CONJUNTIVITIS';
  if (/(piojo|pediculosis)/.test(m)) return 'PEDICULOSIS';
  if (/fiebre/.test(m)) return 'FEBRIL';
  return null;
}

export function detectOutbreaks(
  cases: CaseRecord[],
  population: { groups: Record<string, number>; grades: Record<string, number> },
  now: Date,
  rules: OutbreakRules = DEFAULT_OUTBREAK_RULES,
): OutbreakSignal[] {
  const from = now.getTime() - rules.windowDays * 86400000;
  const recent = cases.filter((c) => {
    const t = new Date(c.date).getTime();
    return t >= from && t <= now.getTime();
  });
  const signals: OutbreakSignal[] = [];
  const scan = (scope: 'GROUP' | 'GRADE', key: (c: CaseRecord) => string | null, pop: Record<string, number>) => {
    const buckets = new Map<string, CaseRecord[]>();
    for (const c of recent) {
      const id = key(c);
      if (!id) continue;
      const k = `${id}|${c.syndrome}`;
      buckets.set(k, [...(buckets.get(k) ?? []), c]);
    }
    for (const [k, list] of buckets) {
      const [scopeId, syndrome] = k.split('|');
      const students = [...new Set(list.map((c) => c.studentId))];
      const size = pop[scopeId] ?? 0;
      const rate = size > 0 ? (students.length / size) * 100 : 0;
      if (students.length >= rules.minCases && rate >= rules.attackRatePct) {
        const dates = list.map((c) => new Date(c.date).toISOString()).sort();
        signals.push({
          scope,
          scopeId,
          syndrome,
          cases: students.length,
          population: size,
          attackRatePct: Math.round(rate * 10) / 10,
          firstCaseAt: dates[0],
          lastCaseAt: dates[dates.length - 1],
          studentIds: students,
        });
      }
    }
  };
  scan('GROUP', (c) => c.groupId, population.groups);
  scan('GRADE', (c) => c.gradeId, population.grades);
  return signals.sort((a, b) => b.attackRatePct - a.attackRatePct);
}

/**
 * Pattern detection for "frequent visitor in the same class period" (PLAN §5.4):
 * returns subjects where a student asked for passes ≥ minCount times and that
 * subject accounts for ≥ sharePct of the student's passes.
 */
export function subjectPatterns(passes: { studentId: string; subject: string | null }[], minCount = 3, sharePct = 50) {
  const byStudent = new Map<string, Map<string, number>>();
  for (const p of passes) {
    if (!p.subject) continue;
    const m = byStudent.get(p.studentId) ?? new Map<string, number>();
    m.set(p.subject, (m.get(p.subject) ?? 0) + 1);
    byStudent.set(p.studentId, m);
  }
  const out: { studentId: string; subject: string; count: number; sharePct: number }[] = [];
  for (const [studentId, m] of byStudent) {
    const total = [...m.values()].reduce((a, b) => a + b, 0);
    for (const [subject, count] of m) {
      const share = (count / total) * 100;
      if (count >= minCount && share >= sharePct) out.push({ studentId, subject, count, sharePct: Math.round(share) });
    }
  }
  return out.sort((a, b) => b.count - a.count);
}
