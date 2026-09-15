'use client';

import { Alert, Badge, Button, Card, CardContent, CardHeader, CardTitle, Select, Skeleton, StatCard, Toggle } from '@sgee/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, History, RefreshCw, Users } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';

interface Status {
  enabled: boolean;
  mock: boolean;
  photosEnabled: boolean;
  linkedStudents: number;
  activeStudents: number;
  studentsWithPhoto: number;
  historicalEncounters: number;
  openConflicts: number;
  runs: { id: string; kind: string; status: string; startedAt: string; finishedAt: string | null; inserted: number; updated: number; skipped: number; deactivated: number; errors: number; details: Record<string, unknown> }[];
}

const KIND: Record<string, string> = { FULL: 'Completa', INCREMENTAL: 'Incremental', ONE: 'Un estudiante', PHOTOS: 'Fotos', HISTORY: 'Historial de encuestas' };

export function IntegrationsPanel() {
  const qc = useQueryClient();
  const status = useQuery({ queryKey: ['phidias-status'], queryFn: () => api<Status>('/integrations/phidias/status'), refetchInterval: 15_000 });
  const conflicts = useQuery({ queryKey: ['phidias-conflicts'], queryFn: () => api<{ id: string; entity: string; externalId: string; kind: string; details: Record<string, unknown>; createdAt: string }[]>('/integrations/phidias/conflicts') });
  const ownership = useQuery({ queryKey: ['phidias-ownership'], queryFn: () => api<{ entity: string; field: string; owner: string }[]>('/integrations/phidias/field-ownership') });
  const sync = useMutation({
    mutationFn: (kind: string) => api<{ status?: string; inserted?: number; updated?: number; skipped?: number; deactivated?: number }>('/integrations/phidias/sync', { body: { kind, wait: true } }),
    onSuccess: (r, kind) => {
      toast.success(`Sincronización ${KIND[kind].toLowerCase()}: +${r.inserted ?? 0} nuevos, ${r.updated ?? 0} actualizados, ${r.skipped ?? 0} sin cambios, ${r.deactivated ?? 0} desactivados`);
      qc.invalidateQueries({ queryKey: ['phidias-status'] });
      qc.invalidateQueries({ queryKey: ['phidias-conflicts'] });
    },
  });
  const toggle = useMutation({ mutationFn: (enabled: boolean) => api('/integrations/phidias/settings', { method: 'PUT', body: { enabled } }), onSuccess: () => qc.invalidateQueries({ queryKey: ['phidias-status'] }) });
  const resolve = useMutation({ mutationFn: (v: { id: string; status: string }) => api(`/integrations/phidias/conflicts/${v.id}/resolve`, { body: { status: v.status } }), onSuccess: () => qc.invalidateQueries({ queryKey: ['phidias-conflicts'] }) });
  const setOwner = useMutation({ mutationFn: (row: { entity: string; field: string; owner: string }) => api('/integrations/phidias/field-ownership', { method: 'PUT', body: { rows: [row] } }), onSuccess: () => { toast.success('Propiedad del campo actualizada'); qc.invalidateQueries({ queryKey: ['phidias-ownership'] }); } });
  const s = status.data;
  if (!s) return <Skeleton className="h-96" />;
  return (
    <div className="flex flex-col gap-4">
      {s.mock && <Alert tone="warning">Modo simulado: se usan datos de prueba (sin token de Phidias configurado).</Alert>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Estudiantes vinculados" value={s.linkedStudents} icon={<Users />} tone="primary" />
        <StatCard label="Activos" value={s.activeStudents} />
        <StatCard label="Con foto (S3)" value={s.studentsWithPhoto} icon={<Camera />} hint={s.photosEnabled ? 'Bucket configurado' : 'S3 no configurado'} />
        <StatCard label="Atenciones históricas" value={s.historicalEncounters} icon={<History />} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Sincronización con Phidias</CardTitle>
          <div className="w-72">
            <Toggle label="Sincronización automática" checked={s.enabled} onChange={(v) => toggle.mutate(v)} />
          </div>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-sm text-muted">Idempotente: cada registro se identifica por su ID de Phidias y un hash de contenido; una segunda ejecución sin cambios no escribe nada. Nunca se sobrescriben datos clínicos locales.</p>
          <div className="flex flex-wrap gap-2">
            {(['INCREMENTAL', 'FULL', 'PHOTOS', 'HISTORY'] as const).map((k) => (
              <Button key={k} variant={k === 'FULL' ? 'primary' : 'outline'} onClick={() => sync.mutate(k)} loading={sync.isPending && sync.variables === k} disabled={sync.isPending}>
                <RefreshCw className="h-4 w-4" /> {KIND[k]}
              </Button>
            ))}
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-left text-xs text-muted">
                <tr>
                  <th className="py-1">Inicio</th>
                  <th>Tipo</th>
                  <th>Estado</th>
                  <th>Nuevos</th>
                  <th>Actualizados</th>
                  <th>Sin cambios</th>
                  <th>Desactivados</th>
                  <th>Errores</th>
                </tr>
              </thead>
              <tbody>
                {s.runs.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="tabular py-1.5">{fmtDateTime(r.startedAt)}</td>
                    <td>{KIND[r.kind] ?? r.kind}</td>
                    <td>
                      <Badge tone={r.status === 'SUCCESS' ? 'success' : r.status === 'FAILED' ? 'danger' : 'info'}>{r.status}</Badge>
                    </td>
                    <td className="tabular">{r.inserted}</td>
                    <td className="tabular">{r.updated}</td>
                    <td className="tabular">{r.skipped}</td>
                    <td className="tabular">{r.deactivated}</td>
                    <td className="tabular">{r.errors}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Conflictos por revisar ({conflicts.data?.length ?? 0})</CardTitle>
          </CardHeader>
          <CardContent>
            {conflicts.data?.length === 0 && <p className="text-sm text-muted">Sin conflictos abiertos.</p>}
            <ul className="flex max-h-96 flex-col gap-2 overflow-y-auto">
              {conflicts.data?.map((c) => (
                <li key={c.id} className="rounded-xl border border-border p-3 text-sm">
                  <div className="flex items-center gap-2">
                    <Badge tone="warning">{c.kind}</Badge>
                    <span className="text-muted">Phidias #{c.externalId}</span>
                  </div>
                  <pre className="mt-1 overflow-x-auto text-xs text-muted">{JSON.stringify(c.details)}</pre>
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => resolve.mutate({ id: c.id, status: 'RESOLVED' })}>
                      Resuelto
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => resolve.mutate({ id: c.id, status: 'IGNORED' })}>
                      Ignorar
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Propiedad de los campos</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-2 text-sm text-muted">PHIDIAS: siempre se actualiza desde Phidias · LOCAL: nunca se sobrescribe · MERGE: solo se completa si está vacío.</p>
            <table className="w-full text-sm">
              <tbody>
                {ownership.data?.map((o) => (
                  <tr key={`${o.entity}.${o.field}`} className="border-t border-border">
                    <td className="py-1.5 font-mono text-xs">
                      {o.entity}.{o.field}
                    </td>
                    <td className="w-36">
                      <Select value={o.owner} onChange={(e) => setOwner.mutate({ ...o, owner: e.target.value })} className="h-9 text-sm" disabled={o.field === '*'}>
                        <option>PHIDIAS</option>
                        <option>LOCAL</option>
                        <option>MERGE</option>
                      </Select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
