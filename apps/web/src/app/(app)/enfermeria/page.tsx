'use client';

import { ENCOUNTER_TEMPLATES, ENCOUNTER_TYPE_LABELS, type EncounterType } from '@sgee/shared';
import { Alert, Badge, Button, Card, CardContent, CardHeader, CardTitle, Field, Input, KanbanColumn, PageHeader, Select, Skeleton, StatCard, StudentAvatar } from '@sgee/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Html5Qrcode } from 'html5-qrcode';
import { Activity, AlertTriangle, Boxes, ClipboardPlus, Clock, Pill, QrCode, Radio, Users } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Dialog } from '@/components/dialog';
import { type BoardCard, Elapsed, ObservationBadge, PassCard } from '@/components/pass-card';
import { StudentPicker, type StudentRow } from '@/components/student-picker';
import { api, idem } from '@/lib/api';
import { fmtTime } from '@/lib/format';
import { useLive } from '@/lib/live';
import { useMe } from '@/lib/session';

interface Board {
  columns: Record<'INCOMING' | 'IN_ROOM' | 'OBSERVATION' | 'WAITING_GUARDIAN' | 'EXITING', BoardCard[]>;
  walkIns: { encounterId: string; status: string; chiefComplaint: string; startedAt: string; subjectType: string; name: string; student: StudentRow | null; anaphylaxis: boolean; observationDueAt: string | null }[];
  kpis: { open: number; closedToday: number; avgTransitMinutes: number | null };
}

interface Today {
  scheduled: { id: string; time: string; status: string; dueNow: boolean; overdue: boolean; student: StudentRow; request: { medicationName: string; dose: number; doseUnit: string; routeLabel: string } }[];
  counts: { total: number; given: number; pending: number; overdue: number };
  pendingReview: number;
}

const COLUMNS = [
  { key: 'INCOMING', title: 'En camino', tone: 'primary' },
  { key: 'IN_ROOM', title: 'En sala', tone: 'success' },
  { key: 'OBSERVATION', title: 'Observación', tone: 'violet' },
  { key: 'WAITING_GUARDIAN', title: 'Esperando acudiente', tone: 'warning' },
  { key: 'EXITING', title: 'Salida autorizada', tone: 'neutral' },
] as const;

