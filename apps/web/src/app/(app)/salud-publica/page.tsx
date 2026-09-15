'use client';

import { EMERGENCY_PROTOCOLS } from '@sgee/shared';
import { Alert, Badge, Button, Card, CardContent, CardHeader, CardTitle, EmptyState, Field, Input, PageHeader, Select, Skeleton, StudentAvatar, Textarea } from '@sgee/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, Bus, Download, FileDown, Megaphone, Plus, Siren, Syringe } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { Dialog, TabPanel, Tabs } from '@/components/dialog';
import type { Structure } from '@/app/(app)/estudiantes/page';
import { api, openFile } from '@/lib/api';
import { addDaysIso, fmtDate, fmtDateTime, todayIso } from '@/lib/format';
import { can, useMe } from '@/lib/session';

const SYNDROME: Record<string, string> = { GASTROINTESTINAL: 'Gastrointestinal', RESPIRATORIO: 'Respiratorio', EXANTEMATICO: 'Exantemático', CONJUNTIVITIS: 'Conjuntivitis', PEDICULOSIS: 'Pediculosis', FEBRIL: 'Febril' };
const CAMPAIGN_KIND: Record<string, string> = { VACCINATION: 'Vacunación', DEWORMING: 'Desparasitación', SCREENING: 'Tamizaje', HEALTH_EDUCATION: 'Educación en salud', LICE_CONTROL: 'Control de piojos', ORAL_HEALTH: 'Salud oral', PROFILE_UPDATE: 'Actualización de fichas' };

export default function PublicHealthPage() {
  const { data: me } = useMe();
  const manage = can(me, 'public_health:manage');
  const [tab, setTab] = useState('brotes');
  return (
    <div>
      <PageHeader title="Salud pública escolar" description="Vigilancia epidemiológica, campañas, ausentismo, salidas pedagógicas y emergencias." />
      <Tabs
        value={tab}
        onValueChange={setTab}
        tabs={[
          { value: 'brotes', label: 'Brotes' },
          { value: 'frecuentes', label: 'Consultas frecuentes' },
          { value: 'campanas', label: 'Campañas', hidden: !manage },
          { value: 'excusas', label: 'Excusas médicas', hidden: !can(me, 'clinical:read') },
          { value: 'salidas', label: 'Salidas pedagógicas', hidden: !can(me, 'clinical:read') },
          { value: 'emergencias', label: 'Emergencias' },
          { value: 'circulares', label: 'Circulares', hidden: !can(me, 'comms:circulars') },
        ]}
      >
        <TabPanel value="brotes">{tab === 'brotes' && <Outbreaks manage={manage} />}</TabPanel>
        <TabPanel value="frecuentes">{tab === 'frecuentes' && <Frequent />}</TabPanel>
        <TabPanel value="campanas">{tab === 'campanas' && <Campaigns />}</TabPanel>
        <TabPanel value="excusas">{tab === 'excusas' && <Excuses />}</TabPanel>
        <TabPanel value="salidas">{tab === 'salidas' && <FieldTrips manage={manage} />}</TabPanel>
        <TabPanel value="emergencias">{tab === 'emergencias' && <Emergencies manage={manage} />}</TabPanel>
        <TabPanel value="circulares">{tab === 'circulares' && <Circulars />}</TabPanel>
      </Tabs>
    </div>
  );
}

