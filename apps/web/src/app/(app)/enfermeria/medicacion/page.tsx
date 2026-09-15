'use client';

import { ROUTE_LABELS, type Route } from '@sgee/shared';
import { Alert, Badge, Button, Card, Checkbox, cn, EmptyState, Field, Input, PageHeader, Select, Skeleton, StatCard, StudentAvatar, Textarea } from '@sgee/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ClipboardCheck, FileText, PackageCheck, Pill, ShieldAlert, XCircle } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Dialog, TabPanel, Tabs } from '@/components/dialog';
import type { StudentRow } from '@/components/student-picker';
import { api, ApiError, idem, openFile } from '@/lib/api';
import { fmtDate, fmtTime } from '@/lib/format';
import { useLive } from '@/lib/live';

interface RequestCard {
  id: string;
  medicationName: string;
  catalogId: string | null;
  dose: number;
  doseUnit: string;
  route: Route;
  routeLabel: string;
  isPrn: boolean;
  prnCriteria: string | null;
  controlled: boolean;
  selfAdministration: boolean;
  custodyRemaining: number;
  custodyExpiry: string | null;
}

interface Today {
  date: string;
  windowMinutes: number;
  scheduled: { id: string; scheduledFor: string; time: string; status: string; dueNow: boolean; overdue: boolean; request: RequestCard; student: StudentRow; allergies: string[]; administration: { outcome: string; administeredAt: string; reason: string | null } | null }[];
  prn: { request: RequestCard; student: StudentRow }[];
  pendingReview: number;
  counts: { total: number; given: number; pending: number; overdue: number };
}

interface Request {
  id: string;
  status: string;
  medicationName: string;
  dose: number;
  doseUnit: string;
  routeLabel: string;
  frequency: string;
  times: string[];
  isPrn: boolean;
  prnCriteria: string | null;
  startDate: string;
  endDate: string;
  indication: string;
  prescriberName: string | null;
  prescriberLicense: string | null;
  controlled: boolean;
  notes: string | null;
  storage: string;
  custodyRemaining: number;
  prescriptions: { fileId: string; issuedOn: string | null }[];
  custody: { id: string; quantityRemaining: number; unit: string; lot: string; expiryDate: string; closedAt: string | null }[];
  student: StudentRow;
}

const OUTCOME_LABEL: Record<string, string> = { GIVEN: 'Administrada', REFUSED: 'Rechazada', OMITTED: 'Omitida', HELD: 'Suspendida', MISSED: 'No administrada', PENDING: 'Pendiente' };

