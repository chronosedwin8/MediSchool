'use client';

import { Badge, Button, Card, Input, Skeleton } from '@sgee/ui';
import { useInfiniteQuery, useMutation } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useDebounced } from '@/components/student-picker';
import { api } from '@/lib/api';
import { addDaysIso, fmtDateTime, todayIso } from '@/lib/format';

interface Row {
  id: string;
  createdAt: string;
  action: string;
  entity: string;
  entityId: string | null;
  actor: string;
  ip: string | null;
  after: unknown;
  hash: string | null;
}

export function AuditPanel() {
  const [action, setAction] = useState('');
  const [entity, setEntity] = useState('');
  const [from, setFrom] = useState(addDaysIso(todayIso(), -7));
  const [to, setTo] = useState(todayIso());
  const da = useDebounced(action);
  const de = useDebounced(entity);
  const q = useInfiniteQuery({
    queryKey: ['audit', da, de, from, to],
    queryFn: ({ pageParam }) => api<{ items: Row[]; nextCursor: string | null }>('/admin/audit', { query: { action: da, entity: de, from, to, limit: 100, cursor: pageParam } }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (l) => l.nextCursor ?? undefined,
  });
  const verify = useMutation({
    mutationFn: () => api<{ total: number; tampered: number; brokenLinks: number; forks: number; ok: boolean }>('/admin/audit/verify'),
    onSuccess: (r) => (r.ok ? toast.success(`Cadena de auditoría íntegra: ${r.total} eventos verificados`) : toast.error(`Alteraciones detectadas: ${r.tampered} modificados, ${r.brokenLinks} enlaces rotos`)),
  });
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <div>
      <Card className="mb-3 flex flex-wrap items-center gap-2 p-3">
        <Input value={action} onChange={(e) => setAction(e.target.value)} placeholder="Acción (ej. clinical.)" className="w-52" aria-label="Acción" />
        <Input value={entity} onChange={(e) => setEntity(e.target.value)} placeholder="Entidad" className="w-40" aria-label="Entidad" />
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" aria-label="Desde" />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" aria-label="Hasta" />
        <Button variant="outline" className="ml-auto" onClick={() => verify.mutate()} loading={verify.isPending}>
          <ShieldCheck className="h-4 w-4" /> Verificar cadena de hash
        </Button>
      </Card>
      {q.isLoading && <Skeleton className="h-96" />}
      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-card-muted text-left text-xs text-muted">
            <tr>
              <th className="px-3 py-2">Fecha</th>
              <th>Actor</th>
              <th>Acción</th>
              <th>Entidad</th>
              <th>IP</th>
              <th>Detalle (redactado)</th>
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.id} className="border-t border-border align-top">
                <td className="tabular px-3 py-2 whitespace-nowrap">{fmtDateTime(r.createdAt)}</td>
                <td className="max-w-56 truncate">{r.actor}</td>
                <td>
                  <Badge tone={r.action.includes('failed') || r.action.includes('anomaly') ? 'danger' : r.action.startsWith('clinical') ? 'violet' : 'neutral'}>{r.action}</Badge>
                </td>
                <td className="text-xs">
                  {r.entity}
                  <br />
                  <span className="font-mono text-muted">{r.entityId?.slice(0, 8)}</span>
                </td>
                <td className="text-xs text-muted">{r.ip}</td>
                <td className="max-w-80">
                  <code className="line-clamp-2 break-all text-xs text-muted">{r.after ? JSON.stringify(r.after) : ''}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {q.hasNextPage && (
        <div className="mt-3 flex justify-center">
          <Button variant="outline" onClick={() => q.fetchNextPage()} loading={q.isFetchingNextPage}>
            Cargar más
          </Button>
        </div>
      )}
    </div>
  );
}
