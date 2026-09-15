'use client';

import { Alert, Badge, Button, Card, CardContent, CardHeader, CardTitle, cn, Input, PageHeader, Select, Skeleton, StatCard } from '@sgee/ui';
import { useQuery } from '@tanstack/react-query';
import { Activity, AlertTriangle, Clock, Download, HeartPulse, Pill, Table2, Truck, Users } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Structure } from '@/app/(app)/estudiantes/page';
import { api, openFile } from '@/lib/api';
import { addDaysIso, fmtNumber, fmtMoney, todayIso } from '@/lib/format';
import { can, useMe } from '@/lib/session';

type KV = { key: string; label: string; count: number };
interface Dashboard {
  range: { from: string; to: string };
  anonymized: boolean;
  totals: { encounters: number; students: number; accidents: number; pickups: number; transfers: number; staff: number; passes: number };
  comparison: { encounters: number; from: string; to: string } | null;
  byDay: { day: string; count: number }[];
  byHour: { hour: number; count: number }[];
  heatmap: { dow: number; hour: number; count: number }[];
  byType: KV[];
  byMotive: KV[];
  byDiagnosis: KV[];
  byDisposition: KV[];
  bySection: KV[];
  byGrade: KV[];
  byGroup: KV[];
  byZone: (KV & { severe: number })[];
  byActivity: KV[];
  byTeacher: { key: string; count: number }[];
  times: Record<'transit' | 'wait' | 'care' | 'pickup' | 'total', { avg: number | null; median: number | null }>;
  frequent: { studentId: string | null; name: string; group: string | null; count: number }[];
  medication: { given: number; notGiven: number; adherencePct: number | null; top: KV[] };
  inventory: { consumedCost: number; movements: number; expiredBatches: number };
  compliance: { activeStudents: number; profilesUpdatedPct: number; consentsCompletePct: number; vaccinationRegisteredPct: number };
}

const PRESETS = [
  { label: '7 días', days: 7 },
  { label: '30 días', days: 30 },
  { label: '90 días', days: 90 },
  { label: 'Año', days: 365 },
];
const DOW = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const tooltipStyle = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, color: 'var(--fg)', fontSize: 13 };

