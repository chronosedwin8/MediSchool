'use client';

import {
  ACCIDENT_SEVERITY_LABELS,
  DISPOSITION_LABELS,
  type Disposition,
  ENCOUNTER_TEMPLATES,
  templateKeyForReason,
  ENCOUNTER_TYPE_LABELS,
  type EncounterType,
  PHYSICAL_EXAM_SYSTEMS,
  SCHOOL_ZONES,
  VITAL_META,
  type VitalKey,
} from '@sgee/shared';
import { Alert, Badge, Button, Card, Checkbox, cn, Field, Input, PatientHeader, Select, Skeleton, StatusTimeline, Textarea, VitalsInput, type VitalsValue } from '@sgee/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ClipboardCheck, Copy, FileDown, Hourglass, Lock, MessageSquarePlus, Plus, Save, ShieldX, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { use, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Dialog } from '@/components/dialog';
import { ObservationBadge } from '@/components/pass-card';
import { useDebounced } from '@/components/student-picker';
import { api, idem, openFile } from '@/lib/api';
import { fmtDateTime, fmtTime, RELATIONSHIP_LABELS } from '@/lib/format';
import { can, useMe } from '@/lib/session';

interface Diagnosis {
  system: 'ICD10' | 'ICD11';
  code: string;
  description: string;
  primary: boolean;
}
interface Treatment {
  description: string;
  itemId?: string | null;
  quantity?: number | null;
  item?: { id: string; name: string; unit: string } | null;
}
interface Incident {
  place: string;
  activity: string | null;
  mechanism: string;
  severity: 'MILD' | 'MODERATE' | 'SEVERE';
  witnesses: string[];
  supervisingStaff: string | null;
  insuranceNotified: boolean;
  workAccidentReport: boolean;
  preventiveActions: string | null;
}
interface EncounterDetail {
  id: string;
  status: 'OPEN' | 'OBSERVATION' | 'CLOSED' | 'ANNULLED';
  type: EncounterType;
  typeLabel: string;
  subjectType: 'STUDENT' | 'STAFF';
  studentId: string | null;
  chiefComplaint: string;
  templateKey: string | null;
  referredBy: string | null;
  referredFrom: string | null;
  startedAt: string;
  endedAt: string | null;
  disposition: Disposition | null;
  dispositionLabel: string | null;
  subjective: string | null;
  objective: string | null;
  assessment: string | null;
  plan: string | null;
  physicalExam: Record<string, string>;
  treatments: Treatment[];
  restMinutes: number | null;
  parentSummary: string | null;
  isMentalHealth: boolean;
  isHistorical: boolean;
  attendedBy: string | null;
  signedBy: string | null;
  signedAt: string | null;
  seq: string | null;
  hash: string | null;
  prevHash: string | null;
  annulReason: string | null;
  annulledAt: string | null;
  annulledByName: string | null;
  patient: {
    name: string;
    sex: string | null;
    age: number;
    bloodType: string | null;
    anaphylaxis: boolean;
    allergies: { agent: string; severity: string; requiresEpinephrine: boolean }[];
    conditions: { name: string; critical: boolean }[];
    student: { id: string; code: string; photoUrl: string | null; group: { name: string } | null } | null;
  };
  vitals: ({ id: string; takenAt: string; worstLevel: string | null; levels: Partial<Record<VitalKey, string>> } & Partial<Record<VitalKey, number | null>>)[];
  diagnoses: Diagnosis[];
  notes: { id: string; kind: string; note: string; author: string | null; createdAt: string }[];
  observations: { id: string; reason: string; startedAt: string; dueAt: string; endedAt: string | null; outcome: string | null }[];
  referrals: { id: string; destination: string; transport: string; departedAt: string | null; companion: string | null; reason: string }[];
  incident: Incident | null;
  attachments: { id: string; fileId: string; kind: string; createdAt: string }[];
  pass: { id: string; state: string; code: string; requestedAt: string; subject: string | null; exitAuthorization: { id: string; status: string; pickupName: string | null } | null } | null;
}

function Section({ title, children, defaultOpen = true, badge, id }: { title: string; children: ReactNode; defaultOpen?: boolean; badge?: ReactNode; id?: string }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card id={id}>
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-5 py-4 text-left" aria-expanded={open}>
        <h2 className="font-semibold">{title}</h2>
        {badge}
        <ChevronDown className={cn('ml-auto h-5 w-5 text-muted transition-transform', open && 'rotate-180')} />
      </button>
      {open && <div className="border-t border-border px-5 py-4">{children}</div>}
    </Card>
  );
}

