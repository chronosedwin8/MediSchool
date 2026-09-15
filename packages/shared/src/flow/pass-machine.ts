import type { Role } from '../roles';

/**
 * Nursing pass state machine (PLAN §5.4).
 *
 * REQUESTED → IN_TRANSIT → RECEIVED → IN_CARE ⇄ OBSERVATION
 *   → RETURNED_TO_CLASS → CLOSED
 *   → WAITING_GUARDIAN → EXIT_AUTHORIZED → HANDED_OVER → CLOSED
 *   → TRANSFERRED_IPS → CLOSED
 *   → CANCELLED / EXPIRED
 *
 * OBSERVATION is an explicit state (ADR-0006) so the live board can show the
 * "Observación" column and the re-evaluation timer from the pass itself.
 */
export const PASS_STATES = [
  'REQUESTED',
  'IN_TRANSIT',
  'RECEIVED',
  'IN_CARE',
  'OBSERVATION',
  'RETURNED_TO_CLASS',
  'WAITING_GUARDIAN',
  'EXIT_AUTHORIZED',
  'HANDED_OVER',
  'TRANSFERRED_IPS',
  'CLOSED',
  'CANCELLED',
  'EXPIRED',
] as const;
export type PassState = (typeof PASS_STATES)[number];

export const PASS_STATE_LABELS: Record<PassState, string> = {
  REQUESTED: 'Solicitado',
  IN_TRANSIT: 'En tránsito',
  RECEIVED: 'Recibido en enfermería',
  IN_CARE: 'En atención',
  OBSERVATION: 'En observación',
  RETURNED_TO_CLASS: 'Retorno al aula',
  WAITING_GUARDIAN: 'Esperando acudiente',
  EXIT_AUTHORIZED: 'Salida autorizada',
  HANDED_OVER: 'Entregado en portería',
  TRANSFERRED_IPS: 'Traslado a IPS',
  CLOSED: 'Cerrado',
  CANCELLED: 'Cancelado',
  EXPIRED: 'Vencido',
};

export const TERMINAL_PASS_STATES: PassState[] = ['CLOSED', 'CANCELLED', 'EXPIRED'];

export type PassActor = Role | 'SYSTEM';

interface TransitionRule {
  to: PassState;
  actors: PassActor[];
  /** A note is mandatory (cancellations, expirations). */
  requiresReason?: boolean;
}

const NURSING: PassActor[] = ['NURSE', 'DOCTOR', 'HEALTH_COORDINATOR'];

export const PASS_TRANSITIONS: Record<PassState, TransitionRule[]> = {
  REQUESTED: [
    { to: 'IN_TRANSIT', actors: ['TEACHER', ...NURSING, 'SYSTEM'] },
    { to: 'RECEIVED', actors: NURSING },
    { to: 'CANCELLED', actors: ['TEACHER', ...NURSING], requiresReason: true },
  ],
  IN_TRANSIT: [
    { to: 'RECEIVED', actors: NURSING },
    { to: 'CANCELLED', actors: ['TEACHER', ...NURSING], requiresReason: true },
    { to: 'EXPIRED', actors: ['SYSTEM', ...NURSING], requiresReason: true },
  ],
  RECEIVED: [
    { to: 'IN_CARE', actors: NURSING },
    { to: 'CANCELLED', actors: NURSING, requiresReason: true },
  ],
  IN_CARE: [
    { to: 'OBSERVATION', actors: NURSING },
    { to: 'RETURNED_TO_CLASS', actors: NURSING },
    { to: 'WAITING_GUARDIAN', actors: NURSING },
    { to: 'TRANSFERRED_IPS', actors: NURSING },
  ],
  OBSERVATION: [
    { to: 'IN_CARE', actors: NURSING },
    { to: 'RETURNED_TO_CLASS', actors: NURSING },
    { to: 'WAITING_GUARDIAN', actors: NURSING },
    { to: 'TRANSFERRED_IPS', actors: NURSING },
  ],
  RETURNED_TO_CLASS: [{ to: 'CLOSED', actors: ['TEACHER', ...NURSING, 'SYSTEM'] }],
  WAITING_GUARDIAN: [
    { to: 'EXIT_AUTHORIZED', actors: [...NURSING, 'SYSTEM'] },
    { to: 'IN_CARE', actors: NURSING },
    { to: 'TRANSFERRED_IPS', actors: NURSING },
  ],
  EXIT_AUTHORIZED: [
    { to: 'HANDED_OVER', actors: ['GATE', ...NURSING] },
    { to: 'WAITING_GUARDIAN', actors: NURSING, requiresReason: true },
  ],
  HANDED_OVER: [{ to: 'CLOSED', actors: ['SYSTEM', 'GATE', ...NURSING] }],
  TRANSFERRED_IPS: [{ to: 'CLOSED', actors: [...NURSING, 'SYSTEM'] }],
  CLOSED: [],
  CANCELLED: [],
  EXPIRED: [],
};

