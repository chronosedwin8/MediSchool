import { describe, expect, it } from 'vitest';
import { allergyMatches, dosesForDay, verifyFiveRights, type MedicationOrder } from './five-rights';

const order: MedicationOrder = {
  id: 'o1',
  studentId: 's1',
  medicationName: 'Metilfenidato 10 mg',
  activeIngredient: 'Metilfenidato',
  dose: 10,
  doseUnit: 'mg',
  route: 'ORAL',
  status: 'ACTIVE',
  isPrn: false,
  startDate: '2026-09-01',
  endDate: '2026-12-01',
};
const at = new Date(2026, 8, 14, 10, 5);
const scheduled = new Date(2026, 8, 14, 10, 0);
const attempt = { scannedStudentId: 's1', medicationName: 'Metilfenidato 10 mg', dose: 10, doseUnit: 'mg', route: 'ORAL' as const, at, scheduledFor: scheduled };
const ctx = { allergies: [], dosesGivenToday: 0 };

describe('5 correctos', () => {
  it('passes when every right matches', () => {
    const r = verifyFiveRights(order, attempt, ctx);
    expect(r.ok).toBe(true);
    expect(r.stops).toEqual([]);
  });

  it.each([
    ['patient', { scannedStudentId: 's2' }],
    ['medication', { medicationName: 'Ibuprofeno' }],
    ['dose', { dose: 20 }],
    ['route', { route: 'SUBLINGUAL' as const }],
    ['time', { at: new Date(2026, 8, 14, 11, 0) }],
  ])('fails the %s right', (right, patch) => {
    const r = verifyFiveRights(order, { ...attempt, ...patch }, ctx);
    expect(r.ok).toBe(false);
    expect(r.rights[right as keyof typeof r.rights]).toBe(false);
  });

  it('hard-stops on allergy, expiry, inactive order and date range', () => {
    const r = verifyFiveRights(
      { ...order, status: 'SUSPENDED', endDate: '2026-09-10' },
      attempt,
      { allergies: [{ agent: 'metilfenidato', severity: 'SEVERE' }], dosesGivenToday: 0, batchExpiry: '2026-09-13' },
    );
    expect(r.ok).toBe(false);
    expect(r.stops.sort()).toEqual(['ALLERGY', 'EXPIRED', 'ORDER_INACTIVE', 'OUT_OF_DATE_RANGE']);
  });

  it('enforces PRN interval and daily max', () => {
    const prn = { ...order, isPrn: true, minIntervalMinutes: 240, maxDosesPerDay: 2 };
    const a = { ...attempt, scheduledFor: null };
    expect(verifyFiveRights(prn, a, { allergies: [], dosesGivenToday: 0 }).ok).toBe(true);
    expect(verifyFiveRights(prn, a, { allergies: [], dosesGivenToday: 1, lastGivenAt: new Date(2026, 8, 14, 9, 0) }).stops).toContain('PRN_INTERVAL');
    expect(verifyFiveRights(prn, a, { allergies: [], dosesGivenToday: 2 }).stops).toContain('PRN_MAX_DAILY');
  });

  it('matches allergies ignoring accents/case', () => {
    expect(allergyMatches('Acetaminofén', 'ACETAMINOFEN TB 500MG')).toBe(true);
    expect(allergyMatches('penicilina', 'Amoxicilina')).toBe(false);
    expect(allergyMatches('ib', 'ibuprofeno')).toBe(false);
  });

  it('expands daily schedule respecting days and range', () => {
    const o = { frequency: 'CUSTOM_DAYS', times: ['10:00', '07:30'], daysOfWeek: [1, 3, 5], startDate: '2026-09-01', endDate: '2026-09-30', isPrn: false };
    expect(dosesForDay(o, new Date(2026, 8, 14)).map((d) => d.getHours())).toEqual([7, 10]); // Monday
    expect(dosesForDay(o, new Date(2026, 8, 15))).toEqual([]); // Tuesday
    expect(dosesForDay(o, new Date(2026, 9, 5))).toEqual([]); // out of range
  });
});
