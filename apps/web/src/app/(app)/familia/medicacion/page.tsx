'use client';

import { ROUTE_LABELS, type Route } from '@sgee/shared';
import { Alert, Badge, Button, Card, cn, EmptyState, Field, FileDropzone, Input, PageHeader, Select, Skeleton, Textarea } from '@sgee/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, FileDown, Pill, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ChildSelector, useChildren } from '@/components/child-selector';
import { type ConsentTemplate, ConsentSign } from '@/components/consent-sign';
import { Dialog } from '@/components/dialog';
import { useDebounced } from '@/components/student-picker';
import { api, ApiError, errorMessage, openFile } from '@/lib/api';
import { fmtDate } from '@/lib/format';

interface Request {
  id: string;
  medicationName: string;
  dose: number;
  doseUnit: string;
  route: string;
  routeLabel: string;
  frequency: string;
  times: string[];
  isPrn: boolean;
  startDate: string;
  endDate: string;
  status: string;
  reviewReason: string | null;
  custodyRemaining: number;
  student: { id: string; name: string };
}

const STATUS: Record<string, { label: string; tone: 'info' | 'success' | 'warning' | 'danger' | 'neutral' }> = {
  SUBMITTED: { label: 'En revisión por enfermería', tone: 'info' },
  APPROVED: { label: 'Aprobada: entregue el medicamento', tone: 'warning' },
  ACTIVE: { label: 'Activa', tone: 'success' },
  REJECTED: { label: 'Rechazada', tone: 'danger' },
  SUSPENDED: { label: 'Suspendida', tone: 'warning' },
  COMPLETED: { label: 'Finalizada', tone: 'neutral' },
  CANCELLED: { label: 'Cancelada', tone: 'neutral' },
};

export default function FamilyMedsPage() {
  const qc = useQueryClient();
  const children = useChildren();
  const [childId, setChildId] = useState<string | null>(null);
  const [wizard, setWizard] = useState(false);
  const list = useQuery({ queryKey: ['med-requests', childId], queryFn: () => api<Request[]>('/medication-requests', { query: { studentId: childId ?? undefined } }), enabled: !!childId });
  const cancel = useMutation({
    mutationFn: (id: string) => api(`/medication-requests/${id}/status`, { body: { status: 'CANCELLED', reason: 'Cancelada por el acudiente' } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['med-requests'] }),
  });
  const month = new Date().toISOString().slice(0, 7);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Medicamentos en el colegio"
        description="Solicite la administración de medicamentos con fórmula médica. Enfermería verifica cada solicitud."
        actions={
          <Button onClick={() => setWizard(true)} disabled={!childId}>
            <Plus className="h-4 w-4" /> Nueva solicitud
          </Button>
        }
      />
      <ChildSelector value={childId} onChange={setChildId} />
      {list.isLoading && <Skeleton className="h-40" />}
      {list.data?.length === 0 && <EmptyState icon={<Pill />} title="Sin solicitudes" description="Cuando su hijo(a) necesite tomar un medicamento en el colegio, registre aquí la solicitud." />}
      <ul className="flex flex-col gap-3">
        {list.data?.map((r) => (
          <Card key={r.id} className="p-4">
            <div className="flex flex-wrap items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{r.medicationName}</p>
                <p className="text-sm text-muted">
                  {r.dose} {r.doseUnit} · {r.routeLabel} · {r.isPrn ? 'Solo si es necesario' : r.times.join(', ')} · {fmtDate(r.startDate)} a {fmtDate(r.endDate)}
                </p>
                {r.reviewReason && r.status === 'REJECTED' && <p className="mt-1 text-sm text-red-700">Motivo: {r.reviewReason}</p>}
              </div>
              <Badge tone={STATUS[r.status]?.tone}>{STATUS[r.status]?.label ?? r.status}</Badge>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {['SUBMITTED', 'APPROVED', 'ACTIVE'].includes(r.status) && (
                <Button size="sm" variant="ghost" onClick={() => window.confirm('¿Cancelar la solicitud?') && cancel.mutate(r.id)}>
                  <X className="h-4 w-4" /> Cancelar
                </Button>
              )}
            </div>
          </Card>
        ))}
      </ul>
      {childId && (
        <Button variant="outline" className="mt-4" onClick={() => openFile(`/students/${childId}/mar/pdf?month=${month}`)}>
          <FileDown className="h-4 w-4" /> Constancia de dosis del mes
        </Button>
      )}
      {wizard && childId && <RequestWizard studentId={childId} studentName={children.find((c) => c.id === childId)?.name ?? ''} onClose={() => setWizard(false)} onDone={() => { setWizard(false); qc.invalidateQueries({ queryKey: ['med-requests'] }); }} />}
    </div>
  );
}

