'use client';

import {
  ALLERGY_CATEGORY_LABELS,
  ALLERGY_SEVERITY_LABELS,
  BLOOD_TYPES,
  COMMON_CONDITIONS,
  SCREENING_TYPE_LABELS,
  VACCINES_PAI_CO,
} from '@sgee/shared';
import { Alert, Badge, Button, Card, CardContent, CardHeader, CardTitle, Checkbox, cn, Field, FileDropzone, Input, Progress, Select, Skeleton, Textarea } from '@sgee/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Circle, FileText, Plus, ShieldAlert } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { toast } from 'sonner';
import { api, openFile } from '@/lib/api';
import { fmtDate } from '@/lib/format';
import { Dialog } from './dialog';

interface Profile {
  studentId: string;
  personId: string;
  sex: string | null;
  birthDate: string | null;
  profile: {
    bloodType: string | null;
    eps: string | null;
    prepaidPlan: string | null;
    accidentInsurance: string | null;
    accidentPolicyNumber: string | null;
    preferredIps: string | null;
    physicalActivityRestrictions: string | null;
    dietaryRestrictions: string | null;
    generalNotes: string | null;
    lastGuardianUpdateAt: string | null;
    version: number;
  } | null;
  completeness: { pct: number; items: { key: string; label: string; done: boolean }[] };
  allergies: { id: string; category: string; agent: string; severity: string; reaction: string | null; requiresEpinephrine: boolean; verified: boolean; active: boolean; annulReason: string | null }[];
  conditions: { id: string; name: string; icd10Code: string | null; critical: boolean; active: boolean; treatingPhysician: string | null; notes: string | null }[];
  carePlans: { id: string; title: string; steps: string[]; rescueMedications: string[]; approvedAt: string | null; active: boolean }[];
  immunizations: { id: string; vaccine: string; doseLabel: string; administeredOn: string; verified: boolean }[];
  homeMedications: { id: string; name: string; dose: string; schedule: string }[];
  devices: { id: string; type: string; description: string; location: string | null }[];
  surgicalHistory: { id: string; kind: string; description: string; date: string | null }[];
  disabilities: { id: string; description: string; hasPiar: boolean; supports: string | null }[];
  anthropometrics: { id: string; measuredAt: string; weightKg: number; heightCm: number; bmi: number | null; bmiZ: number | null; bmiPercentile: number | null; heightZ: number | null; classification: string | null }[];
  screenings: { id: string; type: string; performedOn: string; result: string; referral: string | null }[];
  documents: { id: string; fileId: string; kind: string; title: string; expiresOn: string | null; createdAt: string }[];
}

const CLASSIFICATION: Record<string, { label: string; tone: 'success' | 'warning' | 'danger' }> = {
  NORMAL: { label: 'Adecuado', tone: 'success' },
  RISK_OVERWEIGHT: { label: 'Riesgo de sobrepeso', tone: 'warning' },
  OVERWEIGHT: { label: 'Sobrepeso', tone: 'warning' },
  OBESITY: { label: 'Obesidad', tone: 'danger' },
  RISK_THINNESS: { label: 'Riesgo de delgadez', tone: 'warning' },
  THINNESS: { label: 'Delgadez', tone: 'danger' },
  SEVERE_THINNESS: { label: 'Delgadez severa', tone: 'danger' },
  RISK_WASTING: { label: 'Riesgo de desnutrición', tone: 'warning' },
  WASTING: { label: 'Desnutrición aguda', tone: 'danger' },
  SEVERE_WASTING: { label: 'Desnutrición aguda severa', tone: 'danger' },
};