function Outbreaks({ manage }: { manage: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['outbreaks'], queryFn: () => api<{ id: string; scope: string; scopeName: string; syndrome: string; cases: number; population: number; attackRatePct: number; firstCaseAt: string; lastCaseAt: string; status: string; detectedAt: string }[]>('/public-health/outbreaks') });
  const run = useMutation({ mutationFn: () => api<{ signals: number; created: number }>('/public-health/outbreaks/run', { method: 'POST' }), onSuccess: (r) => { toast.success(`${r.signals} señales activas (${r.created} nuevas)`); qc.invalidateQueries({ queryKey: ['outbreaks'] }); } });
  const update = useMutation({ mutationFn: (v: { id: string; status: string }) => api(`/public-health/outbreaks/${v.id}`, { method: 'PATCH', body: { status: v.status } }), onSuccess: () => qc.invalidateQueries({ queryKey: ['outbreaks'] }) });
  const [range, setRange] = useState({ from: addDaysIso(todayIso(), -28), to: todayIso() });
  return (
    <div className="flex flex-col gap-4">
      {manage && (
        <Card className="flex flex-wrap items-end gap-3 p-4">
          <Button onClick={() => run.mutate()} loading={run.isPending}>
            <Activity className="h-4 w-4" /> Ejecutar detección ahora
          </Button>
          <div className="ml-auto flex flex-wrap items-end gap-2">
            <Field label="Desde">
              <Input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
            </Field>
            <Field label="Hasta">
              <Input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
            </Field>
            <Button variant="outline" onClick={() => openFile(`/public-health/surveillance.csv?from=${range.from}&to=${range.to}`, `vigilancia-${range.from}.csv`)}>
              <Download className="h-4 w-4" /> Reporte sindrómico (CSV)
            </Button>
          </div>
        </Card>
      )}
      {q.isLoading && <Skeleton className="h-40" />}
      {q.data?.length === 0 && <EmptyState icon={<Activity />} title="Sin señales de brote" description="La detección se ejecuta cada hora comparando casos por grupo y grado." />}
      <div className="grid gap-3 md:grid-cols-2">
        {q.data?.map((o) => (
          <Card key={o.id} className={o.status === 'OPEN' ? 'border-amber-300 dark:border-amber-800' : ''}>
            <CardHeader>
              <div>
                <CardTitle>
                  {SYNDROME[o.syndrome] ?? o.syndrome} · {o.scope === 'GROUP' ? 'Grupo' : 'Grado'} {o.scopeName}
                </CardTitle>
                <p className="text-sm text-muted">Detectado {fmtDateTime(o.detectedAt)}</p>
              </div>
              <Badge tone={o.status === 'OPEN' ? 'warning' : o.status === 'NOTIFIED' ? 'info' : 'neutral'}>{{ OPEN: 'Abierta', NOTIFIED: 'Notificada', CLOSED: 'Cerrada' }[o.status]}</Badge>
            </CardHeader>
            <CardContent>
              <p className="tabular text-3xl font-semibold">
                {o.attackRatePct}% <span className="text-base font-normal text-muted">tasa de ataque</span>
              </p>
              <p className="text-sm text-muted">
                {o.cases} de {o.population} estudiantes · {fmtDate(o.firstCaseAt)} a {fmtDate(o.lastCaseAt)}
              </p>
              {manage && o.status !== 'CLOSED' && (
                <div className="mt-3 flex gap-2">
                  {o.status === 'OPEN' && (
                    <Button size="sm" variant="outline" onClick={() => update.mutate({ id: o.id, status: 'NOTIFIED' })}>
                      Marcar notificada
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => update.mutate({ id: o.id, status: 'CLOSED' })}>
                    Cerrar
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function Frequent() {
  const [days, setDays] = useState(30);
  const q = useQuery({ queryKey: ['frequent', days], queryFn: () => api<{ rank: number; count: number; student: { id: string | null; name: string; photoUrl?: string | null; group: { name: string } | null }; patterns: { subject: string; count: number; sharePct: number }[] }[]>('/public-health/frequent-visitors', { query: { days } }) });
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <span className="text-sm text-muted">Período</span>
        <Select value={String(days)} onChange={(e) => setDays(Number(e.target.value))} className="w-40">
          <option value="30">30 días</option>
          <option value="60">60 días</option>
          <option value="90">90 días</option>
        </Select>
      </div>
      {q.data?.length === 0 && <EmptyState title="Sin estudiantes por encima del umbral" />}
      <ul className="flex flex-col gap-2">
        {q.data?.map((r) => (
          <Card key={r.rank} className="flex flex-wrap items-center gap-3 p-3">
            <span className="tabular w-8 text-lg font-semibold text-muted">{r.rank}</span>
            <StudentAvatar src={r.student.photoUrl} name={r.student.name} size={40} />
            <div className="min-w-0 flex-1">
              {r.student.id ? (
                <Link href={`/estudiantes/${r.student.id}`} className="font-medium hover:underline">
                  {r.student.name}
                </Link>
              ) : (
                <span className="font-medium">{r.student.name}</span>
              )}
              <p className="text-xs text-muted">{r.student.group?.name}</p>
            </div>
            {r.patterns.map((p) => (
              <Badge key={p.subject} tone="violet">
                {p.sharePct}% en {p.subject}
              </Badge>
            ))}
            <span className="tabular text-lg font-semibold">{r.count} visitas</span>
          </Card>
        ))}
      </ul>
      <Alert tone="info" className="mt-4">
        Los patrones por asignatura (por ejemplo, salir siempre en la misma clase) se comparten con orientación escolar para seguimiento.
      </Alert>
    </div>
  );
}

function Campaigns() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['campaigns'], queryFn: () => api<{ id: string; name: string; kind: string; startsOn: string; endsOn: string; status: string; total: number; stats: Record<string, number> }[]>('/campaigns') });
  const structure = useQuery({ queryKey: ['structure'], queryFn: () => api<Structure[]>('/structure'), staleTime: 600_000 });
  const [open, setOpen] = useState<string | null>(null);
  const [create, setCreate] = useState(false);
  const [v, setV] = useState({ name: '', kind: 'VACCINATION', startsOn: todayIso(), endsOn: addDaysIso(todayIso(), 14), description: '', sectionIds: [] as string[] });
  const detail = useQuery({ queryKey: ['campaign', open], queryFn: () => api<{ name: string; participants: { studentId: string; status: string; student: { name: string; group: { name: string } | null } }[] }>(`/campaigns/${open}`), enabled: !!open });
  const createMut = useMutation({ mutationFn: () => api('/campaigns', { body: { ...v, gradeIds: [] } }), onSuccess: () => { setCreate(false); qc.invalidateQueries({ queryKey: ['campaigns'] }); } });
  const setStatus = useMutation({ mutationFn: (x: { studentId: string; status: string }) => api(`/campaigns/${open}/participants/${x.studentId}`, { method: 'PATCH', body: { status: x.status } }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['campaign', open] }); qc.invalidateQueries({ queryKey: ['campaigns'] }); } });
  return (
    <div>
      <Button className="mb-3" onClick={() => setCreate(true)}>
        <Plus className="h-4 w-4" /> Nueva campaña
      </Button>
      <div className="grid gap-3 md:grid-cols-2">
        {q.data?.map((c) => {
          const done = c.stats.DONE ?? 0;
          return (
            <Card key={c.id} className="p-4">
              <div className="flex items-start gap-2">
                <Syringe className="mt-0.5 h-5 w-5 text-primary-700" />
                <div className="flex-1">
                  <p className="font-semibold">{c.name}</p>
                  <p className="text-sm text-muted">
                    {CAMPAIGN_KIND[c.kind]} · {fmtDate(c.startsOn)} – {fmtDate(c.endsOn)}
                  </p>
                </div>
                <Badge tone={c.status === 'ACTIVE' ? 'success' : 'neutral'}>{c.status === 'ACTIVE' ? 'Activa' : c.status === 'CLOSED' ? 'Cerrada' : c.status}</Badge>
              </div>
              <p className="tabular mt-3 text-sm">
                {done} de {c.total} realizados ({c.total ? Math.round((done / c.total) * 100) : 0}%)
              </p>
              <Button size="sm" variant="outline" className="mt-3" onClick={() => setOpen(c.id)}>
                Ver participantes
              </Button>
            </Card>
          );
        })}
      </div>
      {open && (
        <Dialog open onOpenChange={() => setOpen(null)} title={detail.data?.name ?? 'Campaña'} size="lg">
          <ul className="divide-y divide-border">
            {detail.data?.participants.map((p) => (
              <li key={p.studentId} className="flex items-center gap-2 py-2 text-sm">
                <span className="flex-1">
                  {p.student.name} <span className="text-muted">· {p.student.group?.name}</span>
                </span>
                <Select value={p.status} onChange={(e) => setStatus.mutate({ studentId: p.studentId, status: e.target.value })} className="h-9 w-40 text-sm">
                  <option value="PENDING">Pendiente</option>
                  <option value="DONE">Realizado</option>
                  <option value="EXEMPT">Exento</option>
                  <option value="REFUSED">No autorizado</option>
                </Select>
              </li>
            ))}
          </ul>
        </Dialog>
      )}
      {create && (
        <Dialog open onOpenChange={() => setCreate(false)} title="Nueva campaña" footer={<Button onClick={() => createMut.mutate()} loading={createMut.isPending} disabled={v.name.length < 3}>Crear</Button>}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nombre" required className="sm:col-span-2">
              <Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
            </Field>
            <Field label="Tipo">
              <Select value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value })}>
                {Object.entries(CAMPAIGN_KIND).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Sección">
              <Select value={v.sectionIds[0] ?? ''} onChange={(e) => setV({ ...v, sectionIds: e.target.value ? [e.target.value] : [] })}>
                <option value="">Todo el colegio</option>
                {structure.data?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Inicio">
              <Input type="date" value={v.startsOn} onChange={(e) => setV({ ...v, startsOn: e.target.value })} />
            </Field>
            <Field label="Fin">
              <Input type="date" value={v.endsOn} onChange={(e) => setV({ ...v, endsOn: e.target.value })} />
            </Field>
            <Field label="Descripción" className="sm:col-span-2">
              <Textarea value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} />
            </Field>
          </div>
        </Dialog>
      )}
    </div>
  );
}

