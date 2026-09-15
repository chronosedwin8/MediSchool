import { describe, expect, it } from 'vitest';
import { PASS_STATES, PASS_TRANSITIONS, TERMINAL_PASS_STATES, boardColumn, canTransition, nextStates, passStageMinutes, type PassState } from './pass-machine';

describe('pass state machine', () => {
  const allowed = new Set<string>();
  for (const from of PASS_STATES) for (const r of PASS_TRANSITIONS[from]) allowed.add(`${from}>${r.to}`);

  it('accepts every declared transition for at least one of its actors', () => {
    for (const from of PASS_STATES) {
      for (const rule of PASS_TRANSITIONS[from]) {
        const res = canTransition(from, rule.to, [rule.actors[0]]);
        expect(res.ok, `${from} → ${rule.to}`).toBe(true);
      }
    }
  });

  it('rejects every undeclared transition (exhaustive matrix)', () => {
    for (const from of PASS_STATES) {
      for (const to of PASS_STATES) {
        if (allowed.has(`${from}>${to}`)) continue;
        const res = canTransition(from, to, ['NURSE', 'TEACHER', 'GATE', 'SYSTEM', 'DOCTOR']);
        expect(res.ok, `${from} → ${to}`).toBe(false);
      }
    }
  });

  it('blocks terminal states', () => {
    for (const s of TERMINAL_PASS_STATES) {
      const res = canTransition(s, 'IN_CARE', ['NURSE']);
      expect(res).toMatchObject({ ok: false, code: 'TERMINAL_STATE' });
    }
  });

  it('enforces actor roles', () => {
    expect(canTransition('IN_TRANSIT', 'RECEIVED', ['TEACHER'])).toMatchObject({ ok: false, code: 'FORBIDDEN_ACTOR' });
    expect(canTransition('EXIT_AUTHORIZED', 'HANDED_OVER', ['GATE']).ok).toBe(true);
    expect(canTransition('EXIT_AUTHORIZED', 'HANDED_OVER', ['TEACHER']).ok).toBe(false);
    expect(canTransition('IN_CARE', 'WAITING_GUARDIAN', ['PARENT']).ok).toBe(false);
  });

  it('marks cancellations as requiring a reason', () => {
    expect(canTransition('REQUESTED', 'CANCELLED', ['TEACHER'])).toEqual({ ok: true, requiresReason: true });
    expect(canTransition('RECEIVED', 'IN_CARE', ['NURSE'])).toEqual({ ok: true, requiresReason: false });
  });

  it('lists next states per role', () => {
    expect(nextStates('REQUESTED', ['TEACHER']).sort()).toEqual(['CANCELLED', 'IN_TRANSIT']);
    expect(nextStates('IN_CARE', ['NURSE'])).toContain('WAITING_GUARDIAN');
  });

  it('maps states to board columns', () => {
    const cols: Partial<Record<PassState, string | null>> = {
      REQUESTED: 'INCOMING',
      RECEIVED: 'IN_ROOM',
      OBSERVATION: 'OBSERVATION',
      WAITING_GUARDIAN: 'WAITING_GUARDIAN',
      EXIT_AUTHORIZED: 'EXITING',
      CLOSED: null,
    };
    for (const [s, c] of Object.entries(cols)) expect(boardColumn(s as PassState)).toBe(c);
  });

  it('computes stage durations', () => {
    const t0 = new Date('2026-09-14T13:00:00Z');
    const m = (min: number) => new Date(t0.getTime() + min * 60000);
    const r = passStageMinutes({ REQUESTED: t0, RECEIVED: m(4), IN_CARE: m(6), WAITING_GUARDIAN: m(20), HANDED_OVER: m(55), CLOSED: m(56) });
    expect(r).toEqual({ transit: 4, waitForCare: 2, care: 14, guardianPickup: 35, total: 56 });
  });
});