function BoardInner() {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const [newOpen, setNewOpen] = useState(params.get('nueva') === '1');
  const [receiveOpen, setReceiveOpen] = useState(false);
  const board = useQuery({ queryKey: ['board'], queryFn: () => api<Board>('/passes/board'), refetchInterval: 60_000 });
  const meds = useQuery({ queryKey: ['meds-today'], queryFn: () => api<Today>('/medication-schedule/today'), refetchInterval: 120_000 });
  const inv = useQuery({ queryKey: ['inventory-summary'], queryFn: () => api<{ lowStock: { id: string; name: string; stock: number; unit: string }[]; expiringSoon: { id: string; name: string }[] }>('/inventory/summary'), staleTime: 300_000 });
  const connected = useLive(['pass:created', 'pass:updated', 'pass:sla', 'encounter:updated', 'observation:due', 'meds:updated', 'meds:overdue', 'vitals:critical'], [['board'], ['meds-today']], (ev, p) => {
    if (ev === 'pass:created') toast.info(p.urgency === 'EMERGENCY' ? '¡Pase de EMERGENCIA!' : 'Nuevo estudiante en camino', { duration: 6000 });
    if (ev === 'pass:sla') toast.warning(`Un estudiante no ha llegado a enfermería (${p.minutes} min)`);
    if (ev === 'observation:due') toast.warning('Hay una observación pendiente de reevaluación');
  });

  const transition = useMutation({
    mutationFn: (v: { id: string; to: string; note?: string }) => api(`/passes/${v.id}/transition`, { body: { to: v.to, note: v.note } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['board'] }),
  });
  const startCare = useMutation({
    mutationFn: (card: BoardCard) =>
      card.encounterId
        ? Promise.resolve({ id: card.encounterId })
        : api<{ id: string }>('/encounters', { body: { subjectType: 'STUDENT', studentId: card.student.id, passId: card.id, type: 'ILLNESS', chiefComplaint: card.reason }, idempotencyKey: idem() }),
    onSuccess: (e) => router.push(`/enfermeria/atenciones/${e.id}`),
  });

  const b = board.data;
  const transit = me?.settings.passTransitAlertMinutes ?? 10;

  return (
    <div>
      <PageHeader
        title="Tablero en vivo"
        description={
          <span className="inline-flex items-center gap-2">
            <Radio className={connected ? 'h-3.5 w-3.5 text-emerald-600' : 'h-3.5 w-3.5 text-muted'} /> {connected ? 'Conectado en tiempo real' : 'Reconectando…'}
          </span>
        }
        actions={
          <>
            <Button variant="outline" onClick={() => setReceiveOpen(true)}>
              <QrCode className="h-4 w-4" /> Recibir por QR / código
            </Button>
            <Button onClick={() => setNewOpen(true)}>
              <ClipboardPlus className="h-4 w-4" /> Nueva atención
            </Button>
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Pacientes abiertos" value={b?.kpis.open ?? '—'} icon={<Users />} tone="primary" />
        <StatCard label="Cerrados hoy" value={b?.kpis.closedToday ?? '—'} icon={<Activity />} tone="success" />
        <StatCard label="Tránsito promedio hoy" value={b?.kpis.avgTransitMinutes !== null && b?.kpis.avgTransitMinutes !== undefined ? `${b.kpis.avgTransitMinutes} min` : '—'} icon={<Clock />} />
        <StatCard label="Dosis pendientes" value={meds.data ? `${meds.data.counts.pending}` : '—'} hint={meds.data?.counts.overdue ? `${meds.data.counts.overdue} atrasadas` : undefined} icon={<Pill />} tone={meds.data?.counts.overdue ? 'danger' : 'neutral'} onClick={() => router.push('/enfermeria/medicacion')} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
        <div className="min-w-0">
          {board.isLoading ? (
            <div className="flex gap-3 overflow-hidden">
              {COLUMNS.map((c) => (
                <Skeleton key={c.key} className="h-96 min-w-[260px] flex-1" />
              ))}
            </div>
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-2">
              {COLUMNS.map((col) => {
                const cards = b?.columns[col.key] ?? [];
                const walkIns = col.key === 'IN_ROOM' ? (b?.walkIns.filter((w) => w.status === 'OPEN') ?? []) : col.key === 'OBSERVATION' ? (b?.walkIns.filter((w) => w.status === 'OBSERVATION') ?? []) : [];
                return (
                  <KanbanColumn key={col.key} title={col.title} count={cards.length + walkIns.length} tone={col.tone}>
                    {cards.length + walkIns.length === 0 && <p className="px-2 py-6 text-center text-sm text-muted">Sin pacientes</p>}
                    {cards.map((card) => (
                      <PassCard
                        key={card.id}
                        card={card}
                        transitAlert={transit}
                        onOpen={() => (card.encounterId ? router.push(`/enfermeria/atenciones/${card.encounterId}`) : undefined)}
                        actions={
                          <>
                            {['REQUESTED', 'IN_TRANSIT'].includes(card.state) && (
                              <Button size="sm" variant="success" onClick={() => transition.mutate({ id: card.id, to: 'RECEIVED' })} loading={transition.isPending && transition.variables?.id === card.id}>
                                Recibir
                              </Button>
                            )}
                            {['REQUESTED', 'IN_TRANSIT', 'RECEIVED', 'IN_CARE', 'OBSERVATION'].includes(card.state) && (
                              <Button size="sm" variant={card.state === 'RECEIVED' ? 'primary' : 'outline'} onClick={() => startCare.mutate(card)} loading={startCare.isPending && startCare.variables?.id === card.id}>
                                {card.encounterId ? 'Abrir atención' : 'Atender'}
                              </Button>
                            )}
                            {['WAITING_GUARDIAN', 'EXIT_AUTHORIZED'].includes(card.state) && card.encounterId && (
                              <Button size="sm" variant="outline" onClick={() => router.push(`/enfermeria/atenciones/${card.encounterId}`)}>
                                Ver salida
                              </Button>
                            )}
                            {['REQUESTED', 'IN_TRANSIT'].includes(card.state) && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  const note = window.prompt('Motivo de la cancelación');
                                  if (note) transition.mutate({ id: card.id, to: 'CANCELLED', note });
                                }}
                              >
                                Cancelar
                              </Button>
                            )}
                          </>
                        }
                      />
                    ))}
                    {walkIns.map((w) => (
                      <Link key={w.encounterId} href={`/enfermeria/atenciones/${w.encounterId}`} className="rounded-xl border border-border bg-card p-3 shadow-sm hover:shadow-md">
                        <div className="flex items-center gap-3">
                          <StudentAvatar src={w.student?.photoUrl} name={w.name} size={40} alert={w.anaphylaxis} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-semibold">{w.name}</p>
                            <p className="text-xs text-muted">{w.subjectType === 'STAFF' ? 'Personal del colegio' : (w.student?.group?.name ?? '')} · sin pase</p>
                            <p className="truncate text-sm">{w.chiefComplaint}</p>
                          </div>
                          <Elapsed since={w.startedAt} warnAfter={30} dangerAfter={60} />
                        </div>
                        {w.observationDueAt && (
                          <div className="mt-2">
                            <ObservationBadge dueAt={w.observationDueAt} />
                          </div>
                        )}
                      </Link>
                    ))}
                  </KanbanColumn>
                );
              })}
            </div>
          )}
        </div>

        <aside className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Medicación de hoy</CardTitle>
              <Link href="/enfermeria/medicacion" className="text-sm text-primary-700 hover:underline dark:text-primary-300">
                Ver agenda
              </Link>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {meds.data?.pendingReview ? (
                <Alert tone="info" title={`${meds.data.pendingReview} solicitud(es) por revisar`}>
                  <Link href="/enfermeria/medicacion?tab=solicitudes" className="underline">
                    Revisar ahora
                  </Link>
                </Alert>
              ) : null}
              {meds.isLoading && <Skeleton className="h-24" />}
              {meds.data?.scheduled.filter((s) => s.status === 'PENDING').length === 0 && <p className="text-sm text-muted">No hay dosis pendientes.</p>}
              {meds.data?.scheduled
                .filter((s) => s.status === 'PENDING')
                .slice(0, 8)
                .map((s) => (
                  <Link key={s.id} href={`/enfermeria/medicacion?dosis=${s.id}`} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-card-muted">
                    <span className={`tabular w-12 text-sm font-semibold ${s.overdue ? 'text-red-600' : s.dueNow ? 'text-emerald-700' : ''}`}>{s.time}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{s.student.name}</span>
                      <span className="block truncate text-xs text-muted">
                        {s.request.medicationName} · {s.request.dose} {s.request.doseUnit}
                      </span>
                    </span>
                    {s.overdue ? <Badge tone="danger">Atrasada</Badge> : s.dueNow ? <Badge tone="success">Ahora</Badge> : null}
                  </Link>
                ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Alertas de inventario</CardTitle>
              <Boxes className="h-5 w-5 text-muted" />
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              {inv.data?.lowStock.length === 0 && inv.data?.expiringSoon.length === 0 && <p className="text-muted">Sin alertas.</p>}
              {inv.data?.lowStock.slice(0, 5).map((i) => (
                <p key={i.id} className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600" /> <span className="flex-1 truncate">{i.name}</span>
                  <span className="tabular text-muted">
                    {i.stock} {i.unit}
                  </span>
                </p>
              ))}
              {inv.data?.expiringSoon.slice(0, 5).map((i) => (
                <p key={i.id} className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-red-600" /> <span className="flex-1 truncate">{i.name}</span> <span className="text-muted">vence pronto</span>
                </p>
              ))}
            </CardContent>
          </Card>
        </aside>
      </div>

      <NewEncounterDialog open={newOpen} onOpenChange={setNewOpen} />
      <ReceiveDialog open={receiveOpen} onOpenChange={setReceiveOpen} />
    </div>
  );
}

function NewEncounterDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const [subject, setSubject] = useState<'STUDENT' | 'STAFF'>('STUDENT');
  const [student, setStudent] = useState<StudentRow | null>(null);
  const [staffQ, setStaffQ] = useState('');
  const [staffId, setStaffId] = useState<string | null>(null);
  const [template, setTemplate] = useState('');
  const [type, setType] = useState<EncounterType>('ILLNESS');
  const [complaint, setComplaint] = useState('');
  const staff = useQuery({ queryKey: ['staff', staffQ], queryFn: () => api<{ id: string; firstName: string; lastName: string; staff: { position: string | null } | null }[]>('/staff', { query: { q: staffQ } }), enabled: open && subject === 'STAFF' });
  const create = useMutation({
    mutationFn: () =>
      api<{ id: string }>('/encounters', {
        body: { subjectType: subject, studentId: student?.id, staffPersonId: staffId, type: subject === 'STAFF' ? 'STAFF_FIRST_AID' : type, chiefComplaint: complaint, templateKey: template || null },
        idempotencyKey: idem(),
      }),
    onSuccess: (e) => {
      onOpenChange(false);
      router.push(`/enfermeria/atenciones/${e.id}`);
    },
  });
  const valid = complaint.trim().length >= 2 && (subject === 'STUDENT' ? !!student : !!staffId);
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Nueva atención"
      description="Para estudiantes que llegan sin pase o para personal del colegio."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => create.mutate()} disabled={!valid} loading={create.isPending}>
            Iniciar atención
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-card-muted p-1">
          {(['STUDENT', 'STAFF'] as const).map((s) => (
            <button key={s} onClick={() => setSubject(s)} className={`min-h-10 rounded-lg text-sm font-medium ${subject === s ? 'bg-card shadow-sm' : 'text-muted'}`}>
              {s === 'STUDENT' ? 'Estudiante' : 'Personal del colegio'}
            </button>
          ))}
        </div>
        {subject === 'STUDENT' ? (
          student ? (
            <div className="flex items-center gap-3 rounded-xl border border-border p-2">
              <StudentAvatar src={student.photoUrl} name={student.name} size={44} alert={student.alerts?.anaphylaxis} />
              <div className="flex-1">
                <p className="font-medium">{student.name}</p>
                <p className="text-xs text-muted">
                  {student.code} · {student.group?.name}
                </p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setStudent(null)}>
                Cambiar
              </Button>
            </div>
          ) : (
            <StudentPicker autoFocus onSelect={setStudent} />
          )
        ) : (
          <Field label="Buscar persona del personal">
            <Input value={staffQ} onChange={(e) => setStaffQ(e.target.value)} placeholder="Nombre o documento" />
            <div className="mt-2 flex max-h-48 flex-col gap-1 overflow-y-auto">
              {staff.data?.map((p) => (
                <button key={p.id} onClick={() => setStaffId(p.id)} className={`rounded-lg px-2 py-2 text-left text-sm ${staffId === p.id ? 'bg-primary-100 dark:bg-primary-900' : 'hover:bg-card-muted'}`}>
                  {p.firstName} {p.lastName} <span className="text-muted">{p.staff?.position}</span>
                </button>
              ))}
            </div>
          </Field>
        )}
        {subject === 'STUDENT' && (
          <Field label="Plantilla (opcional)">
            <div className="flex flex-wrap gap-1.5">
              {ENCOUNTER_TEMPLATES.map((t) => (
                <button
                  key={t.key}
                  onClick={() => {
                    setTemplate(t.key);
                    setType(t.type);
                    setComplaint(t.label);
                  }}
                  className={`min-h-9 rounded-full border px-3 text-sm ${template === t.key ? 'border-primary-600 bg-primary-600 text-white' : 'border-border hover:bg-card-muted'}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </Field>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {subject === 'STUDENT' && (
            <Field label="Tipo">
              <Select value={type} onChange={(e) => setType(e.target.value as EncounterType)}>
                {Object.entries(ENCOUNTER_TYPE_LABELS)
                  .filter(([k]) => k !== 'STAFF_FIRST_AID')
                  .map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
              </Select>
            </Field>
          )}
          <Field label="Motivo de consulta" required className={subject === 'STAFF' ? 'sm:col-span-2' : ''}>
            <Input value={complaint} onChange={(e) => setComplaint(e.target.value)} placeholder="Ej.: dolor de cabeza" />
          </Field>
        </div>
      </div>
    </Dialog>
  );
}

function ReceiveDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const [code, setCode] = useState('');
  const [scanning, setScanning] = useState(false);
  const scanner = useRef<Html5Qrcode | null>(null);
  const receive = useMutation({
    mutationFn: (c: string) => api<{ student: { name: string } }>('/passes/receive', { body: { code: c } }),
    onSuccess: (p) => {
      toast.success(`${p.student.name} recibido en enfermería · ${fmtTime(new Date())}`);
      qc.invalidateQueries({ queryKey: ['board'] });
      setCode('');
      onOpenChange(false);
    },
  });
  useEffect(() => {
    if (!open || !scanning) return;
    const s = new Html5Qrcode('qr-receive');
    scanner.current = s;
    s.start({ facingMode: 'environment' }, { fps: 10, qrbox: 220 }, (text) => {
      s.stop().catch(() => undefined);
      setScanning(false);
      receive.mutate(text);
    }, () => undefined).catch(() => {
      toast.error('No fue posible acceder a la cámara.');
      setScanning(false);
    });
    return () => {
      s.stop().catch(() => undefined);
    };
    // Dependencies intentionally limited (subscription set up once).
  }, [open, scanning]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Recibir estudiante" description="Escanee el QR del pase o escriba el código corto.">
      <div className="flex flex-col gap-4">
        {scanning ? <div id="qr-receive" className="overflow-hidden rounded-xl" /> : <Button variant="outline" size="lg" onClick={() => setScanning(true)}><QrCode className="h-5 w-5" /> Escanear con la cámara</Button>}
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.trim()) receive.mutate(code.trim());
          }}
        >
          <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Código (6 caracteres)" maxLength={80} className="tabular text-lg tracking-widest" aria-label="Código del pase" />
          <Button type="submit" loading={receive.isPending}>
            Recibir
          </Button>
        </form>
      </div>
    </Dialog>
  );
}

export default function NursingBoardPage() {
  return (
    <Suspense>
      <BoardInner />
    </Suspense>
  );
}
