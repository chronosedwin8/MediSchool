'use client';

import { Badge, Button, Card, EmptyState, Input, PageHeader, Select, Skeleton, StudentAvatar } from '@sgee/ui';
import { useInfiniteQuery } from '@tanstack/react-query';
import { HeartPulse, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { useDebounced } from '@/components/student-picker';
import { api } from '@/lib/api';
import { addDaysIso, fmtDateTime, todayIso } from '@/lib/format';
import { can, useMe } from '@/lib/session';

interface Row {
  id: string;
  status: string;
  typeLabel: string;
  chiefComplaint: string;
  startedAt: string;
  dispositionLabel: string | null;
  subjectType: string;
  name: string;
  student: { photoUrl: string | null; group: { name: string } | null; code: string } | null;
  diagnosis: string | null;
  accident: { place: string; severity: string } | null;
  historical: boolean;
  attendedBy: string | null;
}

const STATUS_TONE: Record<string, 'primary' | 'violet' | 'success' | 'danger'> = { OPEN: 'primary', OBSERVATION: 'violet', CLOSED: 'success', ANNULLED: 'danger' };
const STATUS_LABEL: Record<string, string> = { OPEN: 'Abierta', OBSERVATION: 'Observación', CLOSED: 'Cerrada', ANNULLED: 'Anulada' };

export default function EncountersListPage() {
  const { data: me } = useMe();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState(addDaysIso(todayIso(), -7));
  const [to, setTo] = useState(todayIso());
  const dq = useDebounced(q.trim());
  const list = useInfiniteQuery({
    queryKey: ['encounters', dq, status, from, to],
    queryFn: ({ pageParam }) => api<{ items: Row[]; nextCursor: string | null }>('/encounters', { query: { q: dq, status, from, to, limit: 50, cursor: pageParam } }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (l) => l.nextCursor ?? undefined,
  });
  const verify = async () => {
    const r = await api<{ encounters: { total: number; broken: unknown[] }; administrations: { total: number; broken: unknown[] } }>('/encounters/verify-chain');
    if (!r.encounters.broken.length && !r.administrations.broken.length) toast.success(`Integridad verificada: ${r.encounters.total} atenciones y ${r.administrations.total} administraciones sin alteraciones.`);
    else toast.error(`Se detectaron ${r.encounters.broken.length + r.administrations.broken.length} registros con cadena rota.`);
  };
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <div>
      <PageHeader
        title="Atenciones"
        description="Historia clínica escolar: registros firmados, inmutables y encadenados."
        actions={
          can(me, 'audit:read', 'encounters:annul') && (
            <Button variant="outline" onClick={verify}>
              <ShieldCheck className="h-4 w-4" /> Verificar integridad
            </Button>
          )
        }
      />
      <Card className="mb-4 grid gap-3 p-4 md:grid-cols-[1fr_160px_160px_180px]">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por paciente o motivo" aria-label="Buscar" />
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Desde" />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Hasta" />
        <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Estado">
          <option value="">Todos los estados</option>
          {Object.entries(STATUS_LABEL).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </Select>
      </Card>
      {list.isLoading && <Skeleton className="h-96" />}
      {!list.isLoading && items.length === 0 && <EmptyState icon={<HeartPulse />} title="Sin atenciones en el período" />}
      <ul className="flex flex-col gap-2">
        {items.map((e) => (
          <li key={e.id}>
            <Link href={`/enfermeria/atenciones/${e.id}`} className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-3 hover:border-primary-400">
              <StudentAvatar src={e.student?.photoUrl} name={e.name} size={44} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {e.name} <span className="text-sm font-normal text-muted">{e.subjectType === 'STAFF' ? '· Personal' : `· ${e.student?.group?.name ?? ''}`}</span>
                </p>
                <p className="truncate text-sm text-muted">
                  {e.chiefComplaint} {e.diagnosis && `· ${e.diagnosis}`}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {e.accident && <Badge tone="warning">Accidente · {e.accident.place}</Badge>}
                {e.historical && <Badge tone="neutral">Phidias</Badge>}
                {e.dispositionLabel && <Badge tone="info">{e.dispositionLabel}</Badge>}
                <Badge tone={STATUS_TONE[e.status]}>{STATUS_LABEL[e.status]}</Badge>
              </div>
              <span className="tabular w-full text-xs text-muted sm:w-auto">{fmtDateTime(e.startedAt)}</span>
            </Link>
          </li>
        ))}
      </ul>
      {list.hasNextPage && (
        <div className="mt-4 flex justify-center">
          <Button variant="outline" onClick={() => list.fetchNextPage()} loading={list.isFetchingNextPage}>
            Cargar más
          </Button>
        </div>
      )}
    </div>
  );
}