function ChartCard({ title, children, table, description }: { title: string; description?: string; children: ReactNode; table: { head: string[]; rows: (string | number)[][] } }) {
  const [asTable, setAsTable] = useState(false);
  return (
    <Card>
      <CardHeader className="pb-1">
        <div>
          <CardTitle>{title}</CardTitle>
          {description && <p className="text-xs text-muted">{description}</p>}
        </div>
        <Button size="icon-sm" variant="ghost" onClick={() => setAsTable(!asTable)} aria-label={asTable ? 'Ver gráfica' : 'Ver como tabla'} aria-pressed={asTable}>
          <Table2 className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent>
        {asTable ? (
          <div className="max-h-72 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted">
                <tr>{table.head.map((h) => <th key={h} className="py-1">{h}</th>)}</tr>
              </thead>
              <tbody>
                {table.rows.map((r, i) => (
                  <tr key={i} className="border-t border-border">
                    {r.map((c, j) => <td key={j} className={cn('py-1', typeof c === 'number' && 'tabular text-right')}>{c}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}

/** Horizontal ranked bars: one series, one hue, direct value labels. */
function RankBars({ data, onSelect, max = 10 }: { data: KV[]; onSelect?: (k: KV) => void; max?: number }) {
  const rows = data.slice(0, max);
  const top = Math.max(1, ...rows.map((r) => r.count));
  if (!rows.length) return <p className="py-8 text-center text-sm text-muted">Sin datos en el período</p>;
  return (
    <ul className="flex flex-col gap-1.5">
      {rows.map((r) => (
        <li key={r.key}>
          <button type="button" disabled={!onSelect} onClick={() => onSelect?.(r)} className={cn('group grid w-full grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_3rem] items-center gap-3 rounded-lg px-1 py-1 text-left text-sm', onSelect && 'hover:bg-card-muted')} title={`${r.label}: ${r.count}`}>
            <span className="truncate text-fg/90">{r.label}</span>
            <span className="h-3 overflow-hidden rounded-r-[4px]" aria-hidden>
              <span className="block h-full rounded-r-[4px]" style={{ width: `${(r.count / top) * 100}%`, background: 'var(--viz-series-1)' }} />
            </span>
            <span className="tabular text-right text-muted">{fmtNumber(r.count)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export default function StatsPage() {
  const { data: me } = useMe();
  const [from, setFrom] = useState(addDaysIso(todayIso(), -29));
  const [to, setTo] = useState(todayIso());
  const [sectionId, setSectionId] = useState('');
  const [gradeId, setGradeId] = useState('');
  const [groupId, setGroupId] = useState('');
  const [compare, setCompare] = useState(false);
  const structure = useQuery({ queryKey: ['structure'], queryFn: () => api<Structure[]>('/structure'), staleTime: 600_000 });
  const q = useQuery({ queryKey: ['dashboard', from, to, sectionId, gradeId, groupId, compare], queryFn: () => api<Dashboard>('/stats/dashboard', { query: { from, to, sectionId, gradeId, groupId, compareYear: compare || undefined } }) });
  const d = q.data;
  const section = structure.data?.find((s) => s.id === sectionId);
  const grade = section?.grades.find((g) => g.id === gradeId);
  const exportQs = `from=${from}&to=${to}${sectionId ? `&sectionId=${sectionId}` : ''}${gradeId ? `&gradeId=${gradeId}` : ''}${groupId ? `&groupId=${groupId}` : ''}`;

  const drillSection = (k: KV) => {
    const s = structure.data?.find((x) => x.name === k.key);
    if (s) {
      setSectionId(s.id);
      setGradeId('');
      setGroupId('');
    }
  };
  const drillGrade = (k: KV) => {
    const g = structure.data?.flatMap((s) => s.grades.map((gr) => ({ ...gr, sectionId: s.id }))).find((x) => x.name === k.key);
    if (g) {
      setSectionId(g.sectionId);
      setGradeId(g.id);
      setGroupId('');
    }
  };

  const heat = useMemo(() => {
    const hours = Array.from({ length: 10 }, (_, i) => i + 7);
    const map = new Map((d?.heatmap ?? []).map((c) => [`${c.dow}-${c.hour}`, c.count]));
    const max = Math.max(1, ...(d?.heatmap ?? []).map((c) => c.count));
    return { hours, map, max };
  }, [d?.heatmap]);
  const heatColor = (v: number) => {
    if (!v) return 'var(--card-muted)';
    const r = v / heat.max;
    return r > 0.8 ? 'var(--viz-seq-700)' : r > 0.6 ? 'var(--viz-seq-550)' : r > 0.4 ? 'var(--viz-seq-400)' : r > 0.2 ? 'var(--viz-seq-250)' : 'var(--viz-seq-100)';
  };
  const delta = d?.comparison ? d.totals.encounters - d.comparison.encounters : null;

  return (
    <div>
      <PageHeader
        title="Estadísticas"
        description={d?.anonymized ? 'Datos agregados y anónimos según su perfil.' : 'Indicadores de enfermería escolar.'}
        actions={
          <div className="flex flex-wrap gap-2">
            {(['csv', 'xlsx', 'pdf'] as const).map((f) => (
              <Button key={f} variant="outline" size="sm" onClick={() => openFile(`/stats/export/${f === 'pdf' ? 'encounters' : 'encounters'}?format=${f}&${exportQs}`, `atenciones-${from}.${f}`)}>
                <Download className="h-4 w-4" /> {f.toUpperCase()}
              </Button>
            ))}
            {can(me, 'stats:clinical') && (
              <Button variant="ghost" size="sm" onClick={() => openFile(`/stats/export/passes?format=xlsx&${exportQs}`, `pases-${from}.xlsx`)}>
                Pases (XLSX)
              </Button>
            )}
          </div>
        }
      />

      {/* Filters: one row above the charts */}
      <Card className="mb-5 flex flex-wrap items-center gap-2 p-3">
        <div className="flex gap-1 rounded-xl bg-card-muted p-1" role="group" aria-label="Rango rápido">
          {PRESETS.map((p) => {
            const active = from === addDaysIso(todayIso(), -(p.days - 1)) && to === todayIso();
            return (
              <button key={p.days} onClick={() => { setFrom(addDaysIso(todayIso(), -(p.days - 1))); setTo(todayIso()); }} className={cn('min-h-9 rounded-lg px-3 text-sm', active ? 'bg-card font-semibold shadow-sm' : 'text-muted')} aria-pressed={active}>
                {p.label}
              </button>
            );
          })}
        </div>
        <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="h-10 w-40" aria-label="Desde" />
        <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="h-10 w-40" aria-label="Hasta" />
        <Select value={sectionId} onChange={(e) => { setSectionId(e.target.value); setGradeId(''); setGroupId(''); }} className="h-10 w-44" aria-label="Sección">
          <option value="">Todas las secciones</option>
          {structure.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
        <Select value={gradeId} onChange={(e) => { setGradeId(e.target.value); setGroupId(''); }} disabled={!section} className="h-10 w-40" aria-label="Grado">
          <option value="">Todos los grados</option>
          {section?.grades.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </Select>
        <Select value={groupId} onChange={(e) => setGroupId(e.target.value)} disabled={!grade} className="h-10 w-36" aria-label="Grupo">
          <option value="">Todos</option>
          {grade?.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </Select>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4 accent-primary-700" checked={compare} onChange={(e) => setCompare(e.target.checked)} /> Comparar con el año anterior
        </label>
        {(sectionId || gradeId || groupId) && (
          <Button size="sm" variant="ghost" onClick={() => { setSectionId(''); setGradeId(''); setGroupId(''); }}>
            Quitar filtros
          </Button>
        )}
      </Card>

      {q.isLoading || !d ? (
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-40" />)}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <StatCard label="Atenciones" value={fmtNumber(d.totals.encounters)} icon={<HeartPulse />} tone="primary" hint={delta !== null ? `${delta >= 0 ? '+' : ''}${delta} vs. ${d.comparison!.from.slice(0, 4)}` : `${d.totals.staff} a personal`} />
            <StatCard label="Estudiantes atendidos" value={fmtNumber(d.totals.students)} icon={<Users />} />
            <StatCard label="Accidentes" value={fmtNumber(d.totals.accidents)} icon={<AlertTriangle />} tone="warning" />
            <StatCard label="Retiros por acudiente" value={fmtNumber(d.totals.pickups)} icon={<Activity />} />
            <StatCard label="Traslados a IPS" value={fmtNumber(d.totals.transfers)} icon={<Truck />} tone={d.totals.transfers ? 'danger' : 'neutral'} />
            <StatCard label="Adherencia medicación" value={d.medication.adherencePct !== null ? `${d.medication.adherencePct}%` : '—'} icon={<Pill />} tone="success" hint={`${d.medication.given} dosis dadas`} />
          </div>

          <ChartCard title="Atenciones por día" table={{ head: ['Día', 'Atenciones'], rows: d.byDay.map((r) => [r.day, r.count]) }}>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={d.byDay} margin={{ left: -24, right: 8, top: 8 }}>
                  <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
                  <XAxis dataKey="day" tickFormatter={(v: string) => v.slice(5)} fontSize={11} stroke="var(--viz-axis)" tickLine={false} axisLine={false} minTickGap={24} />
                  <YAxis fontSize={11} stroke="var(--viz-axis)" tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: 'var(--viz-axis)', strokeDasharray: '3 3' }} formatter={(v: number) => [v, 'Atenciones']} />
                  <Line type="monotone" dataKey="count" stroke="var(--viz-series-1)" strokeWidth={2} dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: 'var(--card)' }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Motivos más frecuentes" table={{ head: ['Motivo', 'Atenciones'], rows: d.byMotive.map((r) => [r.label, r.count]) }}>
              <RankBars data={d.byMotive} />
            </ChartCard>
            <ChartCard title="Diagnósticos principales (CIE-10)" table={{ head: ['Diagnóstico', 'Atenciones'], rows: d.byDiagnosis.map((r) => [r.label, r.count]) }}>
              <RankBars data={d.byDiagnosis} />
            </ChartCard>
            <ChartCard title="Por sección" description="Toque una barra para filtrar" table={{ head: ['Sección', 'Atenciones'], rows: d.bySection.map((r) => [r.label, r.count]) }}>
              <RankBars data={d.bySection} onSelect={drillSection} />
            </ChartCard>
            <ChartCard title={gradeId ? 'Por grupo' : 'Por grado'} description={gradeId ? undefined : 'Toque una barra para filtrar'} table={{ head: ['Grado/grupo', 'Atenciones'], rows: (gradeId ? d.byGroup : d.byGrade).map((r) => [r.label, r.count]) }}>
              <RankBars data={gradeId ? d.byGroup : d.byGrade} onSelect={gradeId ? undefined : drillGrade} max={15} />
            </ChartCard>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Franja horaria" table={{ head: ['Hora', 'Atenciones'], rows: d.byHour.map((r) => [`${r.hour}:00`, r.count]) }}>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={d.byHour} margin={{ left: -24, right: 8, top: 8 }} barCategoryGap={2}>
                    <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
                    <XAxis dataKey="hour" tickFormatter={(h: number) => `${h}h`} fontSize={11} stroke="var(--viz-axis)" tickLine={false} axisLine={false} />
                    <YAxis fontSize={11} stroke="var(--viz-axis)" tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--card-muted)' }} labelFormatter={(h) => `${h}:00`} formatter={(v: number) => [v, 'Atenciones']} />
                    <Bar dataKey="count" fill="var(--viz-series-1)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>
            <ChartCard title="Mapa de calor: día × hora" table={{ head: ['Día', 'Hora', 'Atenciones'], rows: d.heatmap.map((c) => [DOW[c.dow - 1], `${c.hour}:00`, c.count]) }}>
              <div className="overflow-x-auto">
                <div className="grid min-w-[420px] gap-[2px]" style={{ gridTemplateColumns: `2.5rem repeat(${heat.hours.length}, minmax(0,1fr))` }}>
                  <span />
                  {heat.hours.map((h) => <span key={h} className="tabular text-center text-[11px] text-muted">{h}h</span>)}
                  {DOW.slice(0, 5).map((day, di) => (
                    <Row key={day} label={day}>
                      {heat.hours.map((h) => {
                        const v = heat.map.get(`${di + 1}-${h}`) ?? 0;
                        return <span key={h} className="h-8 rounded-[4px]" style={{ background: heatColor(v) }} title={`${day} ${h}:00 — ${v} atenciones`} aria-label={`${day} ${h}:00: ${v}`} />;
                      })}
                    </Row>
                  ))}
                </div>
                <div className="mt-2 flex items-center gap-2 text-[11px] text-muted">
                  Menos
                  {['--viz-seq-100', '--viz-seq-250', '--viz-seq-400', '--viz-seq-550', '--viz-seq-700'].map((c) => <span key={c} className="h-3 w-5 rounded-[3px]" style={{ background: `var(${c})` }} />)}
                  Más
                </div>
              </div>
            </ChartCard>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <ChartCard title="Accidentalidad por lugar" table={{ head: ['Lugar', 'Accidentes', 'Moderados/graves'], rows: d.byZone.map((z) => [z.label, z.count, z.severe]) }}>
              <RankBars data={d.byZone} />
              {d.byZone.some((z) => z.severe > 0) && (
                <p className="mt-3 flex flex-wrap gap-1 text-xs">
                  {d.byZone.filter((z) => z.severe).map((z) => <Badge key={z.key} tone="danger"><AlertTriangle className="h-3 w-3" /> {z.label}: {z.severe} moderados/graves</Badge>)}
                </p>
              )}
            </ChartCard>
            <ChartCard title="Conducta" table={{ head: ['Conducta', 'Atenciones'], rows: d.byDisposition.map((r) => [r.label, r.count]) }}>
              <RankBars data={d.byDisposition} />
            </ChartCard>
            <ChartCard title="Pases por docente" table={{ head: ['Docente', 'Pases'], rows: d.byTeacher.map((r) => [r.key, r.count]) }}>
              <RankBars data={d.byTeacher.map((t) => ({ key: t.key, label: t.key, count: t.count }))} />
            </ChartCard>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Clock className="h-4 w-4" /> Tiempos (minutos)</CardTitle>
              </CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted"><tr><th className="py-1">Etapa</th><th className="text-right">Promedio</th><th className="text-right">Mediana</th></tr></thead>
                  <tbody>
                    {([['transit', 'Tránsito aula → enfermería'], ['wait', 'Espera para atención'], ['care', 'Atención'], ['pickup', 'Hasta recogida por acudiente'], ['total', 'Total del pase']] as const).map(([k, l]) => (
                      <tr key={k} className="border-t border-border">
                        <td className="py-1.5">{l}</td>
                        <td className="tabular text-right">{d.times[k].avg ?? '—'}</td>
                        <td className="tabular text-right">{d.times[k].median ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Estudiantes frecuentes</CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="flex flex-col gap-1 text-sm">
                  {d.frequent.map((f, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <span className="tabular w-5 text-muted">{i + 1}</span>
                      <span className="flex-1 truncate">{f.name}</span>
                      <span className="text-xs text-muted">{f.group}</span>
                      <span className="tabular font-semibold">{f.count}</span>
                    </li>
                  ))}
                </ol>
                {d.anonymized && <p className="mt-2 text-xs text-muted">Nombres ocultos por no tener permiso clínico.</p>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Medicación, inventario y cumplimiento</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-sm">
                <Meter label="Fichas actualizadas este año" value={d.compliance.profilesUpdatedPct} />
                <Meter label="Consentimientos obligatorios completos" value={d.compliance.consentsCompletePct} />
                <Meter label="Vacunación registrada" value={d.compliance.vaccinationRegisteredPct} />
                <dl className="grid grid-cols-[1fr_auto] gap-y-1 border-t border-border pt-3">
                  <dt className="text-muted">Dosis no administradas</dt><dd className="tabular">{d.medication.notGiven}</dd>
                  <dt className="text-muted">Costo de insumos consumidos</dt><dd className="tabular">{fmtMoney(d.inventory.consumedCost)}</dd>
                  <dt className="text-muted">Lotes vencidos bloqueados</dt><dd className="tabular">{d.inventory.expiredBatches}</dd>
                </dl>
              </CardContent>
            </Card>
          </div>
          {d.medication.top.length > 0 && (
            <ChartCard title="Medicamentos más administrados" table={{ head: ['Medicamento', 'Dosis'], rows: d.medication.top.map((r) => [r.label, r.count]) }}>
              <RankBars data={d.medication.top} />
            </ChartCard>
          )}
          {d.anonymized && <Alert tone="info">Vista para directivos: agregación anónima, sin datos clínicos individuales.</Alert>}
        </div>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <span className="self-center text-[11px] text-muted">{label}</span>
      {children}
    </>
  );
}

function Meter({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="mb-1 flex justify-between"><span>{label}</span><span className="tabular font-semibold">{value}%</span></div>
      <div className="h-2 rounded-full bg-card-muted" role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className="h-full rounded-full" style={{ width: `${value}%`, background: 'var(--viz-series-1)' }} />
      </div>
    </div>
  );
}