function Block({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>{title}</CardTitle>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function HealthProfileEditor({ studentId, mode }: { studentId: string; mode: 'clinical' | 'guardian' }) {
  const qc = useQueryClient();
  const key = ['health-profile', studentId];
  const q = useQuery({ queryKey: key, queryFn: () => api<Profile>(`/students/${studentId}/health-profile`) });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: key });
    qc.invalidateQueries({ queryKey: ['student', studentId] });
    qc.invalidateQueries({ queryKey: ['portal-home'] });
  };
  const clinical = mode === 'clinical';
  const [dialog, setDialog] = useState<null | 'allergy' | 'condition' | 'vaccine' | 'anthropo' | 'screening' | 'document' | 'homeMed' | 'device' | 'surgical'>(null);

  const [form, setForm] = useState<Record<string, string>>({});
  useEffect(() => {
    const p = q.data?.profile;
    setForm({
      bloodType: p?.bloodType ?? '',
      eps: p?.eps ?? '',
      prepaidPlan: p?.prepaidPlan ?? '',
      accidentInsurance: p?.accidentInsurance ?? '',
      accidentPolicyNumber: p?.accidentPolicyNumber ?? '',
      preferredIps: p?.preferredIps ?? '',
      physicalActivityRestrictions: p?.physicalActivityRestrictions ?? '',
      dietaryRestrictions: p?.dietaryRestrictions ?? '',
      generalNotes: p?.generalNotes ?? '',
    });
  }, [q.data?.profile]);
  const saveProfile = useMutation({
    mutationFn: () => api(`/students/${studentId}/health-profile`, { method: 'PUT', body: Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v === '' ? null : v])) }),
    onSuccess: () => {
      toast.success('Ficha actualizada');
      refresh();
    },
  });
  const annul = useMutation({
    mutationFn: (v: { kind: 'allergies' | 'conditions'; id: string; reason: string }) => api(`/${v.kind}/${v.id}/annul`, { body: { reason: v.reason } }),
    onSuccess: refresh,
  });
  const verify = useMutation({ mutationFn: (id: string) => api(`/allergies/${id}/verify`, { method: 'POST' }), onSuccess: refresh });

  if (q.isLoading || !q.data) return <Skeleton className="h-96" />;
  const d = q.data;
  const growth = d.anthropometrics.map((a) => ({ date: fmtDate(a.measuredAt, { month: 'short', year: '2-digit' }), bmiZ: a.bmiZ, heightZ: a.heightZ, bmi: a.bmi }));

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-48 flex-1">
            <p className="text-sm font-medium">Completitud de la ficha</p>
            <Progress value={d.completeness.pct} tone={d.completeness.pct >= 80 ? 'success' : d.completeness.pct >= 50 ? 'warning' : 'danger'} className="mt-2" label="Completitud" />
          </div>
          <span className="tabular text-2xl font-semibold">{d.completeness.pct}%</span>
          {d.profile?.lastGuardianUpdateAt && <span className="text-xs text-muted">Actualizada por el acudiente el {fmtDate(d.profile.lastGuardianUpdateAt)}</span>}
        </div>
        <ul className="mt-3 grid gap-1 text-sm sm:grid-cols-2">
          {d.completeness.items.map((i) => (
            <li key={i.key} className={cn('flex items-center gap-2', i.done ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted')}>
              {i.done ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />} {i.label}
            </li>
          ))}
        </ul>
      </Card>

      <Block title="Datos generales y aseguramiento">
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Grupo sanguíneo y RH">
            <Select value={form.bloodType} onChange={(e) => setForm({ ...form, bloodType: e.target.value })}>
              <option value="">No sabe</option>
              {BLOOD_TYPES.map((b) => (
                <option key={b}>{b}</option>
              ))}
            </Select>
          </Field>
          <Field label="EPS / aseguradora">
            <Input value={form.eps} onChange={(e) => setForm({ ...form, eps: e.target.value })} />
          </Field>
          <Field label="Medicina prepagada">
            <Input value={form.prepaidPlan} onChange={(e) => setForm({ ...form, prepaidPlan: e.target.value })} />
          </Field>
          <Field label="Póliza de accidentes">
            <Input value={form.accidentInsurance} onChange={(e) => setForm({ ...form, accidentInsurance: e.target.value })} />
          </Field>
          <Field label="Número de póliza">
            <Input value={form.accidentPolicyNumber} onChange={(e) => setForm({ ...form, accidentPolicyNumber: e.target.value })} />
          </Field>
          <Field label="IPS preferida">
            <Input value={form.preferredIps} onChange={(e) => setForm({ ...form, preferredIps: e.target.value })} />
          </Field>
          <Field label="Restricciones de actividad física" className="md:col-span-3">
            <Textarea rows={2} value={form.physicalActivityRestrictions} onChange={(e) => setForm({ ...form, physicalActivityRestrictions: e.target.value })} />
          </Field>
          <Field label="Restricciones alimentarias" className="md:col-span-3">
            <Textarea rows={2} value={form.dietaryRestrictions} onChange={(e) => setForm({ ...form, dietaryRestrictions: e.target.value })} />
          </Field>
        </div>
        <div className="mt-3 flex justify-end">
          <Button onClick={() => saveProfile.mutate()} loading={saveProfile.isPending}>
            Guardar datos
          </Button>
        </div>
      </Block>

      <div className="grid gap-4 lg:grid-cols-2">
        <Block
          title="Alergias"
          action={
            <Button size="sm" variant="outline" onClick={() => setDialog('allergy')}>
              <Plus className="h-4 w-4" /> Agregar
            </Button>
          }
        >
          {d.allergies.filter((a) => a.active).length === 0 && <p className="text-sm text-muted">Sin alergias registradas.</p>}
          <ul className="flex flex-col gap-2">
            {d.allergies.map((a) => (
              <li key={a.id} className={cn('rounded-xl border p-3', a.active ? (['SEVERE', 'ANAPHYLAXIS'].includes(a.severity) ? 'border-red-300 bg-red-50/60 dark:border-red-900 dark:bg-red-950/30' : 'border-border') : 'border-dashed border-border opacity-60')}>
                <div className="flex flex-wrap items-center gap-2">
                  {a.severity === 'ANAPHYLAXIS' && <ShieldAlert className="h-4 w-4 text-red-600" />}
                  <span className="font-medium">{a.agent}</span>
                  <Badge tone={['SEVERE', 'ANAPHYLAXIS'].includes(a.severity) ? 'danger' : 'warning'}>{ALLERGY_SEVERITY_LABELS[a.severity as 'MILD']}</Badge>
                  <Badge tone="neutral">{ALLERGY_CATEGORY_LABELS[a.category as 'FOOD']}</Badge>
                  {a.requiresEpinephrine && <Badge tone="solidDanger">Epinefrina</Badge>}
                  {!a.verified && a.active && <Badge tone="info">Por verificar</Badge>}
                  {!a.active && <Badge tone="neutral">Anulada</Badge>}
                </div>
                {a.reaction && <p className="mt-1 text-sm text-muted">{a.reaction}</p>}
                {clinical && a.active && (
                  <div className="mt-2 flex gap-2">
                    {!a.verified && (
                      <Button size="sm" variant="outline" onClick={() => verify.mutate(a.id)}>
                        Verificar
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        const reason = window.prompt('Motivo de la anulación (mínimo 10 caracteres)');
                        if (reason && reason.length >= 10) annul.mutate({ kind: 'allergies', id: a.id, reason });
                      }}
                    >
                      Anular
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Block>

        <Block
          title="Condiciones crónicas y planes de acción"
          action={
            <Button size="sm" variant="outline" onClick={() => setDialog('condition')}>
              <Plus className="h-4 w-4" /> Agregar
            </Button>
          }
        >
          {d.conditions.filter((c) => c.active).length === 0 && <p className="text-sm text-muted">Sin condiciones registradas.</p>}
          <ul className="flex flex-col gap-2">
            {d.conditions
              .filter((c) => c.active)
              .map((c) => (
                <li key={c.id} className="rounded-xl border border-border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{c.name}</span>
                    {c.icd10Code && <Badge tone="neutral">{c.icd10Code}</Badge>}
                    {c.critical && <Badge tone="violet">Crítica</Badge>}
                  </div>
                  {c.treatingPhysician && <p className="text-sm text-muted">Médico tratante: {c.treatingPhysician}</p>}
                </li>
              ))}
          </ul>
          {d.carePlans
            .filter((p) => p.active)
            .map((p) => (
              <details key={p.id} className="mt-3 rounded-xl border border-violet-200 p-3 dark:border-violet-900">
                <summary className="cursor-pointer font-medium">
                  {p.title} {p.approvedAt ? <Badge tone="success">Aprobado por médico</Badge> : <Badge tone="warning">Pendiente de aprobación</Badge>}
                </summary>
                <ol className="mt-2 list-decimal pl-5 text-sm">
                  {p.steps.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ol>
                {p.rescueMedications.length > 0 && <p className="mt-2 text-sm">Rescate: {p.rescueMedications.join(', ')}</p>}
              </details>
            ))}
        </Block>

        <Block
          title="Vacunación"
          action={
            <Button size="sm" variant="outline" onClick={() => setDialog('vaccine')}>
              <Plus className="h-4 w-4" /> Agregar
            </Button>
          }
        >
          {d.immunizations.length === 0 && <p className="text-sm text-muted">Sin vacunas registradas. Suba el carné de vacunación en Documentos.</p>}
          <ul className="divide-y divide-border text-sm">
            {d.immunizations.map((v) => (
              <li key={v.id} className="flex items-center gap-2 py-2">
                <span className="flex-1">
                  {v.vaccine} · {v.doseLabel}
                </span>
                <span className="text-muted">{fmtDate(v.administeredOn)}</span>
                {v.verified ? <Badge tone="success">Verificada</Badge> : <Badge tone="neutral">Reportada</Badge>}
              </li>
            ))}
          </ul>
        </Block>

        <Block
          title="Documentos y soportes"
          action={
            <Button size="sm" variant="outline" onClick={() => setDialog('document')}>
              <Plus className="h-4 w-4" /> Subir
            </Button>
          }
        >
          {d.documents.length === 0 && <p className="text-sm text-muted">Sin documentos.</p>}
          <ul className="flex flex-col gap-1 text-sm">
            {d.documents.map((doc) => (
              <li key={doc.id}>
                <button onClick={() => openFile(`/files/${doc.fileId}`)} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-card-muted">
                  <FileText className="h-4 w-4 text-muted" />
                  <span className="flex-1">{doc.title}</span>
                  {doc.expiresOn && <Badge tone={new Date(doc.expiresOn) < new Date() ? 'danger' : 'neutral'}>Vence {fmtDate(doc.expiresOn)}</Badge>}
                </button>
              </li>
            ))}
          </ul>
        </Block>

        <Block
          title="Medicamentos en casa, dispositivos y antecedentes"
          action={
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => setDialog('homeMed')}>
                + Medicamento
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setDialog('device')}>
                + Dispositivo
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setDialog('surgical')}>
                + Antecedente
              </Button>
            </div>
          }
        >
          <ul className="flex flex-col gap-1 text-sm">
            {d.homeMedications.map((m) => (
              <li key={m.id}>
                💊 {m.name} · {m.dose} · {m.schedule}
              </li>
            ))}
            {d.devices.map((m) => (
              <li key={m.id}>
                🩺 {m.description} {m.location && `· ${m.location}`}
              </li>
            ))}
            {d.surgicalHistory.map((m) => (
              <li key={m.id}>
                🏥 {m.kind === 'SURGERY' ? 'Cirugía' : 'Hospitalización'}: {m.description} {m.date && `(${fmtDate(m.date)})`}
              </li>
            ))}
            {d.disabilities.map((m) => (
              <li key={m.id}>
                ♿ {m.description} {m.hasPiar && <Badge tone="info">PIAR</Badge>}
              </li>
            ))}
            {!d.homeMedications.length && !d.devices.length && !d.surgicalHistory.length && !d.disabilities.length && <li className="text-muted">Sin registros.</li>}
          </ul>
        </Block>

        {clinical && (
          <Block
            title="Crecimiento (OMS)"
            action={
              <Button size="sm" variant="outline" onClick={() => setDialog('anthropo')}>
                <Plus className="h-4 w-4" /> Medición
              </Button>
            }
          >
            {d.anthropometrics.length === 0 ? (
              <p className="text-sm text-muted">Sin mediciones.</p>
            ) : (
              <>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={growth} margin={{ left: -20, right: 8, top: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="date" fontSize={11} stroke="var(--muted)" />
                      <YAxis domain={[-3, 3]} fontSize={11} stroke="var(--muted)" />
                      <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12 }} />
                      <ReferenceLine y={2} stroke="#d97706" strokeDasharray="4 4" />
                      <ReferenceLine y={-2} stroke="#d97706" strokeDasharray="4 4" />
                      <ReferenceLine y={0} stroke="var(--muted)" />
                      <Line type="monotone" dataKey="bmiZ" name="IMC (z)" stroke="#0d8177" strokeWidth={2} dot />
                      <Line type="monotone" dataKey="heightZ" name="Talla (z)" stroke="#7c3aed" strokeWidth={2} dot />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <ul className="mt-2 divide-y divide-border text-sm">
                  {[...d.anthropometrics].reverse().map((a) => (
                    <li key={a.id} className="flex flex-wrap items-center gap-2 py-2">
                      <span className="w-24 text-muted">{fmtDate(a.measuredAt)}</span>
                      <span className="tabular">
                        {a.weightKg} kg · {a.heightCm} cm · IMC {a.bmi}
                      </span>
                      {a.bmiPercentile !== null && <span className="tabular text-muted">P{Math.round(a.bmiPercentile)}</span>}
                      {a.classification && <Badge tone={CLASSIFICATION[a.classification]?.tone ?? 'neutral'}>{CLASSIFICATION[a.classification]?.label ?? a.classification}</Badge>}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Block>
        )}

        {clinical && (
          <Block
            title="Tamizajes"
            action={
              <Button size="sm" variant="outline" onClick={() => setDialog('screening')}>
                <Plus className="h-4 w-4" /> Registrar
              </Button>
            }
          >
            {d.screenings.length === 0 && <p className="text-sm text-muted">Sin tamizajes.</p>}
            <ul className="divide-y divide-border text-sm">
              {d.screenings.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-2 py-2">
                  <span className="flex-1">{SCREENING_TYPE_LABELS[s.type as 'VISUAL']}</span>
                  <span className="text-muted">{fmtDate(s.performedOn)}</span>
                  <Badge tone={s.result === 'NORMAL' ? 'success' : s.result === 'ABNORMAL' ? 'danger' : 'warning'}>{{ NORMAL: 'Normal', ABNORMAL: 'Alterado', INCONCLUSIVE: 'No concluyente' }[s.result]}</Badge>
                  {s.referral && <span className="w-full text-xs text-muted">{s.referral}</span>}
                </li>
              ))}
            </ul>
          </Block>
        )}
      </div>

      {dialog && <AddDialog kind={dialog} studentId={studentId} clinical={clinical} onClose={() => setDialog(null)} onDone={() => { setDialog(null); refresh(); }} />}
    </div>
  );
}

function AddDialog({ kind, studentId, clinical, onClose, onDone }: { kind: string; studentId: string; clinical: boolean; onClose: () => void; onDone: () => void }) {
  const [v, setV] = useState<Record<string, string | boolean>>({ severity: 'MODERATE', category: 'FOOD', result: 'NORMAL', type: 'VISUAL', kind: 'SURGERY', deviceType: 'INHALER', docKind: 'MEDICAL_CERTIFICATE', doseLabel: 'Única' });
  const [file, setFile] = useState<File | null>(null);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
  const s = (k: string) => (v[k] as string) ?? '';
  const set = (k: string, val: string | boolean) => setV((o) => ({ ...o, [k]: val }));
  const mut = useMutation({
    mutationFn: async () => {
      const base = `/students/${studentId}`;
      switch (kind) {
        case 'allergy':
          return api(`${base}/allergies`, { body: { category: s('category'), agent: s('agent'), severity: s('severity'), reaction: s('reaction') || null, requiresEpinephrine: !!v.epi } });
        case 'condition':
          return api(`${base}/conditions`, { body: { name: s('name'), icd10Code: COMMON_CONDITIONS.find((c) => c.name === s('name'))?.icd10 ?? null, critical: !!v.critical || !!COMMON_CONDITIONS.find((c) => c.name === s('name'))?.critical, treatingPhysician: s('physician') || null, notes: s('notes') || null, carePlan: s('steps') ? { steps: s('steps').split('\n').filter(Boolean), rescueMedications: s('rescue') ? s('rescue').split(',').map((x) => x.trim()) : [], triggers: [], symptoms: [], contacts: [] } : null } });
        case 'vaccine':
          return api(`${base}/immunizations`, { body: { vaccine: s('vaccine'), doseLabel: s('doseLabel'), administeredOn: s('date') || today } });
        case 'anthropo':
          return api(`${base}/anthropometrics`, { body: { measuredAt: s('date') || today, weightKg: Number(s('weight')), heightCm: Number(s('height')) } });
        case 'screening':
          return api(`${base}/screenings`, { body: { type: s('type'), performedOn: s('date') || today, result: s('result'), referral: s('referral') || null, details: {} } });
        case 'homeMed':
          return api(`${base}/home-medications`, { body: { name: s('name'), dose: s('dose'), schedule: s('schedule') } });
        case 'device':
          return api(`${base}/devices`, { body: { type: s('deviceType'), description: s('description'), location: s('location') || null } });
        case 'surgical':
          return api(`${base}/surgical-history`, { body: { kind: s('kind'), description: s('description'), date: s('date') || null } });
        case 'document': {
          if (!file) throw new Error('Seleccione un archivo');
          const fd = new FormData();
          fd.append('file', file);
          fd.append('kind', s('docKind'));
          fd.append('title', s('title') || file.name);
          if (s('expires')) fd.append('expiresOn', s('expires'));
          return api(`${base}/documents`, { form: fd });
        }
      }
    },
    onSuccess: () => {
      toast.success('Guardado');
      onDone();
    },
  });
  const titles: Record<string, string> = { allergy: 'Nueva alergia', condition: 'Nueva condición', vaccine: 'Registrar vacuna', anthropo: 'Peso y talla', screening: 'Tamizaje', document: 'Subir documento', homeMed: 'Medicamento en casa', device: 'Dispositivo médico', surgical: 'Antecedente' };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={titles[kind]} footer={<Button onClick={() => mut.mutate()} loading={mut.isPending}>Guardar</Button>}>
      <div className="grid gap-3 sm:grid-cols-2">
        {kind === 'allergy' && (
          <>
            <Field label="Tipo">
              <Select value={s('category')} onChange={(e) => set('category', e.target.value)}>
                {Object.entries(ALLERGY_CATEGORY_LABELS).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="¿A qué?" required>
              <Input value={s('agent')} onChange={(e) => set('agent', e.target.value)} placeholder="Ej.: maní, penicilina" />
            </Field>
            <Field label="Severidad">
              <Select value={s('severity')} onChange={(e) => set('severity', e.target.value)}>
                {Object.entries(ALLERGY_SEVERITY_LABELS).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Reacción">
              <Input value={s('reaction')} onChange={(e) => set('reaction', e.target.value)} />
            </Field>
            <Checkbox className="sm:col-span-2" label="Tiene autoinyector de epinefrina / requiere epinefrina" checked={!!v.epi} onChange={(e) => set('epi', e.target.checked)} />
            {!clinical && <Alert tone="info" className="sm:col-span-2">Enfermería verificará la información registrada.</Alert>}
          </>
        )}
        {kind === 'condition' && (
          <>
            <Field label="Condición" required className="sm:col-span-2">
              <Input list="conditions" value={s('name')} onChange={(e) => set('name', e.target.value)} />
              <datalist id="conditions">
                {COMMON_CONDITIONS.map((c) => (
                  <option key={c.name} value={c.name} />
                ))}
              </datalist>
            </Field>
            <Field label="Médico tratante">
              <Input value={s('physician')} onChange={(e) => set('physician', e.target.value)} />
            </Field>
            <Checkbox label="Condición crítica (riesgo vital)" checked={!!v.critical} onChange={(e) => set('critical', e.target.checked)} />
            <Field label="Plan de acción: pasos (uno por línea)" className="sm:col-span-2">
              <Textarea rows={4} value={s('steps')} onChange={(e) => set('steps', e.target.value)} />
            </Field>
            <Field label="Medicamentos de rescate (separados por coma)" className="sm:col-span-2">
              <Input value={s('rescue')} onChange={(e) => set('rescue', e.target.value)} />
            </Field>
          </>
        )}
        {kind === 'vaccine' && (
          <>
            <Field label="Vacuna" required>
              <Select value={s('vaccine')} onChange={(e) => set('vaccine', e.target.value)}>
                <option value="">Seleccione…</option>
                {VACCINES_PAI_CO.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </Select>
            </Field>
            <Field label="Dosis">
              <Input value={s('doseLabel')} onChange={(e) => set('doseLabel', e.target.value)} />
            </Field>
            <Field label="Fecha">
              <Input type="date" max={today} value={s('date')} onChange={(e) => set('date', e.target.value)} />
            </Field>
          </>
        )}
        {kind === 'anthropo' && (
          <>
            <Field label="Peso (kg)" required>
              <Input type="number" inputMode="decimal" step="0.1" value={s('weight')} onChange={(e) => set('weight', e.target.value)} />
            </Field>
            <Field label="Talla (cm)" required>
              <Input type="number" inputMode="decimal" step="0.1" value={s('height')} onChange={(e) => set('height', e.target.value)} />
            </Field>
            <Field label="Fecha">
              <Input type="date" max={today} value={s('date')} onChange={(e) => set('date', e.target.value)} />
            </Field>
          </>
        )}
        {kind === 'screening' && (
          <>
            <Field label="Tipo">
              <Select value={s('type')} onChange={(e) => set('type', e.target.value)}>
                {Object.entries(SCREENING_TYPE_LABELS).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Resultado">
              <Select value={s('result')} onChange={(e) => set('result', e.target.value)}>
                <option value="NORMAL">Normal</option>
                <option value="ABNORMAL">Alterado</option>
                <option value="INCONCLUSIVE">No concluyente</option>
              </Select>
            </Field>
            <Field label="Fecha">
              <Input type="date" max={today} value={s('date')} onChange={(e) => set('date', e.target.value)} />
            </Field>
            <Field label="Remisión">
              <Input value={s('referral')} onChange={(e) => set('referral', e.target.value)} />
            </Field>
          </>
        )}
        {kind === 'homeMed' && (
          <>
            <Field label="Medicamento" required>
              <Input value={s('name')} onChange={(e) => set('name', e.target.value)} />
            </Field>
            <Field label="Dosis">
              <Input value={s('dose')} onChange={(e) => set('dose', e.target.value)} />
            </Field>
            <Field label="Horario" className="sm:col-span-2">
              <Input value={s('schedule')} onChange={(e) => set('schedule', e.target.value)} placeholder="Ej.: cada 12 horas en casa" />
            </Field>
          </>
        )}
        {kind === 'device' && (
          <>
            <Field label="Tipo">
              <Select value={s('deviceType')} onChange={(e) => set('deviceType', e.target.value)}>
                {[['INHALER', 'Inhalador'], ['GLUCOMETER', 'Glucómetro'], ['INSULIN_PUMP', 'Bomba de insulina'], ['CGM', 'Monitor continuo de glucosa'], ['EPIPEN', 'Autoinyector de epinefrina'], ['HEARING_AID', 'Audífono'], ['GLASSES', 'Lentes'], ['ORTHOSIS', 'Ortesis'], ['OTHER', 'Otro']].map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Descripción" required>
              <Input value={s('description')} onChange={(e) => set('description', e.target.value)} />
            </Field>
            <Field label="¿Dónde lo lleva?" className="sm:col-span-2">
              <Input value={s('location')} onChange={(e) => set('location', e.target.value)} />
            </Field>
          </>
        )}
        {kind === 'surgical' && (
          <>
            <Field label="Tipo">
              <Select value={s('kind')} onChange={(e) => set('kind', e.target.value)}>
                <option value="SURGERY">Cirugía</option>
                <option value="HOSPITALIZATION">Hospitalización</option>
              </Select>
            </Field>
            <Field label="Fecha">
              <Input type="date" max={today} value={s('date')} onChange={(e) => set('date', e.target.value)} />
            </Field>
            <Field label="Descripción" required className="sm:col-span-2">
              <Input value={s('description')} onChange={(e) => set('description', e.target.value)} />
            </Field>
          </>
        )}
        {kind === 'document' && (
          <>
            <Field label="Tipo de documento">
              <Select value={s('docKind')} onChange={(e) => set('docKind', e.target.value)}>
                <option value="MEDICAL_CERTIFICATE">Certificado médico</option>
                <option value="VACCINE_CARD">Carné de vacunación</option>
                <option value="PRESCRIPTION">Fórmula médica</option>
                <option value="SPECIALIST_CONCEPT">Concepto de especialista</option>
                <option value="ATTACHMENT">Otro</option>
              </Select>
            </Field>
            <Field label="Título">
              <Input value={s('title')} onChange={(e) => set('title', e.target.value)} />
            </Field>
            <Field label="Vence (opcional)">
              <Input type="date" value={s('expires')} onChange={(e) => set('expires', e.target.value)} />
            </Field>
            <div className="sm:col-span-2">
              <FileDropzone file={file} onFile={setFile} />
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
