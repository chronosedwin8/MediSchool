'use client';

import { Badge, cn, Input, Skeleton, StudentAvatar } from '@sgee/ui';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export interface StudentRow {
  id: string;
  personId: string;
  code: string;
  name: string;
  age: number | null;
  sex: string | null;
  group: { id: string; name: string } | null;
  grade: { id: string; name: string } | null;
  section: { id: string; name: string; code: string } | null;
  photoUrl: string | null;
  hasPhoto: boolean;
  status: string;
  medicalAlert: boolean;
  alerts?: { anaphylaxis: boolean; allergies: string[]; criticalConditions: string[] };
  openPass: { id: string; state: string; label: string } | null;
}

export function useDebounced<T>(value: T, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function StudentPicker({ onSelect, autoFocus, placeholder = 'Nombre, código o documento…', className }: { onSelect: (s: StudentRow) => void; autoFocus?: boolean; placeholder?: string; className?: string }) {
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim());
  const { data, isFetching } = useQuery({
    queryKey: ['students', 'picker', dq],
    queryFn: () => api<{ items: StudentRow[] }>('/students', { query: { q: dq, limit: 12 } }),
    enabled: dq.length >= 2,
  });
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} className="pl-9" autoFocus={autoFocus} aria-label="Buscar estudiante" />
      </div>
      {dq.length >= 2 && (
        <ul className="flex max-h-80 flex-col gap-1 overflow-y-auto" role="listbox">
          {isFetching && !data && [0, 1, 2].map((i) => <Skeleton key={i} className="h-14" />)}
          {data?.items.length === 0 && <li className="px-2 py-3 text-sm text-muted">Sin resultados para “{dq}”.</li>}
          {data?.items.map((s) => (
            <li key={s.id}>
              <button type="button" onClick={() => onSelect(s)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-card-muted" role="option" aria-selected={false}>
                <StudentAvatar src={s.photoUrl} name={s.name} size={40} alert={s.alerts?.anaphylaxis} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{s.name}</span>
                  <span className="block text-xs text-muted">
                    {s.code} · {s.group?.name ?? 'Sin grupo'} {s.age !== null && `· ${s.age} años`}
                  </span>
                </span>
                {s.alerts?.anaphylaxis ? <Badge tone="solidDanger">Anafilaxia</Badge> : s.medicalAlert ? <Badge tone="danger">Alerta</Badge> : null}
                {s.openPass && <Badge tone="primary">{s.openPass.label}</Badge>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