export default function EncounterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const qc = useQueryClient();
  const { data: me } = useMe();
  const q = useQuery({ queryKey: ['encounter', id], queryFn: () => api<EncounterDetail>(`/encounters/${id}`) });
  const e = q.data;
  const editable = !!e && ['OPEN', 'OBSERVATION'].includes(e.status) && can(me, 'encounters:write');

  // Draft state with 5-second autosave (PLAN §9.2)
  const [draft, setDraft] = useState<Partial<EncounterDetail> | null>(null);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const loadedId = useRef<string | null>(null);
  useEffect(() => {
    if (e && loadedId.current !== e.id) {
      loadedId.current = e.id;
      setDraft({ chiefComplaint: e.chiefComplaint, type: e.type, subjective: e.subjective, objective: e.objective, assessment: e.assessment, plan: e.plan, physicalExam: e.physicalExam ?? {}, diagnoses: e.diagnoses, treatments: e.treatments, incident: e.incident, restMinutes: e.restMinutes, parentSummary: e.parentSummary });
    }
  }, [e]);
  const set = (patch: Partial<EncounterDetail>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setDirty(true);
  };
  const save = useMutation({
    mutationFn: () =>
      api<EncounterDetail>(`/encounters/${id}`, {
        method: 'PATCH',
        body: {
          chiefComplaint: draft?.chiefComplaint,
          type: draft?.type,
          subjective: draft?.subjective ?? null,
          objective: draft?.objective ?? null,
          assessment: draft?.assessment ?? null,
          plan: draft?.plan ?? null,
          physicalExam: draft?.physicalExam ?? {},
          diagnoses: draft?.diagnoses ?? [],
          treatments: (draft?.treatments ?? []).map((t) => ({ description: t.description, itemId: t.itemId ?? null, quantity: t.quantity ?? null })),
          incident: draft?.incident ?? undefined,
          restMinutes: draft?.restMinutes ?? null,
          parentSummary: draft?.parentSummary ?? null,
        },
      }),
    meta: { silent: true },
    onSuccess: () => {
      setDirty(false);
      setSavedAt(new Date());
      qc.invalidateQueries({ queryKey: ['encounter', id] });
    },
    onError: (err) => toast.error(`No se pudo guardar: ${(err as Error).message}`),
  });
  const snapshot = useDebounced(draft, 5000);
  useEffect(() => {
    if (editable && dirty && snapshot && !save.isPending) save.mutate();
    // Intentionally keyed only on the debounced snapshot.
  }, [snapshot]);

  const [vitals, setVitals] = useState<VitalsValue>({});
  const addVitals = useMutation({
    mutationFn: () => api<{ worst: string }>(`/encounters/${id}/vitals`, { body: vitals }),
    onSuccess: (r) => {
      setVitals({});
      if (r.worst === 'critical') toast.error('Signos vitales CRÍTICOS registrados. Considere activar el protocolo de emergencia.');
      else toast.success('Signos vitales registrados');
      qc.invalidateQueries({ queryKey: ['encounter', id] });
    },
  });

  const [closeOpen, setCloseOpen] = useState(false);
  const [annulOpen, setAnnulOpen] = useState(false);
  const [obsOpen, setObsOpen] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  const [note, setNote] = useState('');
  const addNote = useMutation({
    mutationFn: () => api(`/encounters/${id}/notes`, { body: { note } }),
    onSuccess: () => {
      setNote('');
      qc.invalidateQueries({ queryKey: ['encounter', id] });
    },
  });
  const endObs = useMutation({
    mutationFn: (outcome: string) => api(`/encounters/${id}/observation/end`, { body: { outcome } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['encounter', id] }),
  });

  if (q.isLoading || !e || !draft) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28" />
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const activeObs = e.observations.find((o) => !o.endedAt);
  const template = ENCOUNTER_TEMPLATES.find((t) => t.key === (e.templateKey ?? templateKeyForReason(e.chiefComplaint) ?? ''));

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 pb-24">
      <PatientHeader
        name={e.patient.name}
        photoUrl={e.patient.student?.photoUrl}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            {e.subjectType === 'STAFF' ? 'Personal del colegio' : `${e.patient.student?.code} · ${e.patient.student?.group?.name ?? ''}`} · {e.patient.age} años
            <Badge tone={e.status === 'CLOSED' ? 'success' : e.status === 'ANNULLED' ? 'danger' : e.status === 'OBSERVATION' ? 'violet' : 'primary'}>{{ OPEN: 'Abierta', OBSERVATION: 'En observación', CLOSED: 'Cerrada y firmada', ANNULLED: 'Anulada' }[e.status]}</Badge>
            {e.isHistorical && <Badge tone="neutral">Histórico Phidias</Badge>}
            {e.pass && <Badge tone="info">Pase {e.pass.code}</Badge>}
          </span>
        }
        allergies={e.patient.allergies}
        conditions={e.patient.conditions}
        bloodType={e.patient.bloodType}
        actions={
          <>
            {e.patient.student && (
              <Link href={`/estudiantes/${e.patient.student.id}`}>
                <Button variant="outline" size="sm">
                  Ficha
                </Button>
              </Link>
            )}
            <Button variant="outline" size="sm" onClick={() => openFile(`/encounters/${id}/pdf`)}>
              <FileDown className="h-4 w-4" /> PDF
            </Button>
          </>
        }
      />

      {e.status === 'ANNULLED' && (
        <Alert tone="danger" icon={<ShieldX />} title={`Atención anulada · ${fmtDateTime(e.annulledAt)} por ${e.annulledByName ?? ''}`}>
          {e.annulReason}
        </Alert>
      )}
      {e.status === 'CLOSED' && (
        <Alert tone="success" icon={<Lock />} title={`Firmada por ${e.signedBy ?? '—'} · ${fmtDateTime(e.signedAt)}`}>
          Registro inmutable (secuencia {e.seq}, hash <span className="font-mono text-xs">{e.hash?.slice(0, 16)}…</span>). Las correcciones se registran como adendas.
        </Alert>
      )}
      {activeObs && (
        <Alert tone="info" icon={<Hourglass />} title={`En observación: ${activeObs.reason}`} action={editable && <Button size="sm" variant="outline" onClick={() => { const o = window.prompt('Resultado de la reevaluación'); if (o && o.length >= 3) endObs.mutate(o); }}>Terminar observación</Button>}>
          <ObservationBadge dueAt={activeObs.dueAt} />
        </Alert>
      )}
      {e.pass?.exitAuthorization && (
        <Alert tone={e.pass.exitAuthorization.status === 'CONFIRMED' ? 'success' : 'warning'} title="Autorización de salida">
          {e.pass.exitAuthorization.status === 'PENDING_GUARDIAN' ? 'Esperando confirmación del acudiente.' : e.pass.exitAuthorization.status === 'CONFIRMED' ? `Confirmada: recoge ${e.pass.exitAuthorization.pickupName}. Portería puede entregar.` : e.pass.exitAuthorization.status === 'COMPLETED' ? `Entregado a ${e.pass.exitAuthorization.pickupName}.` : e.pass.exitAuthorization.status}
        </Alert>
      )}

      {template && editable && (
        <Card className="border-primary-200 bg-primary-50/40 p-4 dark:border-primary-900 dark:bg-primary-950/20">
          <p className="mb-2 flex items-center gap-2 font-semibold">
            <ClipboardCheck className="h-4 w-4" /> Plantilla: {template.label}
          </p>
          <div className="grid gap-3 text-sm md:grid-cols-3">
            <div>
              <p className="font-medium text-muted">Valorar</p>
              <ul className="list-disc pl-4">{template.checklist.map((c) => <li key={c}>{c}</li>)}</ul>
            </div>
            <div>
              <p className="font-medium text-muted">Conducta sugerida</p>
              <ul className="list-disc pl-4">{template.actions.map((c) => <li key={c}>{c}</li>)}</ul>
            </div>
            <div>
              <p className="font-medium text-red-700 dark:text-red-400">Signos de alarma</p>
              <ul className="list-disc pl-4 text-red-800 dark:text-red-300">{template.redFlags.map((c) => <li key={c}>{c}</li>)}</ul>
            </div>
          </div>
        </Card>
      )}

      <Section title="1. Motivo y tipo">
        <div className="grid gap-3 md:grid-cols-[1fr_240px]">
          <Field label="Motivo de consulta">
            <Input value={draft.chiefComplaint ?? ''} onChange={(ev) => set({ chiefComplaint: ev.target.value })} disabled={!editable} />
          </Field>
          <Field label="Tipo de atención">
            <Select value={draft.type} onChange={(ev) => set({ type: ev.target.value as EncounterType })} disabled={!editable}>
              {Object.entries(ENCOUNTER_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <p className="mt-2 text-sm text-muted">
          Ingreso {fmtTime(e.startedAt)} · atendido por {e.attendedBy ?? '—'}
          {e.referredBy && ` · remitido por ${e.referredBy}`}
          {e.pass?.subject && ` · clase de ${e.pass.subject}`}
        </p>
      </Section>

      <Section title="2. Signos vitales" badge={<Badge tone="neutral">{e.vitals.length}</Badge>}>
        {e.vitals.length > 0 && (
          <div className="mb-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="py-1">Hora</th>
                  {(Object.keys(VITAL_META) as VitalKey[]).map((k) => (
                    <th key={k} className="py-1">
                      {VITAL_META[k].label.replace('Frecuencia ', 'F. ')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {e.vitals.map((v) => (
                  <tr key={v.id} className="border-t border-border">
                    <td className="tabular py-1.5">{fmtTime(v.takenAt)}</td>
                    {(Object.keys(VITAL_META) as VitalKey[]).map((k) => (
                      <td key={k} className={cn('tabular py-1.5', v.levels[k] === 'critical' && 'font-bold text-red-600', v.levels[k] === 'warning' && 'font-semibold text-amber-600')}>
                        {v[k] ?? '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {editable && (
          <>
            <VitalsInput value={vitals} onChange={setVitals} ageYears={e.patient.age} />
            <div className="mt-3 flex justify-end">
              <Button onClick={() => addVitals.mutate()} loading={addVitals.isPending} disabled={!Object.values(vitals).some((v) => v !== null && v !== undefined)}>
                <Plus className="h-4 w-4" /> Registrar toma
              </Button>
            </div>
          </>
        )}
      </Section>

      <Section title="3. Valoración (SOAP)">
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="S — Subjetivo">
            <Textarea rows={4} value={draft.subjective ?? ''} onChange={(ev) => set({ subjective: ev.target.value })} disabled={!editable} placeholder="Lo que refiere el paciente" />
          </Field>
          <Field label="O — Objetivo">
            <Textarea rows={4} value={draft.objective ?? ''} onChange={(ev) => set({ objective: ev.target.value })} disabled={!editable} placeholder="Hallazgos del examen" />
          </Field>
        </div>
        <details className="mt-3 rounded-xl border border-border p-3" open={Object.keys(draft.physicalExam ?? {}).length > 0}>
          <summary className="cursor-pointer text-sm font-medium">Examen físico por sistemas</summary>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {PHYSICAL_EXAM_SYSTEMS.map((sys) => {
              const value = draft.physicalExam?.[sys] ?? '';
              return (
                <div key={sys} className="flex items-center gap-2">
                  <span className="w-40 shrink-0 text-sm">{sys}</span>
                  <button type="button" disabled={!editable} onClick={() => set({ physicalExam: { ...draft.physicalExam, [sys]: 'Normal' } })} className={cn('min-h-9 rounded-lg border px-2 text-xs', value === 'Normal' ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-border')}>
                    Normal
                  </button>
                  <Input className="h-9 text-sm" value={value === 'Normal' ? '' : value} placeholder="Hallazgo" disabled={!editable} onChange={(ev) => set({ physicalExam: { ...draft.physicalExam, [sys]: ev.target.value } })} />
                </div>
              );
            })}
          </div>
        </details>
      </Section>

      <Section title="4. Diagnóstico (CIE-10)">
        <DiagnosisEditor value={draft.diagnoses ?? []} onChange={(d) => set({ diagnoses: d })} disabled={!editable} suggestions={template?.icd10 ?? []} />
        <Field label="A — Valoración / impresión" className="mt-3">
          <Textarea rows={2} value={draft.assessment ?? ''} onChange={(ev) => set({ assessment: ev.target.value })} disabled={!editable} />
        </Field>
      </Section>

      {(draft.type === 'ACCIDENT' || draft.type === 'STAFF_FIRST_AID' || draft.incident) && (
        <Section title="Reporte de accidente">
          <IncidentEditor value={draft.incident} onChange={(i) => set({ incident: i })} disabled={!editable} staff={e.subjectType === 'STAFF'} />
        </Section>
      )}

      <Section title="5. Conducta y tratamiento">
        <Field label="P — Plan">
          <Textarea rows={3} value={draft.plan ?? ''} onChange={(ev) => set({ plan: ev.target.value })} disabled={!editable} placeholder={template?.actions.join('. ')} />
        </Field>
        <TreatmentEditor value={draft.treatments ?? []} onChange={(t) => set({ treatments: t })} disabled={!editable} />
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <Field label="Reposo (minutos)">
            <Input type="number" inputMode="numeric" min={0} max={480} value={draft.restMinutes ?? ''} onChange={(ev) => set({ restMinutes: ev.target.value ? Number(ev.target.value) : null })} disabled={!editable} />
          </Field>
          <Field label="Resumen para la familia" hint="Sin detalles clínicos sensibles. Se envía por enlace seguro.">
            <Textarea rows={2} value={draft.parentSummary ?? ''} onChange={(ev) => set({ parentSummary: ev.target.value })} disabled={!editable} />
          </Field>
        </div>
      </Section>

      <Section title="Evolución y adendas" badge={<Badge tone="neutral">{e.notes.length}</Badge>} defaultOpen={e.notes.length > 0 || e.status === 'CLOSED'}>
        {e.notes.length > 0 && (
          <StatusTimeline items={e.notes.map((n) => ({ id: n.id, title: `${{ ADDENDUM: 'Adenda', EVOLUTION: 'Evolución', OBSERVATION_RECHECK: 'Reevaluación', ANNULMENT: 'Anulación' }[n.kind] ?? n.kind} · ${n.author ?? ''}`, time: fmtDateTime(n.createdAt), description: n.note, tone: n.kind === 'ANNULMENT' ? 'danger' : n.kind === 'ADDENDUM' ? 'warning' : 'primary' }))} />
        )}
        {e.status !== 'ANNULLED' && can(me, 'encounters:write') && (
          <div className="mt-3 flex flex-col gap-2">
            <Textarea rows={2} value={note} onChange={(ev) => setNote(ev.target.value)} placeholder={e.status === 'CLOSED' ? 'Adenda (corrección o información posterior)' : 'Nota de evolución'} />
            <Button className="self-end" variant="outline" onClick={() => addNote.mutate()} disabled={note.trim().length < 3} loading={addNote.isPending}>
              <MessageSquarePlus className="h-4 w-4" /> Agregar
            </Button>
          </div>
        )}
      </Section>

      {e.referrals.length > 0 && (
        <Card className="p-4">
          <p className="font-semibold">Traslado</p>
          {e.referrals.map((r) => (
            <p key={r.id} className="text-sm">
              {r.destination} · {r.transport} · {fmtTime(r.departedAt)} · {r.companion} — {r.reason}
            </p>
          ))}
        </Card>
      )}

      {/* Sticky action bar */}
      <div className="no-print fixed inset-x-0 bottom-14 z-20 border-t border-border bg-card/95 px-4 py-3 backdrop-blur lg:bottom-0 lg:left-64">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2">
          {editable ? (
            <>
              <span className="text-xs text-muted">{save.isPending ? 'Guardando…' : dirty ? 'Cambios sin guardar' : savedAt ? `Guardado ${fmtTime(savedAt)}` : 'Autoguardado activo'}</span>
              <Button variant="ghost" size="sm" onClick={() => save.mutate()} disabled={!dirty} loading={save.isPending}>
                <Save className="h-4 w-4" /> Guardar
              </Button>
              <div className="ml-auto flex flex-wrap gap-2">
                {!activeObs && (
                  <Button variant="outline" onClick={() => setObsOpen(true)}>
                    <Hourglass className="h-4 w-4" /> Observación
                  </Button>
                )}
                <Button
                  onClick={async () => {
                    if (dirty) await save.mutateAsync();
                    setCloseOpen(true);
                  }}
                >
                  <Lock className="h-4 w-4" /> Cerrar y firmar
                </Button>
              </div>
            </>
          ) : (
            <div className="ml-auto flex gap-2">
              {e.pass?.state === 'WAITING_GUARDIAN' && !e.pass.exitAuthorization && can(me, 'exits:authorize') && <Button onClick={() => setExitOpen(true)}>Autorizar salida</Button>}
              {e.status !== 'ANNULLED' && can(me, 'encounters:annul') && (
                <Button variant="outline" onClick={() => setAnnulOpen(true)}>
                  <Trash2 className="h-4 w-4" /> Anular
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {closeOpen && <CloseDialog encounter={{ ...e, ...draft } as EncounterDetail} onClose={() => setCloseOpen(false)} onClosed={(disp) => { setCloseOpen(false); qc.invalidateQueries({ queryKey: ['encounter', id] }); if (disp === 'GUARDIAN_PICKUP' && e.pass) setExitOpen(true); }} />}
      {annulOpen && <AnnulDialog id={id} onClose={() => setAnnulOpen(false)} />}
      {obsOpen && <ObservationDialog id={id} defaultMinutes={template?.observationMinutes || me?.settings.observationRecheckMinutes || 20} onClose={() => setObsOpen(false)} />}
      {exitOpen && e.pass && <ExitDialog passId={e.pass.id} studentId={e.studentId!} onClose={() => { setExitOpen(false); qc.invalidateQueries({ queryKey: ['encounter', id] }); }} />}
    </div>
  );
}

function DiagnosisEditor({ value, onChange, disabled, suggestions }: { value: Diagnosis[]; onChange: (d: Diagnosis[]) => void; disabled: boolean; suggestions: { code: string; description: string }[] }) {
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 200);
  const results = useQuery({ queryKey: ['icd10', dq], queryFn: () => api<{ code: string; description: string }[]>('/catalog/icd10', { query: { q: dq } }), enabled: dq.length >= 2 });
  const add = (d: { code: string; description: string }) => {
    if (value.some((v) => v.code === d.code)) return;
    onChange([...value, { system: 'ICD10', code: d.code, description: d.description, primary: value.length === 0 }]);
    setQ('');
  };
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {value.map((d) => (
          <span key={d.code} className={cn('inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm', d.primary ? 'border-primary-600 bg-primary-50 dark:bg-primary-950' : 'border-border')}>
            <button type="button" disabled={disabled} onClick={() => onChange(value.map((v) => ({ ...v, primary: v.code === d.code })))} title="Marcar como principal" className="font-mono text-xs font-semibold">
              {d.code}
            </button>
            {d.description}
            {!disabled && (
              <button type="button" onClick={() => onChange(value.filter((v) => v.code !== d.code))} aria-label={`Quitar ${d.code}`} className="text-muted hover:text-red-600">
                ×
              </button>
            )}
          </span>
        ))}
        {value.length === 0 && <span className="text-sm text-muted">Sin diagnósticos.</span>}
      </div>
      {!disabled && (
        <>
          {suggestions.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((s) => (
                <button key={s.code} type="button" onClick={() => add(s)} className="min-h-9 rounded-full border border-dashed border-primary-400 px-3 text-xs hover:bg-primary-50 dark:hover:bg-primary-950">
                  + {s.code} {s.description}
                </button>
              ))}
            </div>
          )}
          <Input value={q} onChange={(ev) => setQ(ev.target.value)} placeholder="Buscar CIE-10 por código o descripción" aria-label="Buscar diagnóstico" />
          {results.data && dq.length >= 2 && (
            <ul className="max-h-56 overflow-y-auto rounded-xl border border-border">
              {results.data.map((r) => (
                <li key={r.code}>
                  <button type="button" onClick={() => add(r)} className="flex w-full gap-3 px-3 py-2 text-left text-sm hover:bg-card-muted">
                    <span className="w-14 font-mono font-semibold">{r.code}</span> {r.description}
                  </button>
                </li>
              ))}
              {q.trim().length >= 3 && (
                <li>
                  <button type="button" onClick={() => add({ code: q.trim().toUpperCase().split(' ')[0], description: q.trim() })} className="w-full px-3 py-2 text-left text-sm text-muted hover:bg-card-muted">
                    Usar “{q.trim()}” como código manual
                  </button>
                </li>
              )}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function TreatmentEditor({ value, onChange, disabled }: { value: Treatment[]; onChange: (t: Treatment[]) => void; disabled: boolean }) {
  const items = useQuery({ queryKey: ['inventory-items'], queryFn: () => api<{ id: string; name: string; unit: string; stock: number }[]>('/inventory/items'), staleTime: 300_000, enabled: !disabled });
  const [desc, setDesc] = useState('');
  const [itemId, setItemId] = useState('');
  const [qty, setQty] = useState(1);
  return (
    <div className="mt-3 flex flex-col gap-2">
      <p className="text-sm font-medium">Tratamiento aplicado / insumos</p>
      {value.length === 0 && <p className="text-sm text-muted">Sin tratamientos registrados.</p>}
      <ul className="flex flex-col gap-1">
        {value.map((t, i) => (
          <li key={i} className="flex items-center gap-2 rounded-lg bg-card-muted px-3 py-2 text-sm">
            <span className="flex-1">
              {t.description}
              {t.itemId && (
                <span className="text-muted">
                  {' '}
                  · descuenta {t.quantity ?? 1} {t.item?.unit ?? items.data?.find((x) => x.id === t.itemId)?.unit ?? ''} del inventario al cerrar
                </span>
              )}
            </span>
            {!disabled && (
              <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} className="text-muted hover:text-red-600" aria-label="Quitar">
                ×
              </button>
            )}
          </li>
        ))}
      </ul>
      {!disabled && (
        <div className="grid gap-2 md:grid-cols-[1fr_220px_90px_auto]">
          <Input value={desc} onChange={(ev) => setDesc(ev.target.value)} placeholder="Ej.: Compresa fría 15 min, curación…" />
          <Select value={itemId} onChange={(ev) => setItemId(ev.target.value)} aria-label="Insumo de inventario">
            <option value="">Sin insumo</option>
            {items.data?.map((i) => (
              <option key={i.id} value={i.id} disabled={i.stock <= 0}>
                {i.name} ({i.stock})
              </option>
            ))}
          </Select>
          <Input type="number" min={0.5} step={0.5} value={qty} onChange={(ev) => setQty(Number(ev.target.value))} disabled={!itemId} aria-label="Cantidad" />
          <Button
            variant="outline"
            onClick={() => {
              const item = items.data?.find((x) => x.id === itemId);
              const description = desc.trim() || item?.name || '';
              if (!description) return;
              onChange([...value, { description, itemId: itemId || null, quantity: itemId ? qty : null }]);
              setDesc('');
              setItemId('');
              setQty(1);
            }}
          >
            Agregar
          </Button>
        </div>
      )}
    </div>
  );
}

function IncidentEditor({ value, onChange, disabled, staff }: { value: Incident | null | undefined; onChange: (i: Incident) => void; disabled: boolean; staff: boolean }) {
  const v: Incident = value ?? { place: '', activity: null, mechanism: '', severity: 'MILD', witnesses: [], supervisingStaff: null, insuranceNotified: false, workAccidentReport: false, preventiveActions: null };
  const set = (p: Partial<Incident>) => onChange({ ...v, ...p });
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Field label="Lugar">
        <Select value={v.place} onChange={(e) => set({ place: e.target.value })} disabled={disabled}>
          <option value="">Seleccione…</option>
          {SCHOOL_ZONES.map((z) => (
            <option key={z}>{z}</option>
          ))}
        </Select>
      </Field>
      <Field label="Actividad">
        <Input value={v.activity ?? ''} onChange={(e) => set({ activity: e.target.value })} disabled={disabled} placeholder="Recreo, educación física…" />
      </Field>
      <Field label="Mecanismo">
        <Input value={v.mechanism} onChange={(e) => set({ mechanism: e.target.value })} disabled={disabled} placeholder="Caída, golpe con objeto…" />
      </Field>
      <Field label="Severidad">
        <Select value={v.severity} onChange={(e) => set({ severity: e.target.value as Incident['severity'] })} disabled={disabled}>
          {Object.entries(ACCIDENT_SEVERITY_LABELS).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Testigos (separados por coma)">
        <Input value={v.witnesses.join(', ')} onChange={(e) => set({ witnesses: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} disabled={disabled} />
      </Field>
      <Field label="Docente / personal a cargo">
        <Input value={v.supervisingStaff ?? ''} onChange={(e) => set({ supervisingStaff: e.target.value })} disabled={disabled} />
      </Field>
      <Checkbox label="Se notificó a la aseguradora / póliza" checked={v.insuranceNotified} onChange={(e) => set({ insuranceNotified: e.target.checked })} disabled={disabled} />
      {staff && <Checkbox label="Reportar como accidente laboral (ARL)" checked={v.workAccidentReport} onChange={(e) => set({ workAccidentReport: e.target.checked })} disabled={disabled} />}
      <Field label="Acciones preventivas sugeridas" className="md:col-span-2">
        <Textarea rows={2} value={v.preventiveActions ?? ''} onChange={(e) => set({ preventiveActions: e.target.value })} disabled={disabled} />
      </Field>
    </div>
  );
}

function CloseDialog({ encounter, onClose, onClosed }: { encounter: EncounterDetail; onClose: () => void; onClosed: (d: Disposition) => void }) {
  const staff = encounter.subjectType === 'STAFF';
  const options = (Object.keys(DISPOSITION_LABELS) as Disposition[]).filter((d) => (staff ? d.startsWith('STAFF_') || d === 'TRANSFER_IPS' : !d.startsWith('STAFF_')));
  const [disposition, setDisposition] = useState<Disposition>(staff ? 'STAFF_RETURN_TO_WORK' : 'RETURN_TO_CLASS');
  const [summary, setSummary] = useState(encounter.parentSummary ?? '');
  const [notify, setNotify] = useState(!encounter.isMentalHealth);
  const [referral, setReferral] = useState({ destination: '', transport: 'AMBULANCE', companion: '', reason: '' });
  const [key] = useState(idem());
  const close = useMutation({
    mutationFn: () => api(`/encounters/${encounter.id}/close`, { body: { disposition, parentSummary: summary || null, notifyGuardians: notify, referral: disposition === 'TRANSFER_IPS' ? referral : null }, idempotencyKey: key }),
    onSuccess: () => {
      toast.success('Atención cerrada y firmada');
      onClosed(disposition);
    },
  });
  const missing = !encounter.assessment && encounter.diagnoses.length === 0;
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Cerrar y firmar la atención"
      description="Al firmar, el registro queda inmutable y encadenado (hash SHA-256)."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => close.mutate()} loading={close.isPending} disabled={missing || (disposition === 'TRANSFER_IPS' && (!referral.destination || !referral.reason))}>
            <Lock className="h-4 w-4" /> Firmar y cerrar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {missing && <Alert tone="warning">Registre la valoración o al menos un diagnóstico antes de cerrar.</Alert>}
        <Field label="Conducta">
          <div className="grid gap-2 sm:grid-cols-2">
            {options.map((d) => (
              <button key={d} onClick={() => setDisposition(d)} className={cn('min-h-12 rounded-xl border px-3 text-left text-sm font-medium', disposition === d ? (d === 'TRANSFER_IPS' ? 'border-red-600 bg-red-600 text-white' : 'border-primary-700 bg-primary-700 text-white') : 'border-border')}>
                {DISPOSITION_LABELS[d]}
              </button>
            ))}
          </div>
        </Field>
        {disposition === 'GUARDIAN_PICKUP' && <Alert tone="info">Después de firmar podrá generar la autorización de salida y notificar al acudiente.</Alert>}
        {disposition === 'TRANSFER_IPS' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="IPS de destino" required>
              <Input value={referral.destination} onChange={(e) => setReferral({ ...referral, destination: e.target.value })} />
            </Field>
            <Field label="Transporte">
              <Select value={referral.transport} onChange={(e) => setReferral({ ...referral, transport: e.target.value })}>
                <option value="AMBULANCE">Ambulancia</option>
                <option value="GUARDIAN">Acudiente</option>
                <option value="SCHOOL_VEHICLE">Vehículo del colegio</option>
                <option value="OTHER">Otro</option>
              </Select>
            </Field>
            <Field label="Acompañante">
              <Input value={referral.companion} onChange={(e) => setReferral({ ...referral, companion: e.target.value })} />
            </Field>
            <Field label="Motivo del traslado" required>
              <Input value={referral.reason} onChange={(e) => setReferral({ ...referral, reason: e.target.value })} />
            </Field>
          </div>
        )}
        {!staff && (
          <>
            <Field label="Resumen para la familia" hint="Se envía un aviso con enlace seguro; el contenido clínico no viaja en el mensaje.">
              <Textarea rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Ej.: Presentó dolor de cabeza leve, descansó 20 minutos y regresó a clase." />
            </Field>
            <Checkbox label="Notificar a los acudientes" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
          </>
        )}
      </div>
    </Dialog>
  );
}

function AnnulDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState('');
  const annul = useMutation({
    mutationFn: () => api(`/encounters/${id}/annul`, { body: { reason } }),
    onSuccess: () => {
      toast.success('Atención anulada');
      qc.invalidateQueries({ queryKey: ['encounter', id] });
      onClose();
    },
  });
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Anular atención"
      description="Los registros clínicos nunca se borran: quedan anulados con motivo y trazabilidad."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={() => annul.mutate()} disabled={reason.trim().length < 10} loading={annul.isPending}>
            Anular
          </Button>
        </>
      }
    >
      <Field label="Motivo (mínimo 10 caracteres)" required>
        <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
      </Field>
    </Dialog>
  );
}

function ObservationDialog({ id, defaultMinutes, onClose }: { id: string; defaultMinutes: number; onClose: () => void }) {
  const qc = useQueryClient();
  const [minutes, setMinutes] = useState(defaultMinutes);
  const [reason, setReason] = useState('');
  const start = useMutation({
    mutationFn: () => api(`/encounters/${id}/observation`, { body: { minutes, reason } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['encounter', id] });
      onClose();
    },
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Iniciar observación" description="Se alertará cuando llegue la hora de reevaluar." footer={<Button onClick={() => start.mutate()} disabled={reason.trim().length < 2} loading={start.isPending}>Iniciar</Button>}>
      <div className="flex flex-col gap-3">
        <Field label="Reevaluar en">
          <div className="flex flex-wrap gap-2">
            {[10, 15, 20, 30, 45, 60].map((m) => (
              <button key={m} onClick={() => setMinutes(m)} className={cn('min-h-11 rounded-xl border px-4 text-sm', minutes === m ? 'border-primary-700 bg-primary-700 text-white' : 'border-border')}>
                {m} min
              </button>
            ))}
          </div>
        </Field>
        <Field label="Motivo de la observación">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej.: vigilar respuesta al broncodilatador" autoFocus />
        </Field>
      </div>
    </Dialog>
  );
}

interface StudentDetail {
  guardians: { linkId: string; personId: string; name: string; relationship: string; canPickUp: boolean; phone: string | null; judicialRestriction: boolean }[];
}

function ExitDialog({ passId, studentId, onClose }: { passId: string; studentId: string; onClose: () => void }) {
  const student = useQuery({ queryKey: ['student', studentId], queryFn: () => api<StudentDetail>(`/students/${studentId}`) });
  const standing = useQuery({ queryKey: ['standing', studentId], queryFn: () => api<{ id: string; active: boolean; validFrom: string; validTo: string }[]>(`/students/${studentId}/standing-exit-permissions`) });
  const [reason, setReason] = useState('Requiere retiro por acudiente según valoración de enfermería.');
  const [useStanding, setUseStanding] = useState(false);
  const [links, setLinks] = useState<{ name: string; phone: string | null; link: string }[] | null>(null);
  const [key] = useState(idem());
  const validStanding = useMemo(() => standing.data?.some((s) => s.active && new Date(s.validTo) >= new Date()), [standing.data]);
  const create = useMutation({
    mutationFn: () => api<{ links: { name: string; phone: string | null; link: string }[] }>('/exit-authorizations', { body: { passId, reason, guardianIds: [], useStandingPermission: useStanding }, idempotencyKey: key }),
    onSuccess: (r) => {
      toast.success(useStanding ? 'Salida autorizada con permiso permanente' : 'Acudientes notificados');
      if (r.links.length) setLinks(r.links);
      else onClose();
    },
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Autorización de salida" description="Se notifica a los acudientes autorizados para recoger con un enlace firmado de un solo uso." size="lg">
      {links ? (
        <div className="flex flex-col gap-3">
          <Alert tone="success" title="Notificación enviada">
            Si el acudiente no tiene la app, comparta el enlace por WhatsApp o SMS.
          </Alert>
          {links.map((l) => (
            <Card key={l.link} className="flex flex-wrap items-center gap-2 p-3">
              <span className="flex-1">
                <span className="block font-medium">{l.name}</span>
                <span className="text-xs text-muted">{l.phone ?? 'Sin teléfono'}</span>
              </span>
              <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(l.link).then(() => toast.success('Enlace copiado'))}>
                <Copy className="h-4 w-4" /> Copiar enlace
              </Button>
              {l.phone && (
                <a href={`https://wa.me/${l.phone.replace(/\D/g, '').replace(/^3/, '573')}?text=${encodeURIComponent(`Enfermería del colegio: por favor confirme quién recogerá a su hijo(a): ${l.link}`)}`} target="_blank" rel="noreferrer">
                  <Button size="sm">WhatsApp</Button>
                </a>
              )}
            </Card>
          ))}
          <Button onClick={onClose}>Listo</Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <Field label="Motivo (visible para el acudiente, sin detalles clínicos)">
            <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <div>
            <p className="mb-2 text-sm font-medium">Acudientes autorizados para recoger</p>
            <ul className="flex flex-col gap-1">
              {student.data?.guardians.map((g) => (
                <li key={g.linkId} className="flex items-center gap-2 rounded-lg bg-card-muted px-3 py-2 text-sm">
                  <span className="flex-1">
                    {g.name} · {RELATIONSHIP_LABELS[g.relationship] ?? g.relationship}
                  </span>
                  {g.judicialRestriction ? <Badge tone="danger">Restricción judicial</Badge> : g.canPickUp ? <Badge tone="success">Puede recoger</Badge> : <Badge tone="neutral">No autorizado</Badge>}
                </li>
              ))}
              {student.data?.guardians.length === 0 && <Alert tone="warning">No hay acudientes registrados. Registre un acudiente o use la autorización permanente.</Alert>}
            </ul>
          </div>
          {validStanding && <Checkbox label="Usar autorización permanente de salida autónoma (bachillerato)" checked={useStanding} onChange={(e) => setUseStanding(e.target.checked)} />}
          <Button size="lg" onClick={() => create.mutate()} loading={create.isPending} disabled={reason.trim().length < 2}>
            {useStanding ? 'Autorizar salida' : 'Notificar a los acudientes'}
          </Button>
        </div>
      )}
    </Dialog>
  );
}