function MedsInner() {
  const params = useSearchParams();
  const router = useRouter();
  const [tab, setTab] = useState(params.get('tab') ?? 'agenda');
  const today = useQuery({ queryKey: ['meds-today'], queryFn: () => api<Today>('/medication-schedule/today'), refetchInterval: 60_000 });
  const requests = useQuery({ queryKey: ['med-requests', 'nursing'], queryFn: () => api<Request[]>('/medication-requests', { query: { status: 'SUBMITTED,APPROVED,ACTIVE,SUSPENDED' } }) });
  useLive(['meds:updated', 'meds:overdue'], [['meds-today'], ['med-requests']]);
  const [admin, setAdmin] = useState<{ request: RequestCard; student: StudentRow; scheduleId: string | null; scheduledTime?: string } | null>(null);
  const [review, setReview] = useState<Request | null>(null);
  const [custody, setCustody] = useState<Request | null>(null);

  useEffect(() => {
    const dose = params.get('dosis');
    if (dose && today.data) {
      const s = today.data.scheduled.find((x) => x.id === dose);
      if (s && s.status === 'PENDING') setAdmin({ request: s.request, student: s.student, scheduleId: s.id, scheduledTime: s.time });
      router.replace('/enfermeria/medicacion');
    }
  }, [params, today.data, router]);

  const t = today.data;
  const pendingReview = requests.data?.filter((r) => r.status === 'SUBMITTED') ?? [];
  const awaitingCustody = requests.data?.filter((r) => r.status === 'APPROVED') ?? [];

  return (
    <div>
      <PageHeader title="Medicación" description={`Agenda de hoy · ventana de ±${t?.windowMinutes ?? 30} minutos para los 5 correctos`} />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Programadas hoy" value={t?.counts.total ?? '—'} icon={<Pill />} />
        <StatCard label="Administradas" value={t?.counts.given ?? '—'} icon={<CheckCircle2 />} tone="success" />
        <StatCard label="Atrasadas" value={t?.counts.overdue ?? '—'} icon={<XCircle />} tone={t?.counts.overdue ? 'danger' : 'neutral'} />
        <StatCard label="Solicitudes por revisar" value={pendingReview.length} icon={<ClipboardCheck />} tone={pendingReview.length ? 'warning' : 'neutral'} onClick={() => setTab('solicitudes')} />
      </div>

      <Tabs
        value={tab}
        onValueChange={setTab}
        tabs={[
          { value: 'agenda', label: 'Agenda de hoy' },
          { value: 'rescate', label: `Rescate / PRN (${t?.prn.length ?? 0})` },
          { value: 'solicitudes', label: `Solicitudes (${pendingReview.length + awaitingCustody.length})` },
          { value: 'activas', label: 'Activas y custodia' },
        ]}
      >
        <TabPanel value="agenda">
          {today.isLoading && <Skeleton className="h-64" />}
          {t?.scheduled.length === 0 && <EmptyState icon={<Pill />} title="No hay dosis programadas hoy" />}
          <ul className="flex flex-col gap-2">
            {t?.scheduled.map((s) => (
              <Card key={s.id} className={cn('flex flex-wrap items-center gap-3 p-3', s.overdue && 'border-red-300 dark:border-red-800', s.dueNow && 'border-emerald-300 dark:border-emerald-800')}>
                <span className={cn('tabular w-14 text-lg font-semibold', s.overdue ? 'text-red-600' : s.dueNow ? 'text-emerald-700' : '')}>{s.time}</span>
                <StudentAvatar src={s.student.photoUrl} name={s.student.name} size={44} alert={s.allergies.length > 0} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{s.student.name}</p>
                  <p className="truncate text-sm text-muted">
                    {s.request.medicationName} · <strong>{s.request.dose} {s.request.doseUnit}</strong> · {s.request.routeLabel} {s.request.controlled && <Badge tone="warning">Control</Badge>}
                  </p>
                </div>
                {s.status === 'PENDING' ? (
                  <>
                    {s.overdue ? <Badge tone="danger">Atrasada</Badge> : s.dueNow ? <Badge tone="success">En ventana</Badge> : <Badge tone="neutral">Programada</Badge>}
                    <Button onClick={() => setAdmin({ request: s.request, student: s.student, scheduleId: s.id, scheduledTime: s.time })}>Administrar</Button>
                  </>
                ) : (
                  <Badge tone={s.status === 'GIVEN' ? 'success' : 'danger'}>
                    {OUTCOME_LABEL[s.status]} {s.administration && `· ${fmtTime(s.administration.administeredAt)}`}
                  </Badge>
                )}
              </Card>
            ))}
          </ul>
        </TabPanel>

        <TabPanel value="rescate">
          {t?.prn.length === 0 && <EmptyState title="Sin medicación de rescate activa" />}
          <div className="grid gap-3 md:grid-cols-2">
            {t?.prn.map((p) => (
              <Card key={p.request.id} className="flex flex-col gap-2 p-4">
                <div className="flex items-center gap-3">
                  <StudentAvatar src={p.student.photoUrl} name={p.student.name} size={44} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{p.student.name}</p>
                    <p className="text-xs text-muted">{p.student.group?.name}</p>
                  </div>
                </div>
                <p className="text-sm">
                  <strong>{p.request.medicationName}</strong> {p.request.dose} {p.request.doseUnit} · {p.request.routeLabel}
                </p>
                <p className="text-sm text-muted">Cuándo: {p.request.prnCriteria}</p>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted">
                    Custodia: {p.request.custodyRemaining} {p.request.custodyExpiry && `· vence ${fmtDate(p.request.custodyExpiry)}`}
                  </span>
                  <Button size="sm" variant="warning" onClick={() => setAdmin({ request: p.request, student: p.student, scheduleId: null })}>
                    Administrar rescate
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </TabPanel>

        <TabPanel value="solicitudes">
          <div className="grid gap-4 lg:grid-cols-2">
            <section>
              <h2 className="mb-2 font-semibold">Por revisar</h2>
              {pendingReview.length === 0 && <p className="text-sm text-muted">No hay solicitudes pendientes.</p>}
              <ul className="flex flex-col gap-2">
                {pendingReview.map((r) => (
                  <Card key={r.id} className="flex items-center gap-3 p-3">
                    <StudentAvatar src={r.student.photoUrl} name={r.student.name} size={40} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{r.student.name}</p>
                      <p className="truncate text-sm text-muted">
                        {r.medicationName} · {r.dose} {r.doseUnit}
                      </p>
                    </div>
                    <Button size="sm" onClick={() => setReview(r)}>
                      Revisar
                    </Button>
                  </Card>
                ))}
              </ul>
            </section>
            <section>
              <h2 className="mb-2 font-semibold">Aprobadas: recibir medicamento</h2>
              {awaitingCustody.length === 0 && <p className="text-sm text-muted">Nada pendiente de recibir.</p>}
              <ul className="flex flex-col gap-2">
                {awaitingCustody.map((r) => (
                  <Card key={r.id} className="flex items-center gap-3 p-3">
                    <StudentAvatar src={r.student.photoUrl} name={r.student.name} size={40} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{r.student.name}</p>
                      <p className="truncate text-sm text-muted">{r.medicationName}</p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => setCustody(r)}>
                      <PackageCheck className="h-4 w-4" /> Recibir
                    </Button>
                  </Card>
                ))}
              </ul>
            </section>
          </div>
        </TabPanel>

        <TabPanel value="activas">
          <div className="overflow-x-auto rounded-2xl border border-border bg-card">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-card-muted text-left text-xs text-muted">
                <tr>
                  <th className="px-3 py-2">Estudiante</th>
                  <th>Medicamento</th>
                  <th>Pauta</th>
                  <th>Vigencia</th>
                  <th>Custodia</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {requests.data
                  ?.filter((r) => ['ACTIVE', 'SUSPENDED'].includes(r.status))
                  .map((r) => (
                    <tr key={r.id} className="border-t border-border">
                      <td className="px-3 py-2 font-medium">{r.student.name}</td>
                      <td>
                        {r.medicationName} {r.controlled && <Badge tone="warning">Control</Badge>}
                      </td>
                      <td>
                        {r.dose} {r.doseUnit} · {r.isPrn ? 'PRN' : r.times.join(', ')}
                      </td>
                      <td className="text-muted">hasta {fmtDate(r.endDate)}</td>
                      <td>{r.custodyRemaining}</td>
                      <td className="pr-3 text-right">
                        {r.status === 'SUSPENDED' ? <Badge tone="warning">Suspendida</Badge> : (
                          <Button size="sm" variant="ghost" onClick={() => setCustody(r)}>
                            + Custodia
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </TabPanel>
      </Tabs>

      {admin && <AdministerDialog {...admin} windowMinutes={t?.windowMinutes ?? 30} onClose={() => setAdmin(null)} />}
      {review && <ReviewDialog request={review} onClose={() => setReview(null)} />}
      {custody && <CustodyDialog request={custody} onClose={() => setCustody(null)} />}
    </div>
  );
}

function AdministerDialog({ request, student, scheduleId, scheduledTime, windowMinutes, onClose }: { request: RequestCard; student: StudentRow; scheduleId: string | null; scheduledTime?: string; windowMinutes: number; onClose: () => void }) {
  const qc = useQueryClient();
  const staff = useQuery({ queryKey: ['clinical-staff'], queryFn: () => api<{ id: string; name: string }[]>('/clinical-staff'), enabled: request.controlled });
  const [code, setCode] = useState('');
  const [checks, setChecks] = useState({ medication: false, dose: false, route: false, time: false });
  const [outcome, setOutcome] = useState<'GIVEN' | 'REFUSED' | 'OMITTED' | 'HELD'>('GIVEN');
  const [reason, setReason] = useState('');
  const [adverse, setAdverse] = useState('');
  const [witness, setWitness] = useState('');
  const [failure, setFailure] = useState<string[] | null>(null);
  const [key] = useState(idem());
  const patientOk = code.trim() === student.code;
  const allOk = patientOk && Object.values(checks).every(Boolean);
  const submit = useMutation({
    mutationFn: () =>
      api('/administrations', {
        idempotencyKey: key,
        body: {
          requestId: request.id,
          scheduleId,
          scannedStudentId: patientOk ? student.id : '00000000-0000-4000-8000-000000000000',
          medicationName: checks.medication ? request.medicationName : '—',
          catalogId: checks.medication ? request.catalogId : null,
          dose: request.dose,
          doseUnit: request.doseUnit,
          route: request.route,
          outcome,
          reason: outcome === 'GIVEN' ? null : reason,
          adverseEffects: adverse || null,
          witnessUserId: witness || null,
        },
      }),
    onSuccess: () => {
      toast.success(outcome === 'GIVEN' ? 'Dosis administrada y registrada' : 'Registro guardado');
      qc.invalidateQueries({ queryKey: ['meds-today'] });
      onClose();
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'FIVE_RIGHTS_FAILED') setFailure(((e.body?.verification as { messages: string[] })?.messages) ?? [e.message]);
    },
    meta: { silent: false },
  });
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="lg"
      title="Administración de medicamento"
      description={scheduleId ? `Dosis de las ${scheduledTime}` : 'Medicación de rescate (PRN)'}
      footer={
        <Button size="lg" variant={outcome === 'GIVEN' ? 'success' : 'primary'} onClick={() => submit.mutate()} loading={submit.isPending} disabled={outcome === 'GIVEN' ? !allOk || (request.controlled && !witness) : reason.trim().length < 3}>
          {outcome === 'GIVEN' ? 'Registrar administración' : `Registrar: ${OUTCOME_LABEL[outcome].toLowerCase()}`}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-4 rounded-xl bg-card-muted p-3">
          <StudentAvatar src={student.photoUrl} name={student.name} size={72} alert={student.alerts?.anaphylaxis} />
          <div className="min-w-0">
            <p className="text-lg font-semibold">{student.name}</p>
            <p className="text-sm text-muted">
              {student.group?.name} · código {student.code}
            </p>
            {student.alerts?.allergies.length ? (
              <Badge tone="danger" className="mt-1">
                <ShieldAlert className="h-3 w-3" /> Alergias: {student.alerts.allergies.join(', ')}
              </Badge>
            ) : null}
          </div>
        </div>
        {failure && (
          <Alert tone="danger" title="No administre: la verificación falló">
            <ul className="list-disc pl-4">{failure.map((m) => <li key={m}>{m}</li>)}</ul>
          </Alert>
        )}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(['GIVEN', 'REFUSED', 'OMITTED', 'HELD'] as const).map((o) => (
            <button key={o} onClick={() => setOutcome(o)} className={cn('min-h-11 rounded-xl border text-sm font-medium', outcome === o ? (o === 'GIVEN' ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-amber-500 bg-amber-500 text-amber-950') : 'border-border')}>
              {OUTCOME_LABEL[o]}
            </button>
          ))}
        </div>
        {outcome === 'GIVEN' ? (
          <Card className="p-4">
            <p className="mb-2 font-semibold">Los 5 correctos</p>
            <Field label="1. Paciente correcto: escriba el código del estudiante (carné)" error={code && !patientOk ? 'El código no coincide' : null}>
              <Input value={code} onChange={(e) => setCode(e.target.value.trim())} inputMode="numeric" className="tabular" autoFocus />
            </Field>
            <div className="mt-2 flex flex-col">
              <Checkbox label={<>2. Medicamento correcto: <strong>{request.medicationName}</strong> (verificado en el rótulo)</>} checked={checks.medication} onChange={(e) => setChecks({ ...checks, medication: e.target.checked })} />
              <Checkbox label={<>3. Dosis correcta: <strong>{request.dose} {request.doseUnit}</strong></>} checked={checks.dose} onChange={(e) => setChecks({ ...checks, dose: e.target.checked })} />
              <Checkbox label={<>4. Vía correcta: <strong>{ROUTE_LABELS[request.route]}</strong></>} checked={checks.route} onChange={(e) => setChecks({ ...checks, route: e.target.checked })} />
              <Checkbox label={<>5. Hora correcta: {scheduleId ? `${scheduledTime} (±${windowMinutes} min)` : `PRN: ${request.prnCriteria}`}</>} checked={checks.time} onChange={(e) => setChecks({ ...checks, time: e.target.checked })} />
            </div>
            {request.controlled && (
              <Field label="Testigo (doble verificación de medicamento de control)" className="mt-3" required>
                <Select value={witness} onChange={(e) => setWitness(e.target.value)}>
                  <option value="">Seleccione…</option>
                  {staff.data?.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <Field label="Efectos adversos observados" className="mt-3">
              <Textarea rows={2} value={adverse} onChange={(e) => setAdverse(e.target.value)} placeholder="Ninguno" />
            </Field>
          </Card>
        ) : (
          <Field label="Motivo" required>
            <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej.: estudiante ausente, se niega a tomarlo…" autoFocus />
          </Field>
        )}
      </div>
    </Dialog>
  );
}

function ReviewDialog({ request, onClose }: { request: Request; onClose: () => void }) {
  const qc = useQueryClient();
  const [checks, setChecks] = useState({ prescriptionMatches: false, doseMatches: false, notExpired: false, packagingIntact: false, labeled: false });
  const [reason, setReason] = useState('');
  const detail = useQuery({ queryKey: ['med-request', request.id], queryFn: () => api<Request & { allergies: { agent: string; severity: string }[] }>(`/medication-requests/${request.id}`) });
  const review = useMutation({
    mutationFn: (decision: 'APPROVE' | 'REJECT') => api(`/medication-requests/${request.id}/review`, { body: { decision, reason: reason || null, checks } }),
    onSuccess: () => {
      toast.success('Solicitud revisada; se notificó al acudiente');
      qc.invalidateQueries({ queryKey: ['med-requests'] });
      qc.invalidateQueries({ queryKey: ['meds-today'] });
      onClose();
    },
  });
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="lg"
      title="Revisar solicitud de medicamento"
      description={request.student.name}
      footer={
        <>
          <Button variant="danger" onClick={() => review.mutate('REJECT')} disabled={reason.trim().length < 3} loading={review.isPending && review.variables === 'REJECT'}>
            Rechazar
          </Button>
          <Button variant="success" onClick={() => review.mutate('APPROVE')} disabled={!Object.values(checks).every(Boolean)} loading={review.isPending && review.variables === 'APPROVE'}>
            Aprobar
          </Button>
        </>
      }
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-4 text-sm">
          <p className="text-base font-semibold">{request.medicationName}</p>
          <p>
            {request.dose} {request.doseUnit} · {request.routeLabel} · {request.isPrn ? `PRN: ${request.prnCriteria}` : request.times.join(', ')}
          </p>
          <p className="text-muted">
            {fmtDate(request.startDate)} a {fmtDate(request.endDate)}
          </p>
          <p className="mt-2">Indicación: {request.indication}</p>
          <p>Prescriptor: {request.prescriberName ?? '—'} {request.prescriberLicense && `(RM ${request.prescriberLicense})`}</p>
          {request.notes && <p className="mt-2 text-muted">Notas: {request.notes}</p>}
          {request.prescriptions.map((p) => (
            <Button key={p.fileId} variant="outline" size="sm" className="mt-3" onClick={() => openFile(`/files/${p.fileId}`)}>
              <FileText className="h-4 w-4" /> Ver fórmula
            </Button>
          ))}
          {!request.prescriptions.length && <Alert tone="warning" className="mt-3">Sin fórmula adjunta (medicamento de venta libre).</Alert>}
          {detail.data?.allergies.length ? <Alert tone="danger" className="mt-3" title="Alergias registradas">{detail.data.allergies.map((a) => a.agent).join(', ')}</Alert> : null}
        </Card>
        <div className="flex flex-col">
          <p className="mb-1 font-semibold">Verificación</p>
          <Checkbox label="La fórmula coincide con lo solicitado" checked={checks.prescriptionMatches} onChange={(e) => setChecks({ ...checks, prescriptionMatches: e.target.checked })} />
          <Checkbox label="La dosis es adecuada para edad/peso" checked={checks.doseMatches} onChange={(e) => setChecks({ ...checks, doseMatches: e.target.checked })} />
          <Checkbox label="Fórmula y medicamento vigentes" checked={checks.notExpired} onChange={(e) => setChecks({ ...checks, notExpired: e.target.checked })} />
          <Checkbox label="Envase íntegro" checked={checks.packagingIntact} onChange={(e) => setChecks({ ...checks, packagingIntact: e.target.checked })} />
          <Checkbox label="Rotulado con el nombre del estudiante" checked={checks.labeled} onChange={(e) => setChecks({ ...checks, labeled: e.target.checked })} />
          <Field label="Motivo (obligatorio para rechazar)" className="mt-3">
            <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
        </div>
      </div>
    </Dialog>
  );
}

function CustodyDialog({ request, onClose }: { request: Request; onClose: () => void }) {
  const qc = useQueryClient();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
  const [v, setV] = useState({ quantity: '30', unit: 'unidades', lot: '', expiryDate: '', deliveredBy: '', storage: request.storage === 'FRIDGE' ? 'FRIDGE' : request.controlled ? 'CONTROLLED' : 'SHELF', packagingIntact: false, labeled: false });
  const receive = useMutation({
    mutationFn: () => api('/medication-custody', { body: { requestId: request.id, quantity: Number(v.quantity), unit: v.unit, lot: v.lot, expiryDate: v.expiryDate, deliveredBy: v.deliveredBy, storage: v.storage, packagingIntact: v.packagingIntact, labeled: v.labeled } }),
    onSuccess: () => {
      toast.success('Medicamento recibido en custodia');
      qc.invalidateQueries({ queryKey: ['med-requests'] });
      qc.invalidateQueries({ queryKey: ['meds-today'] });
      onClose();
    },
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Recepción física del medicamento" description={`${request.student.name} · ${request.medicationName}`} footer={<Button onClick={() => receive.mutate()} loading={receive.isPending} disabled={!v.lot || !v.expiryDate || !v.deliveredBy || Number(v.quantity) <= 0}>Recibir en custodia</Button>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Cantidad" required>
          <div className="flex gap-2">
            <Input type="number" value={v.quantity} onChange={(e) => setV({ ...v, quantity: e.target.value })} />
            <Input value={v.unit} onChange={(e) => setV({ ...v, unit: e.target.value })} className="w-32" />
          </div>
        </Field>
        <Field label="Lote" required>
          <Input value={v.lot} onChange={(e) => setV({ ...v, lot: e.target.value })} />
        </Field>
        <Field label="Vencimiento" required>
          <Input type="date" min={today} value={v.expiryDate} onChange={(e) => setV({ ...v, expiryDate: e.target.value })} />
        </Field>
        <Field label="Entregado por" required>
          <Input value={v.deliveredBy} onChange={(e) => setV({ ...v, deliveredBy: e.target.value })} placeholder="Nombre de quien entrega" />
        </Field>
        <Field label="Almacenamiento">
          <Select value={v.storage} onChange={(e) => setV({ ...v, storage: e.target.value })}>
            <option value="SHELF">Estante</option>
            <option value="FRIDGE">Nevera (2–8 °C)</option>
            <option value="CONTROLLED">Gabinete de control</option>
          </Select>
        </Field>
        <div className="flex flex-col sm:col-span-2">
          <Checkbox label="Envase original íntegro" checked={v.packagingIntact} onChange={(e) => setV({ ...v, packagingIntact: e.target.checked })} />
          <Checkbox label="Rotulado con el nombre del estudiante" checked={v.labeled} onChange={(e) => setV({ ...v, labeled: e.target.checked })} />
        </div>
      </div>
    </Dialog>
  );
}

export default function NursingMedsPage() {
  return (
    <Suspense>
      <MedsInner />
    </Suspense>
  );
}