function Excuses() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['excuses'], queryFn: () => api<{ id: string; fromDate: string; toDate: string; reason: string; symptoms: string | null; status: string; syndrome: string | null; student: { name: string; group: { name: string } | null } }[]>('/absence-excuses') });
  const validate = useMutation({ mutationFn: (v: { id: string; status: string }) => api(`/absence-excuses/${v.id}/validate`, { body: { status: v.status } }), onSuccess: () => qc.invalidateQueries({ queryKey: ['excuses'] }) });
  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-card">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="bg-card-muted text-left text-xs text-muted">
          <tr>
            <th className="px-3 py-2">Estudiante</th>
            <th>Fechas</th>
            <th>Motivo</th>
            <th>Síndrome</th>
            <th>Estado</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {q.data?.map((x) => (
            <tr key={x.id} className="border-t border-border">
              <td className="px-3 py-2">
                {x.student.name} <span className="text-muted">· {x.student.group?.name}</span>
              </td>
              <td className="tabular">
                {fmtDate(x.fromDate)} – {fmtDate(x.toDate)}
              </td>
              <td>
                {x.reason} {x.symptoms && <span className="text-muted">({x.symptoms})</span>}
              </td>
              <td>{x.syndrome ? <Badge tone="warning">{SYNDROME[x.syndrome]}</Badge> : '—'}</td>
              <td>
                <Badge tone={x.status === 'VALIDATED' ? 'success' : x.status === 'REJECTED' ? 'danger' : 'info'}>{{ SUBMITTED: 'Recibida', VALIDATED: 'Validada', REJECTED: 'Rechazada' }[x.status]}</Badge>
              </td>
              <td className="pr-3 text-right">
                {x.status === 'SUBMITTED' && (
                  <span className="flex justify-end gap-1">
                    <Button size="sm" variant="outline" onClick={() => validate.mutate({ id: x.id, status: 'VALIDATED' })}>
                      Validar
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => validate.mutate({ id: x.id, status: 'REJECTED' })}>
                      Rechazar
                    </Button>
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FieldTrips({ manage }: { manage: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['trips'], queryFn: () => api<{ id: string; name: string; date: string; destination: string; groupIds: string[]; responsibleStaff: string | null }[]>('/field-trips') });
  const structure = useQuery({ queryKey: ['structure'], queryFn: () => api<Structure[]>('/structure'), staleTime: 600_000 });
  const [create, setCreate] = useState(false);
  const [v, setV] = useState({ name: '', date: addDaysIso(todayIso(), 7), destination: '', groupIds: [] as string[], responsibleStaff: '' });
  const groups = structure.data?.flatMap((s) => s.grades.flatMap((g) => g.groups)) ?? [];
  const mut = useMutation({ mutationFn: () => api('/field-trips', { body: v }), onSuccess: () => { setCreate(false); qc.invalidateQueries({ queryKey: ['trips'] }); } });
  return (
    <div>
      {manage && (
        <Button className="mb-3" onClick={() => setCreate(true)}>
          <Plus className="h-4 w-4" /> Nueva salida
        </Button>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        {q.data?.map((t) => (
          <Card key={t.id} className="p-4">
            <div className="flex items-start gap-3">
              <Bus className="mt-0.5 h-5 w-5 text-primary-700" />
              <div className="flex-1">
                <p className="font-semibold">{t.name}</p>
                <p className="text-sm text-muted">
                  {fmtDate(t.date)} · {t.destination}
                </p>
                <p className="text-sm text-muted">
                  {t.groupIds.map((id) => groups.find((g) => g.id === id)?.name).filter(Boolean).join(', ')} {t.responsibleStaff && `· ${t.responsibleStaff}`}
                </p>
              </div>
            </div>
            <Button size="sm" variant="outline" className="mt-3" onClick={() => openFile(`/field-trips/${t.id}/roster.pdf`)}>
              <FileDown className="h-4 w-4" /> Listado con alertas y contactos (PDF)
            </Button>
          </Card>
        ))}
      </div>
      {create && (
        <Dialog open onOpenChange={() => setCreate(false)} title="Nueva salida pedagógica" footer={<Button onClick={() => mut.mutate()} loading={mut.isPending} disabled={!v.name || !v.destination || !v.groupIds.length}>Crear</Button>}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nombre" required className="sm:col-span-2">
              <Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
            </Field>
            <Field label="Fecha">
              <Input type="date" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} />
            </Field>
            <Field label="Destino" required>
              <Input value={v.destination} onChange={(e) => setV({ ...v, destination: e.target.value })} />
            </Field>
            <Field label="Responsable" className="sm:col-span-2">
              <Input value={v.responsibleStaff} onChange={(e) => setV({ ...v, responsibleStaff: e.target.value })} />
            </Field>
            <Field label="Grupos" className="sm:col-span-2">
              <div className="flex max-h-48 flex-wrap gap-1.5 overflow-y-auto">
                {groups.map((g) => (
                  <button key={g.id} type="button" onClick={() => setV({ ...v, groupIds: v.groupIds.includes(g.id) ? v.groupIds.filter((x) => x !== g.id) : [...v.groupIds, g.id] })} className={`min-h-9 rounded-full border px-3 text-sm ${v.groupIds.includes(g.id) ? 'border-primary-700 bg-primary-700 text-white' : 'border-border'}`}>
                    {g.name}
                  </button>
                ))}
              </div>
            </Field>
          </div>
        </Dialog>
      )}
    </div>
  );
}

function Emergencies({ manage }: { manage: boolean }) {
  const qc = useQueryClient();
  const resources = useQuery({ queryKey: ['safety'], queryFn: () => api<{ id: string; kind: string; name: string; location: string }[]>('/safety-resources') });
  const drills = useQuery({ queryKey: ['drills'], queryFn: () => api<{ id: string; protocolKey: string; performedOn: string; participants: number; durationMinutes: number | null; findings: string | null }[]>('/drills'), enabled: manage });
  const [d, setD] = useState({ protocolKey: 'anaphylaxis', performedOn: todayIso(), participants: 0, durationMinutes: 30, findings: '' });
  const addDrill = useMutation({ mutationFn: () => api('/drills', { body: d }), onSuccess: () => { toast.success('Simulacro registrado'); qc.invalidateQueries({ queryKey: ['drills'] }); } });
  const KIND: Record<string, string> = { AED: 'DEA', BRIGADE_MEMBER: 'Brigadista', EXTINGUISHER: 'Extintor', MEETING_POINT: 'Punto de encuentro', FIRST_AID_KIT: 'Botiquín' };
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Siren className="h-5 w-5 text-red-600" /> Protocolos de emergencia
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {EMERGENCY_PROTOCOLS.map((p) => (
            <details key={p.key} className="rounded-xl border border-border p-3">
              <summary className="cursor-pointer font-medium">{p.title}</summary>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
                {p.steps.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
            </details>
          ))}
        </CardContent>
      </Card>
      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Recursos: DEA, brigadistas y puntos de encuentro</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border text-sm">
              {resources.data?.map((r) => (
                <li key={r.id} className="flex items-center gap-2 py-2">
                  <Badge tone={r.kind === 'AED' ? 'danger' : 'neutral'}>{KIND[r.kind] ?? r.kind}</Badge>
                  <span className="flex-1">{r.name}</span>
                  <span className="text-muted">{r.location}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        {manage && (
          <Card>
            <CardHeader>
              <CardTitle>Simulacros</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="mb-3 divide-y divide-border text-sm">
                {drills.data?.map((x) => (
                  <li key={x.id} className="py-2">
                    <span className="font-medium">{EMERGENCY_PROTOCOLS.find((p) => p.key === x.protocolKey)?.title ?? x.protocolKey}</span> · {fmtDate(x.performedOn)} · {x.participants} participantes
                    {x.findings && <p className="text-muted">{x.findings}</p>}
                  </li>
                ))}
              </ul>
              <div className="grid gap-2 sm:grid-cols-2">
                <Select value={d.protocolKey} onChange={(e) => setD({ ...d, protocolKey: e.target.value })} aria-label="Protocolo">
                  {EMERGENCY_PROTOCOLS.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.title}
                    </option>
                  ))}
                </Select>
                <Input type="date" value={d.performedOn} onChange={(e) => setD({ ...d, performedOn: e.target.value })} aria-label="Fecha" />
                <Input type="number" value={d.participants} onChange={(e) => setD({ ...d, participants: Number(e.target.value) })} aria-label="Participantes" placeholder="Participantes" />
                <Input type="number" value={d.durationMinutes} onChange={(e) => setD({ ...d, durationMinutes: Number(e.target.value) })} aria-label="Duración (min)" />
                <Textarea className="sm:col-span-2" rows={2} placeholder="Hallazgos y mejoras" value={d.findings} onChange={(e) => setD({ ...d, findings: e.target.value })} />
              </div>
              <Button size="sm" className="mt-2" onClick={() => addDrill.mutate()} loading={addDrill.isPending}>
                Registrar simulacro
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function Circulars() {
  const qc = useQueryClient();
  const structure = useQuery({ queryKey: ['structure'], queryFn: () => api<Structure[]>('/structure'), staleTime: 600_000 });
  const list = useQuery({ queryKey: ['circulars'], queryFn: () => api<{ id: string; title: string; category: string; publishedAt: string; recipientsCount: number; readCount: number }[]>('/circulars') });
  const [v, setV] = useState({ title: '', body: '', category: 'RECOMMENDATION', sectionIds: [] as string[], groupIds: [] as string[], channels: ['IN_APP', 'EMAIL'] });
  const groups = structure.data?.flatMap((s) => s.grades.flatMap((g) => g.groups)) ?? [];
  const publish = useMutation({ mutationFn: () => api<{ recipientsCount: number }>('/circulars', { body: { ...v, gradeIds: [] } }), onSuccess: (r) => { toast.success(`Circular enviada a ${r.recipientsCount} acudientes`); setV({ ...v, title: '', body: '' }); qc.invalidateQueries({ queryKey: ['circulars'] }); } });
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
      <Card className="p-5">
        <h2 className="mb-3 flex items-center gap-2 font-semibold">
          <Megaphone className="h-5 w-5" /> Nueva circular de salud
        </h2>
        <div className="grid gap-3">
          <Field label="Título" required>
            <Input value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} />
          </Field>
          <Field label="Mensaje" required hint="Evite datos de estudiantes identificables.">
            <Textarea rows={6} value={v.body} onChange={(e) => setV({ ...v, body: e.target.value })} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Categoría">
              <Select value={v.category} onChange={(e) => setV({ ...v, category: e.target.value })}>
                <option value="OUTBREAK">Brote</option>
                <option value="CAMPAIGN">Campaña</option>
                <option value="RECOMMENDATION">Recomendación</option>
                <option value="GENERAL">General</option>
              </Select>
            </Field>
            <Field label="Sección">
              <Select value={v.sectionIds[0] ?? ''} onChange={(e) => setV({ ...v, sectionIds: e.target.value ? [e.target.value] : [] })}>
                <option value="">Todo el colegio</option>
                {structure.data?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Grupos específicos (opcional)">
            <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
              {groups.map((g) => (
                <button key={g.id} type="button" onClick={() => setV({ ...v, groupIds: v.groupIds.includes(g.id) ? v.groupIds.filter((x) => x !== g.id) : [...v.groupIds, g.id] })} className={`min-h-8 rounded-full border px-2.5 text-xs ${v.groupIds.includes(g.id) ? 'border-primary-700 bg-primary-700 text-white' : 'border-border'}`}>
                  {g.name}
                </button>
              ))}
            </div>
          </Field>
          <Button onClick={() => publish.mutate()} loading={publish.isPending} disabled={v.title.length < 3 || v.body.length < 3}>
            Publicar y notificar
          </Button>
        </div>
      </Card>
      <Card className="p-4">
        <h2 className="mb-2 font-semibold">Publicadas</h2>
        <ul className="divide-y divide-border text-sm">
          {list.data?.map((c) => (
            <li key={c.id} className="py-2">
              <p className="font-medium">{c.title}</p>
              <p className="text-xs text-muted">
                {fmtDate(c.publishedAt)} · leída por {c.readCount} de {c.recipientsCount}
              </p>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
