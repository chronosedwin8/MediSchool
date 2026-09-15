import { describe, expect, it } from 'vitest';
import { detectOutbreaks, subjectPatterns, syndromeOf } from './outbreak';
import { dayBounds, isWithinQuietHours, zonedToUtc } from '../utils/dates';
import { plainText, shortCode } from '../utils/text';
import { searchIcd10 } from '../catalogs/icd10';

describe('outbreak detection', () => {
  const now = new Date('2026-09-14T15:00:00Z');
  const c = (studentId: string, groupId: string, days: number, syndrome = 'GASTROINTESTINAL') => ({
    studentId,
    groupId,
    gradeId: 'g8',
    syndrome,
    date: new Date(now.getTime() - days * 86400000),
  });

  it('raises a group signal over threshold', () => {
    const cases = [c('a', 'K8B', 1), c('b', 'K8B', 2), c('c', 'K8B', 3), c('a', 'K8B', 3)];
    const s = detectOutbreaks(cases, { groups: { K8B: 21 }, grades: { g8: 88 } }, now);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ scope: 'GROUP', scopeId: 'K8B', cases: 3, attackRatePct: 14.3 });
  });

  it('ignores old cases and low attack rates', () => {
    const cases = [c('a', 'K8B', 1), c('b', 'K8B', 2), c('c', 'K8B', 9)];
    expect(detectOutbreaks(cases, { groups: { K8B: 21 }, grades: { g8: 88 } }, now)).toEqual([]);
    const many = ['a', 'b', 'c'].map((s) => c(s, 'BIG', 1));
    expect(detectOutbreaks(many, { groups: { BIG: 100 }, grades: { g8: 400 } }, now)).toEqual([]);
  });

  it('maps motives and codes to syndromes', () => {
    expect(syndromeOf('Nauseas/vómito')).toBe('GASTROINTESTINAL');
    expect(syndromeOf('Dolor/ ardor de garganta')).toBe('RESPIRATORIO');
    expect(syndromeOf(null, 'B01.9')).toBe('EXANTEMATICO');
    expect(syndromeOf('Golpe leve')).toBeNull();
  });

  it('detects subject patterns', () => {
    const passes = [
      ...Array(4).fill({ studentId: 's1', subject: 'Matemáticas' }),
      { studentId: 's1', subject: 'Arte' },
      { studentId: 's2', subject: 'Arte' },
    ];
    expect(subjectPatterns(passes)).toEqual([{ studentId: 's1', subject: 'Matemáticas', count: 4, sharePct: 80 }]);
  });
});

describe('utils', () => {
  it('handles Bogotá day bounds', () => {
    expect(zonedToUtc('2026-09-14', '07:00').toISOString()).toBe('2026-09-14T12:00:00.000Z');
    const b = dayBounds('2026-09-14');
    expect(b.start.toISOString()).toBe('2026-09-14T05:00:00.000Z');
    expect(b.end.toISOString()).toBe('2026-09-15T05:00:00.000Z');
  });

  it('computes quiet hours across midnight', () => {
    expect(isWithinQuietHours(new Date('2026-09-15T02:00:00Z'), '20:00', '06:00')).toBe(true); // 21:00 Bogotá
    expect(isWithinQuietHours(new Date('2026-09-14T15:00:00Z'), '20:00', '06:00')).toBe(false); // 10:00
  });

  it('cleans Phidias HTML', () => {
    expect(plainText('<p>acetaminof&eacute;n&nbsp;500</p>')).toBe('acetaminofén 500');
  });

  it('generates short codes without ambiguous chars', () => {
    const code = shortCode();
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
  });

  it('searches ICD-10 ignoring accents', () => {
    expect(searchIcd10('cefalea').map((r) => r.code)).toContain('R51');
    expect(searchIcd10('J45')[0].code).toBe('J45.9');
    expect(searchIcd10('nausea')[0].code).toBe('R11');
  });
});
