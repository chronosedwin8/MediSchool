'use client';

import { Badge, cn, StudentAvatar } from '@sgee/ui';
import { Clock, ShieldAlert } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { minutesSince } from '@/lib/format';

export interface BoardCard {
  id: string;
  code: string;
  state: string;
  stateLabel: string;
  urgency: string;
  reason: string;
  subject: string | null;
  accompanied: boolean;
  requestedAt: string;
  elapsedMinutes: number;
  student: { id: string; name: string; code: string; photoUrl: string | null; group: { name: string } | null; age: number | null };
  nextStates: string[];
  column: string | null;
  alerts?: { anaphylaxis: boolean; allergies: string[]; criticalConditions: string[] };
  encounterId?: string | null;
  observationDueAt?: string | null;
  exit?: { id: string; status: string; pickupName: string | null; standing: boolean } | null;
  slaBreaches?: { type: string }[];
}

export const URGENCY_TONE: Record<string, 'neutral' | 'info' | 'warning' | 'danger' | 'solidDanger'> = { LOW: 'neutral', MEDIUM: 'info', HIGH: 'warning', EMERGENCY: 'solidDanger' };
export const URGENCY_LABEL: Record<string, string> = { LOW: 'Baja', MEDIUM: 'Media', HIGH: 'Alta', EMERGENCY: 'Emergencia' };

/** Re-renders every 30 s so elapsed timers stay current. */
export function useTicker(ms = 30_000) {
  const [, set] = useState(0);
  useEffect(() => {
    const t = setInterval(() => set((n) => n + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
}

export function Elapsed({ since, warnAfter = 10, dangerAfter = 20 }: { since: string; warnAfter?: number; dangerAfter?: number }) {
  useTicker();
  const m = minutesSince(since);
  return (
    <span className={cn('tabular inline-flex items-center gap-1 text-xs font-medium', m >= dangerAfter ? 'text-red-600' : m >= warnAfter ? 'text-amber-600' : 'text-muted')}>
      <Clock className="h-3.5 w-3.5" aria-hidden /> {m} min
    </span>
  );
}

export function PassCard({ card, actions, onOpen, transitAlert = 10 }: { card: BoardCard; actions?: ReactNode; onOpen?: () => void; transitAlert?: number }) {
  const breached = card.slaBreaches?.some((b) => b.type === 'TRANSIT');
  return (
    <article
      className={cn(
        'rounded-xl border bg-card p-3 shadow-sm transition-shadow hover:shadow-md',
        card.alerts?.anaphylaxis ? 'border-red-400 dark:border-red-700' : 'border-border',
        card.urgency === 'EMERGENCY' && 'ring-2 ring-red-500',
      )}
      aria-label={`${card.student.name}, ${card.stateLabel}`}
    >
      <button type="button" onClick={onOpen} className="flex w-full items-start gap-3 text-left">
        <StudentAvatar src={card.student.photoUrl} name={card.student.name} size={44} alert={card.alerts?.anaphylaxis} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate font-semibold">{card.student.name}</span>
          </span>
          <span className="block text-xs text-muted">
            {card.student.group?.name ?? '—'} · {card.subject ?? 'Sin asignatura'}
          </span>
          <span className="mt-1 block truncate text-sm">{card.reason}</span>
        </span>
        <span className="flex flex-col items-end gap-1">
          <Badge tone={URGENCY_TONE[card.urgency]}>{URGENCY_LABEL[card.urgency]}</Badge>
          <Elapsed since={card.requestedAt} warnAfter={transitAlert} dangerAfter={transitAlert * 2} />
        </span>
      </button>
      {(card.alerts?.anaphylaxis || card.alerts?.criticalConditions.length || breached || card.observationDueAt || card.exit) && (
        <div className="mt-2 flex flex-wrap gap-1">
          {card.alerts?.anaphylaxis && (
            <Badge tone="solidDanger">
              <ShieldAlert className="h-3 w-3" /> {card.alerts.allergies.join(', ')}
            </Badge>
          )}
          {card.alerts?.criticalConditions.map((c) => (
            <Badge key={c} tone="violet">
              {c}
            </Badge>
          ))}
          {breached && <Badge tone="danger">No llegó a tiempo</Badge>}
          {card.observationDueAt && <ObservationBadge dueAt={card.observationDueAt} />}
          {card.exit && <Badge tone={card.exit.status === 'CONFIRMED' ? 'success' : 'warning'}>{card.exit.status === 'CONFIRMED' ? `Recoge: ${card.exit.pickupName}` : 'Esperando confirmación del acudiente'}</Badge>}
        </div>
      )}
      {actions && <div className="mt-2 flex flex-wrap gap-1.5">{actions}</div>}
    </article>
  );
}

export function ObservationBadge({ dueAt }: { dueAt: string }) {
  useTicker(15_000);
  const left = Math.round((new Date(dueAt).getTime() - Date.now()) / 60000);
  return <Badge tone={left <= 0 ? 'solidDanger' : left <= 5 ? 'warning' : 'violet'}>{left <= 0 ? `Reevaluar (${-left} min tarde)` : `Reevaluar en ${left} min`}</Badge>;
}
