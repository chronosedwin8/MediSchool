'use client';

import { CONSENT_TYPE_LABELS, CONSENT_TYPES } from '@sgee/shared';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, cn, Field, Input, Select, Skeleton, Textarea } from '@sgee/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Download, XCircle } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Dialog, TabPanel, Tabs } from '@/components/dialog';
import { api, openFile } from '@/lib/api';
import { fmtDate, fmtDateTime, todayIso } from '@/lib/format';

export function CompliancePanel() {
  const [tab, setTab] = useState('checklist');
  return (
    <Tabs
      value={tab}
      onValueChange={setTab}
      tabs={[
        { value: 'checklist', label: 'Matriz legal' },
        { value: 'consentimientos', label: 'Consentimientos' },
        { value: 'arco', label: 'Solicitudes ARCO' },
        { value: 'reportes', label: 'Reportes obligatorios' },
        { value: 'retencion', label: 'Retención y bloqueos' },
        { value: 'accesos', label: 'Accesos a historias' },
      ]}
    >
      <TabPanel value="checklist">{tab === 'checklist' && <Checklist />}</TabPanel>
      <TabPanel value="consentimientos">{tab === 'consentimientos' && <Templates />}</TabPanel>
      <TabPanel value="arco">{tab === 'arco' && <Dsr />}</TabPanel>
      <TabPanel value="reportes">{tab === 'reportes' && <Reports />}</TabPanel>
      <TabPanel value="retencion">{tab === 'retencion' && <Retention />}</TabPanel>
      <TabPanel value="accesos">{tab === 'accesos' && <AccessLog />}</TabPanel>
    </Tabs>
  );
}