interface CatalogItem {
  id: string;
  genericName: string;
  brandNames: string[];
  form: string;
  concentration: string;
  route: Route;
  otcAllowed: boolean;
  controlled: boolean;
}

function RequestWizard({ studentId, studentName, onClose, onDone }: { studentId: string; studentName: string; onClose: () => void; onDone: () => void }) {
  const [step, setStep] = useState(1);
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 250);
  const catalog = useQuery({ queryKey: ['catalog-meds', dq], queryFn: () => api<CatalogItem[]>('/catalog/medications', { query: { q: dq } }) });
  const [med, setMed] = useState<CatalogItem | null>(null);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
  const [v, setV] = useState({ medicationName: '', dose: '', doseUnit: 'mg', route: 'ORAL' as Route, frequency: 'WEEKDAYS', times: ['10:00'], newTime: '12:00', startDate: today, endDate: today, indication: '', prnCriteria: '', minIntervalMinutes: '240', maxDosesPerDay: '2', prescriberName: '', prescriberLicense: '', prescriptionDate: today, notes: '', selfAdministration: false });
  const [file, setFile] = useState<File | null>(null);
  const [consent, setConsent] = useState<ConsentTemplate | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const prn = v.frequency === 'PRN';
  const set = (p: Partial<typeof v>) => setV((o) => ({ ...o, ...p }));
  const consents = useQuery({ queryKey: ['consents', studentId], queryFn: () => api<{ template: ConsentTemplate & { type: string }; status: string }[]>(`/students/${studentId}/consents`) });

  const step1 = !!(med || v.medicationName.trim());
  const step2 = Number(v.dose) > 0 && !!v.indication.trim() && v.endDate >= v.startDate && (prn ? !!v.prnCriteria.trim() : v.times.length > 0);
  const prescriptionRequired = !med?.otcAllowed || med?.controlled;
  const step3 = !prescriptionRequired || (!!file && !!v.prescriberName.trim());

  const submit = async () => {
    setSubmitting(true);
    try {
      let prescriptionFileId: string | null = null;
      if (file) {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('kind', 'PRESCRIPTION');
        fd.append('studentId', studentId);
        prescriptionFileId = (await api<{ id: string }>('/files', { form: fd })).id;
      }
      await api('/medication-requests', {
        body: {
          studentId,
          catalogId: med?.id ?? null,
          medicationName: med ? `${med.genericName} ${med.concentration}` : v.medicationName,
          activeIngredient: med?.genericName ?? null,
          presentation: med?.form ?? null,
          dose: Number(v.dose),
          doseUnit: v.doseUnit,
          route: v.route,
          frequency: v.frequency,
          times: prn ? [] : v.times,
          daysOfWeek: [],
          startDate: v.startDate,
          endDate: v.endDate,
          indication: v.indication,
          prescriberName: v.prescriberName || null,
          prescriberLicense: v.prescriberLicense || null,
          prescriptionFileId,
          prescriptionDate: file ? v.prescriptionDate : null,
          isPrn: prn,
          prnCriteria: prn ? v.prnCriteria : null,
          minIntervalMinutes: prn ? Number(v.minIntervalMinutes) : null,
          maxDosesPerDay: prn ? Number(v.maxDosesPerDay) : null,
          selfAdministration: v.selfAdministration,
          notes: v.notes || null,
        },
      });
      toast.success('Solicitud enviada. Enfermería le informará cuando la revise.');
      onDone();
    } catch (e) {
      if (e instanceof ApiError && e.code === 'CONSENT_REQUIRED') {
        const t = consents.data?.find((c) => c.template.type === 'MEDICATION_ADMIN')?.template;
        if (t) setConsent(t);
        toast.warning('Primero firme el consentimiento de administración de medicamentos.');
      } else toast.error(errorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  const pendingConsent = consents.data?.find((c) => c.template.type === 'MEDICATION_ADMIN' && c.status !== 'GRANTED');

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="lg"
      title={`Solicitud de medicamento · ${studentName}`}
      description={`Paso ${step} de 4`}
      footer={
        <>
          {step > 1 && (
            <Button variant="ghost" onClick={() => setStep(step - 1)}>
              <ArrowLeft className="h-4 w-4" /> Atrás
            </Button>
          )}
          {step < 4 ? (
            <Button onClick={() => setStep(step + 1)} disabled={(step === 1 && !step1) || (step === 2 && !step2) || (step === 3 && !step3)}>
              Siguiente <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={submit} loading={submitting} disabled={!!pendingConsent}>
              Enviar solicitud
            </Button>
          )}
        </>
      }
    >
      <ol className="mb-5 grid grid-cols-4 gap-2" aria-label="Progreso">
        {['Medicamento', 'Dosis y horario', 'Fórmula', 'Confirmar'].map((l, i) => (
          <li key={l} className={cn('rounded-lg border px-2 py-1.5 text-center text-xs', step === i + 1 ? 'border-primary-600 bg-primary-50 font-semibold dark:bg-primary-950' : step > i + 1 ? 'border-emerald-300 text-emerald-700' : 'border-border text-muted')}>
            {i + 1}. {l}
          </li>
        ))}
      </ol>

      {step === 1 && (
        <div className="flex flex-col gap-3">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre genérico o comercial" autoFocus />
          <ul className="grid max-h-72 gap-2 overflow-y-auto sm:grid-cols-2">
            {catalog.data?.map((c) => (
              <li key={c.id}>
                <button onClick={() => { setMed(c); set({ route: c.route, doseUnit: c.form === 'Tableta' ? 'mg' : c.form === 'Inhalador' ? 'inhalaciones' : 'mL' }); }} className={cn('w-full rounded-xl border p-3 text-left text-sm', med?.id === c.id ? 'border-primary-600 bg-primary-50 dark:bg-primary-950' : 'border-border hover:bg-card-muted')}>
                  <span className="block font-medium">
                    {c.genericName} {c.concentration}
                  </span>
                  <span className="text-muted">
                    {c.form} · {c.brandNames.join(', ')}
                  </span>
                  {c.controlled && <Badge tone="warning" className="ml-1">Control</Badge>}
                </button>
              </li>
            ))}
          </ul>
          <Field label="¿No aparece? Escriba el nombre">
            <Input value={v.medicationName} onChange={(e) => { setMed(null); set({ medicationName: e.target.value }); }} />
          </Field>
        </div>
      )}

      {step === 2 && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Dosis" required>
            <div className="flex gap-2">
              <Input type="number" inputMode="decimal" min={0} step="0.5" value={v.dose} onChange={(e) => set({ dose: e.target.value })} />
              <Select value={v.doseUnit} onChange={(e) => set({ doseUnit: e.target.value })} className="w-40">
                {['mg', 'mL', 'g', 'UI', 'mcg', 'tabletas', 'gotas', 'inhalaciones', 'aplicaciones'].map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </Select>
            </div>
          </Field>
          <Field label="Vía">
            <Select value={v.route} onChange={(e) => set({ route: e.target.value as Route })}>
              {Object.entries(ROUTE_LABELS).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Frecuencia" className="sm:col-span-2">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[['WEEKDAYS', 'Lunes a viernes'], ['DAILY', 'Todos los días'], ['ONCE', 'Una sola vez'], ['PRN', 'Solo si es necesario']].map(([k, l]) => (
                <button key={k} onClick={() => set({ frequency: k })} className={cn('min-h-11 rounded-xl border text-sm', v.frequency === k ? 'border-primary-700 bg-primary-700 text-white' : 'border-border')}>
                  {l}
                </button>
              ))}
            </div>
          </Field>
          {!prn ? (
            <Field label="Horarios en el colegio" className="sm:col-span-2">
              <div className="flex flex-wrap items-center gap-2">
                {v.times.map((t) => (
                  <span key={t} className="inline-flex items-center gap-1 rounded-full bg-primary-100 px-3 py-1 text-sm dark:bg-primary-900">
                    {t}
                    <button onClick={() => set({ times: v.times.filter((x) => x !== t) })} aria-label={`Quitar ${t}`}>
                      ×
                    </button>
                  </span>
                ))}
                <Input type="time" value={v.newTime} onChange={(e) => set({ newTime: e.target.value })} className="w-32" />
                <Button size="sm" variant="outline" onClick={() => !v.times.includes(v.newTime) && set({ times: [...v.times, v.newTime].sort() })}>
                  Agregar
                </Button>
              </div>
            </Field>
          ) : (
            <>
              <Field label="¿Cuándo administrarlo?" required className="sm:col-span-2">
                <Input value={v.prnCriteria} onChange={(e) => set({ prnCriteria: e.target.value })} placeholder="Ej.: si presenta tos con silbido o dificultad para respirar" />
              </Field>
              <Field label="Intervalo mínimo (minutos)">
                <Input type="number" value={v.minIntervalMinutes} onChange={(e) => set({ minIntervalMinutes: e.target.value })} />
              </Field>
              <Field label="Máximo de dosis al día">
                <Input type="number" value={v.maxDosesPerDay} onChange={(e) => set({ maxDosesPerDay: e.target.value })} />
              </Field>
            </>
          )}
          <Field label="Desde">
            <Input type="date" min={today} value={v.startDate} onChange={(e) => set({ startDate: e.target.value })} />
          </Field>
          <Field label="Hasta">
            <Input type="date" min={v.startDate} value={v.endDate} onChange={(e) => set({ endDate: e.target.value })} />
          </Field>
          <Field label="¿Para qué es?" required className="sm:col-span-2">
            <Input value={v.indication} onChange={(e) => set({ indication: e.target.value })} placeholder="Diagnóstico o motivo indicado por el médico" />
          </Field>
        </div>
      )}

      {step === 3 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {!prescriptionRequired && <Alert tone="info" className="sm:col-span-2">Este medicamento de venta libre puede administrarse sin fórmula con su autorización. Si la tiene, adjúntela.</Alert>}
          <Field label="Médico que formula" required={prescriptionRequired}>
            <Input value={v.prescriberName} onChange={(e) => set({ prescriberName: e.target.value })} />
          </Field>
          <Field label="Registro médico">
            <Input value={v.prescriberLicense} onChange={(e) => set({ prescriberLicense: e.target.value })} />
          </Field>
          <Field label="Fecha de la fórmula">
            <Input type="date" max={today} value={v.prescriptionDate} onChange={(e) => set({ prescriptionDate: e.target.value })} />
          </Field>
          <div className="sm:col-span-2">
            <FileDropzone file={file} onFile={setFile} label="Tomar foto de la fórmula o seleccionar archivo" />
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="flex flex-col gap-4">
          <Card className="p-4 text-sm">
            <p className="font-semibold">{med ? `${med.genericName} ${med.concentration}` : v.medicationName}</p>
            <p>
              {v.dose} {v.doseUnit} · {ROUTE_LABELS[v.route]} · {prn ? `Solo si es necesario: ${v.prnCriteria}` : v.times.join(', ')}
            </p>
            <p className="text-muted">
              {fmtDate(v.startDate)} a {fmtDate(v.endDate)} · {v.indication}
            </p>
            <p className="text-muted">Fórmula: {file ? file.name : 'no adjunta'}</p>
          </Card>
          <Field label="Observaciones para enfermería">
            <Textarea rows={2} value={v.notes} onChange={(e) => set({ notes: e.target.value })} />
          </Field>
          <Alert tone="warning">Entregue el medicamento en su envase original, rotulado con el nombre del estudiante y vigente. Enfermería no recibe envases abiertos sin rótulo.</Alert>
          {(pendingConsent || consent) && (
            <Card className="border-primary-300 p-4">
              <p className="mb-2 font-semibold">Consentimiento requerido</p>
              <ConsentSign template={(consent ?? pendingConsent!.template) as ConsentTemplate} studentId={studentId} onSigned={() => { setConsent(null); consents.refetch(); }} />
            </Card>
          )}
        </div>
      )}
    </Dialog>
  );
}