export type TransitionCheck =
  | { ok: true; requiresReason: boolean }
  | { ok: false; code: 'INVALID_TRANSITION' | 'FORBIDDEN_ACTOR' | 'TERMINAL_STATE'; message: string };

export function canTransition(from: PassState, to: PassState, actors: readonly PassActor[]): TransitionCheck {
  if (TERMINAL_PASS_STATES.includes(from)) {
    return { ok: false, code: 'TERMINAL_STATE', message: `El pase ya está ${PASS_STATE_LABELS[from].toLowerCase()}.` };
  }
  const rule = PASS_TRANSITIONS[from].find((r) => r.to === to);
  if (!rule) {
    return {
      ok: false,
      code: 'INVALID_TRANSITION',
      message: `No se puede pasar de "${PASS_STATE_LABELS[from]}" a "${PASS_STATE_LABELS[to]}".`,
    };
  }
  if (!rule.actors.some((a) => actors.includes(a))) {
    return { ok: false, code: 'FORBIDDEN_ACTOR', message: 'Su rol no puede realizar este cambio de estado.' };
  }
  return { ok: true, requiresReason: !!rule.requiresReason };
}

export function nextStates(from: PassState, actors: readonly PassActor[]): PassState[] {
  return PASS_TRANSITIONS[from].filter((r) => r.actors.some((a) => actors.includes(a))).map((r) => r.to);
}

/** Kanban column on the nursing live board for an open pass. */
export type BoardColumn = 'INCOMING' | 'IN_ROOM' | 'OBSERVATION' | 'WAITING_GUARDIAN' | 'EXITING';
export function boardColumn(state: PassState): BoardColumn | null {
  switch (state) {
    case 'REQUESTED':
    case 'IN_TRANSIT':
      return 'INCOMING';
    case 'RECEIVED':
    case 'IN_CARE':
      return 'IN_ROOM';
    case 'OBSERVATION':
      return 'OBSERVATION';
    case 'WAITING_GUARDIAN':
      return 'WAITING_GUARDIAN';
    case 'EXIT_AUTHORIZED':
      return 'EXITING';
    default:
      return null;
  }
}

export const PASS_URGENCIES = ['LOW', 'MEDIUM', 'HIGH', 'EMERGENCY'] as const;
export type PassUrgency = (typeof PASS_URGENCIES)[number];
export const PASS_URGENCY_LABELS: Record<PassUrgency, string> = {
  LOW: 'Baja',
  MEDIUM: 'Media',
  HIGH: 'Alta',
  EMERGENCY: 'Emergencia',
};

/**
 * Stage durations in minutes computed from the timestamps of each state
 * (PLAN §5.9 "Tiempos"). Missing stages return null.
 */
export function passStageMinutes(t: Partial<Record<PassState, Date | string | null>>) {
  const ms = (a?: Date | string | null, b?: Date | string | null) =>
    a && b ? Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000)) : null;
  const end = t.CLOSED ?? t.HANDED_OVER ?? t.TRANSFERRED_IPS ?? t.RETURNED_TO_CLASS ?? null;
  return {
    transit: ms(t.REQUESTED, t.RECEIVED),
    waitForCare: ms(t.RECEIVED, t.IN_CARE),
    care: ms(t.IN_CARE, t.RETURNED_TO_CLASS ?? t.WAITING_GUARDIAN ?? t.TRANSFERRED_IPS),
    guardianPickup: ms(t.WAITING_GUARDIAN, t.HANDED_OVER),
    total: ms(t.REQUESTED, end),
  };
}