function Checklist() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['checklist'], queryFn: () => api<{ name: string; laws: string[]; items: { key: string; label: string; ok: boolean; detail: string }[]; mandatoryReports: { type: string; label: string; authority: string; deadlineHours: number }[] }>('/compliance/checklist') });
  const profiles = useQuery({ queryKey: ['profiles'], queryFn: () => api<{ id: string; country: string; name: string; active: boolean }[]>('/compliance/profiles') });
  const activate = useMutation({ mutationFn: (c: string) => api(`/compliance/profiles/${c}/activate`, { method: 'POST' }), onSuccess: () => { toast.success('Perfil legal activado'); qc.invalidateQueries(); } });
  if (!q.data) return <Skeleton className="h-96" />;
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <Card>
        <CardHeader>
          <CardTitle>Perfil activo: {q.data.name}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-border">
            {q.data.items.map((i) => (
              <li key={i.key} className="flex items-center gap-3 py-2.5 text-sm">
                {i.ok ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" /> : <XCircle className="h-5 w-5 shrink-0 text-amber-600" />}
                <span className="flex-1">{i.label}</span>
                <span className="text-muted">{i.detail}</span>
              </li>
            ))}
          </ul>
          <h3 className="mb-2 mt-5 font-semibold">Normas modeladas</h3>
          <ul className="list-disc space-y-0.5 pl-5 text-sm text-muted">
            {q.data.laws.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
          <h3 className="mb-2 mt-5 font-semibold">Reportes obligatorios</h3>
          <ul className="text-sm">
            {q.data.mandatoryReports.map((r) => (
              <li key={r.type}>
                {r.label} → {r.authority} ({r.deadlineHours} h)
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Perfiles por país</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-1">
            {profiles.data?.map((p) => (
              <li key={p.id} className="flex items-center gap-2 text-sm">
                <span className="w-8 font-mono">{p.country}</span>
                <span className="flex-1">{p.name}</span>
                {p.active ? (
                  <Badge tone="success">Activo</Badge>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => window.confirm(`¿Activar el perfil ${p.name}?`) && activate.mutate(p.country)}>
                    Activar
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function Templates() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['consent-templates', 'all'], queryFn: () => api<{ id: string; type: string; title: string; version: string; effectiveFrom: string; active: boolean; mandatory: boolean; body: string }[]>('/consent-templates', { query: { all: true } }) });
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ type: 'DATA_PROCESSING', title: CONSENT_TYPE_LABELS.DATA_PROCESSING, body: '', version: '1.1', effectiveFrom: todayIso(), mandatory: true });
  const create = useMutation({ mutationFn: () => api('/consent-templates', { body: v }), onSuccess: () => { toast.success('Nueva versión publicada; se solicitará re-consentimiento'); setOpen(false); qc.invalidateQueries({ queryKey: ['consent-templates'] }); } });
  return (
    <div>
      <Button className="mb-3" onClick={() => setOpen(true)}>
        Publicar nueva versión
      </Button>
      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full min-w-[640px] text-sm">
          <tbody>
            {q.data?.map((t) => (
              <tr key={t.id} className="border-t border-border first:border-0">
                <td className="px-3 py-2 font-medium">{t.title}</td>
                <td>v{t.version}</td>
                <td className="text-muted">desde {fmtDate(t.effectiveFrom)}</td>
                <td>{t.mandatory && <Badge tone="warning">Obligatorio</Badge>}</td>
                <td className="pr-3 text-right">{t.active ? <Badge tone="success">Vigente</Badge> : <Badge tone="neutral">Histórico</Badge>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {open && (
        <Dialog open onOpenChange={setOpen} title="Nueva versión de consentimiento" size="lg" footer={<Button onClick={() => create.mutate()} loading={create.isPending} disabled={v.body.length < 20}>Publicar</Button>}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Tipo">
              <Select value={v.type} onChange={(e) => setV({ ...v, type: e.target.value, title: CONSENT_TYPE_LABELS[e.target.value as keyof typeof CONSENT_TYPE_LABELS] })}>
                {CONSENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {CONSENT_TYPE_LABELS[t]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Versión">
              <Input value={v.version} onChange={(e) => setV({ ...v, version: e.target.value })} />
            </Field>
            <Field label="Título" className="sm:col-span-2">
              <Input value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} />
            </Field>
            <Field label="Texto" className="sm:col-span-2">
              <Textarea rows={10} value={v.body} onChange={(e) => setV({ ...v, body: e.target.value })} />
            </Field>
            <Field label="Vigente desde">
              <Input type="date" value={v.effectiveFrom} onChange={(e) => setV({ ...v, effectiveFrom: e.target.value })} />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-5 w-5 accent-primary-700" checked={v.mandatory} onChange={(e) => setV({ ...v, mandatory: e.target.checked })} /> Obligatorio
            </label>
          </div>
        </Dialog>
      )}
    </div>
  );
}

function Dsr() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['dsr'], queryFn: () => api<{ id: string; type: string; subjectPersonId: string; subjectName: string; description: string; status: string; dueAt: string; overdue: boolean; resolution: string | null; exportFileId: string | null; createdAt: string }[]>('/dsr') });
  const resolve = useMutation({ mutationFn: (v: { id: string; status: string; resolution: string }) => api(`/dsr/${v.id}/resolve`, { body: { status: v.status, resolution: v.resolution } }), onSuccess: () => qc.invalidateQueries({ queryKey: ['dsr'] }) });
  const exportData = useMutation({ mutationFn: (v: { personId: string; dsrId: string }) => api<{ fileId: string }>(`/persons/${v.personId}/export?dsrId=${v.dsrId}`, { method: 'POST' }), onSuccess: (r) => { toast.success('Exportación generada'); qc.invalidateQueries({ queryKey: ['dsr'] }); openFile(`/files/${r.fileId}`, 'portabilidad.json'); } });
  const TYPE: Record<string, string> = { ACCESS: 'Acceso', RECTIFICATION: 'Rectificación', CANCELLATION: 'Cancelación', OPPOSITION: 'Oposición', PORTABILITY: 'Portabilidad', ERASURE: 'Supresión' };
  return (
    <div className="flex flex-col gap-2">
      {q.data?.length === 0 && <p className="text-sm text-muted">Sin solicitudes.</p>}
      {q.data?.map((d) => (
        <Card key={d.id} className={cn('p-4', d.overdue && 'border-red-300')}>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="primary">{TYPE[d.type]}</Badge>
            <span className="font-medium">{d.subjectName}</span>
            <span className="text-sm text-muted">· recibida {fmtDate(d.createdAt)} · vence {fmtDate(d.dueAt)}</span>
            <Badge tone={d.status === 'RESOLVED' ? 'success' : d.overdue ? 'danger' : 'warning'} className="ml-auto">
              {d.status}
            </Badge>
          </div>
          <p className="mt-1 text-sm">{d.description}</p>
          {d.resolution && <p className="mt-1 text-sm text-muted">Resolución: {d.resolution}</p>}
          {!['RESOLVED', 'REJECTED'].includes(d.status) && (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => exportData.mutate({ personId: d.subjectPersonId, dsrId: d.id })} loading={exportData.isPending}>
                <Download className="h-4 w-4" /> Exportar datos del titular
              </Button>
              <Button size="sm" onClick={() => { const r = window.prompt('Resolución'); if (r) resolve.mutate({ id: d.id, status: 'RESOLVED', resolution: r }); }}>
                Resolver
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { const r = window.prompt('Motivo del rechazo'); if (r) resolve.mutate({ id: d.id, status: 'REJECTED', resolution: r }); }}>
                Rechazar
              </Button>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

function Reports() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['mandatory-reports'], queryFn: () => api<{ id: string; type: string; authority: string; details: string; status: string; dueAt: string; filedReference: string | null; createdAt: string }[]>('/mandatory-reports') });
  const update = useMutation({ mutationFn: (v: { id: string; filedReference: string }) => api(`/mandatory-reports/${v.id}`, { method: 'PATCH', body: { status: 'FILED', filedReference: v.filedReference } }), onSuccess: () => qc.invalidateQueries({ queryKey: ['mandatory-reports'] }) });
  return (
    <div className="flex flex-col gap-2">
      {q.data?.length === 0 && <p className="text-sm text-muted">Sin reportes.</p>}
      {q.data?.map((r) => (
        <Card key={r.id} className="p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="warning">{r.type}</Badge>
            <span className="font-medium">{r.authority}</span>
            <span className="text-sm text-muted">· vence {fmtDateTime(r.dueAt)}</span>
            <Badge tone={r.status === 'FILED' ? 'success' : new Date(r.dueAt) < new Date() ? 'danger' : 'info'} className="ml-auto">
              {r.status === 'FILED' ? `Radicado ${r.filedReference ?? ''}` : 'Borrador'}
            </Badge>
          </div>
          <p className="mt-1 text-sm">{r.details}</p>
          {r.status !== 'FILED' && (
            <Button size="sm" className="mt-2" variant="outline" onClick={() => { const ref = window.prompt('Número de radicado ante la autoridad'); if (ref) update.mutate({ id: r.id, filedReference: ref }); }}>
              Marcar como radicado
            </Button>
          )}
        </Card>
      ))}
    </div>
  );
}

function Retention() {
  const qc = useQueryClient();
  const policies = useQuery({ queryKey: ['retention-policies'], queryFn: () => api<{ id: string; entity: string; retentionYears: number; action: string }[]>('/retention/policies') });
  const flags = useQuery({ queryKey: ['retention-flags'], queryFn: () => api<{ id: string; personId: string; entity: string; reason: string; status: string }[]>('/retention/flags') });
  const holds = useQuery({ queryKey: ['legal-holds'], queryFn: () => api<{ id: string; personId: string; reason: string; reference: string | null; createdAt: string; releasedAt: string | null }[]>('/legal-holds') });
  const release = useMutation({ mutationFn: (id: string) => api(`/legal-holds/${id}/release`, { method: 'POST' }), onSuccess: () => qc.invalidateQueries({ queryKey: ['legal-holds'] }) });
  const ENTITY: Record<string, string> = { clinical_record: 'Historia clínica', audit_log: 'Auditoría', notifications: 'Notificaciones', passes: 'Pases' };
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Políticas de retención</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-border text-sm">
            {policies.data?.map((p) => (
              <li key={p.id} className="flex items-center gap-2 py-2">
                <span className="flex-1">{ENTITY[p.entity] ?? p.entity}</span>
                <span className="tabular">{p.retentionYears} años</span>
                <Badge tone="neutral">{p.action}</Badge>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">Los registros clínicos nunca se eliminan automáticamente: al cumplir la retención se marcan para revisión, salvo bloqueo legal.</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Bloqueos legales</CardTitle>
        </CardHeader>
        <CardContent>
          {holds.data?.length === 0 && <p className="text-sm text-muted">Sin bloqueos.</p>}
          <ul className="divide-y divide-border text-sm">
            {holds.data?.map((h) => (
              <li key={h.id} className="flex items-center gap-2 py-2">
                <span className="flex-1">
                  {h.reason} {h.reference && <span className="text-muted">({h.reference})</span>}
                </span>
                {h.releasedAt ? <Badge tone="neutral">Liberado</Badge> : <Button size="sm" variant="ghost" onClick={() => release.mutate(h.id)}>Liberar</Button>}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Registros con retención cumplida</CardTitle>
        </CardHeader>
        <CardContent>
          {flags.data?.length === 0 && <p className="text-sm text-muted">Ningún registro ha cumplido su período de retención.</p>}
          <ul className="text-sm">
            {flags.data?.map((f) => (
              <li key={f.id}>
                {f.reason} · <Badge tone={f.status === 'HELD' ? 'warning' : 'info'}>{f.status}</Badge>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function AccessLog() {
  const [outOfRole, setOutOfRole] = useState(false);
  const q = useQuery({ queryKey: ['access-log', outOfRole], queryFn: () => api<{ id: string; createdAt: string; userName: string; personName: string; resource: string; outOfRole: boolean; ip: string | null }[]>('/clinical-access-log', { query: { outOfRole } }) });
  return (
    <div>
      <label className="mb-3 flex items-center gap-2 text-sm">
        <input type="checkbox" className="h-5 w-5 accent-primary-700" checked={outOfRole} onChange={(e) => setOutOfRole(e.target.checked)} /> Solo accesos fuera del rol habitual
      </label>
      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-card-muted text-left text-xs text-muted">
            <tr>
              <th className="px-3 py-2">Fecha</th>
              <th>Usuario</th>
              <th>Historia de</th>
              <th>Recurso</th>
              <th>IP</th>
            </tr>
          </thead>
          <tbody>
            {q.data?.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="tabular px-3 py-1.5">{fmtDateTime(r.createdAt)}</td>
                <td>{r.userName}</td>
                <td>{r.personName}</td>
                <td>
                  {r.resource} {r.outOfRole && <Badge tone="danger">Fuera de rol</Badge>}
                </td>
                <td className="text-muted">{r.ip}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
