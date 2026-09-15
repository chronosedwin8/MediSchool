'use client';

import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Skeleton, StatCard } from '@sgee/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Database, HardDrive, Play, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { fmtDateTime, relative } from '@/lib/format';

interface System {
  version: string;
  node: string;
  uptimeSeconds: number;
  database: { size: string; version: string };
  jobs: Record<string, number>;
  failedJobs: { name: string; last_error: string | null; finished_at: string | null }[];
  notificationsQueued: number;
  integrations: { phidias: { mock: boolean }; photos: { enabled: boolean; bucket: string | null }; storage: { driver: string }; smtp: boolean; whatsapp: boolean; sms: boolean; push: boolean; clamav: boolean };
  backups: { enabled: boolean; latest: { name: string; size: number; createdAt: string }[] };
  jobsEnabled: boolean;
}

const JOBS = ['flow.sla', 'meds.schedule', 'meds.omissions', 'inventory.alerts', 'publichealth.outbreaks', 'publichealth.frequent', 'compliance.retention', 'compliance.access_anomalies', 'reporting.refresh', 'audit.partitions', 'system.backup'];

export function SystemPanel() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['system'], queryFn: () => api<System>('/admin/system'), refetchInterval: 30_000 });
  const jobs = useQuery({ queryKey: ['jobs'], queryFn: () => api<{ id: string; name: string; status: string; attempts: number; runAt: string; finishedAt: string | null; lastError: string | null }[]>('/admin/jobs') });
  const run = useMutation({ mutationFn: (name: string) => api<{ result: unknown }>(`/admin/jobs/${name}/run`, { method: 'POST' }), onSuccess: (r, name) => { toast.success(`${name}: ${JSON.stringify(r.result)}`); qc.invalidateQueries({ queryKey: ['system'] }); qc.invalidateQueries({ queryKey: ['jobs'] }); } });
  const verify = useMutation({ mutationFn: () => api<{ ok: boolean; file?: string; reason?: string }>('/admin/backups/verify'), onSuccess: (r) => (r.ok ? toast.success(`Respaldo ${r.file} verificado: descifra y es un volcado válido`) : toast.error(r.reason ?? 'Verificación fallida')) });
  const s = q.data;
  if (!s) return <Skeleton className="h-96" />;
  const flag = (ok: boolean, label: string) => <Badge tone={ok ? 'success' : 'neutral'}>{label}: {ok ? 'sí' : 'no'}</Badge>;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Base de datos" value={s.database.size} hint={s.database.version} icon={<Database />} />
        <StatCard label="Tiempo activo" value={`${Math.round(s.uptimeSeconds / 60)} min`} hint={`Node ${s.node}`} />
        <StatCard label="Notificaciones en cola" value={s.notificationsQueued} />
        <StatCard label="Tareas fallidas (24 h)" value={s.jobs.FAILED ?? 0} tone={(s.jobs.FAILED ?? 0) > 0 ? 'danger' : 'success'} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Integraciones</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {flag(!s.integrations.phidias.mock, 'Phidias real')}
          {flag(s.integrations.photos.enabled, `Fotos S3${s.integrations.photos.bucket ? ` (${s.integrations.photos.bucket})` : ''}`)}
          <Badge tone="info">Archivos: {s.integrations.storage.driver} cifrado</Badge>
          {flag(s.integrations.smtp, 'SMTP')}
          {flag(s.integrations.whatsapp, 'WhatsApp')}
          {flag(s.integrations.sms, 'SMS')}
          {flag(s.integrations.push, 'Push')}
          {flag(s.integrations.clamav, 'Antivirus')}
          {flag(s.jobsEnabled, 'Planificador')}
        </CardContent>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Tareas programadas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-3 flex flex-wrap gap-1.5">
              {JOBS.map((j) => (
                <Button key={j} size="sm" variant="outline" onClick={() => run.mutate(j)} loading={run.isPending && run.variables === j}>
                  <Play className="h-3 w-3" /> {j}
                </Button>
              ))}
            </div>
            <ul className="max-h-80 divide-y divide-border overflow-y-auto text-sm">
              {jobs.data?.slice(0, 40).map((j) => (
                <li key={j.id} className="flex items-center gap-2 py-1.5">
                  <span className="flex-1 font-mono text-xs">{j.name}</span>
                  <span className="text-xs text-muted">{relative(j.finishedAt ?? j.runAt)}</span>
                  <Badge tone={j.status === 'DONE' ? 'success' : j.status === 'FAILED' ? 'danger' : 'info'}>{j.status}</Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HardDrive className="h-5 w-5" /> Respaldos cifrados
            </CardTitle>
            <Button size="sm" variant="outline" onClick={() => verify.mutate()} loading={verify.isPending}>
              <ShieldCheck className="h-4 w-4" /> Probar restauración
            </Button>
          </CardHeader>
          <CardContent>
            <p className="mb-2 text-sm text-muted">{s.backups.enabled ? 'Respaldo diario automático a la 01:00.' : 'Respaldo automático desactivado (BACKUP_ENABLED). Puede ejecutarlo manualmente.'}</p>
            {s.backups.latest.length === 0 && <p className="text-sm text-muted">Sin respaldos.</p>}
            <ul className="divide-y divide-border text-sm">
              {s.backups.latest.map((b) => (
                <li key={b.name} className="flex items-center gap-2 py-1.5">
                  <span className="flex-1 font-mono text-xs">{b.name}</span>
                  <span className="tabular text-xs text-muted">{Math.round(b.size / 1024)} KB</span>
                  <span className="text-xs text-muted">{fmtDateTime(b.createdAt)}</span>
                </li>
              ))}
            </ul>
            {s.failedJobs.length > 0 && (
              <>
                <h3 className="mb-1 mt-4 text-sm font-semibold">Últimos errores</h3>
                <ul className="text-xs text-red-700 dark:text-red-400">
                  {s.failedJobs.map((f, i) => (
                    <li key={i}>
                      {f.name}: {f.last_error}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
