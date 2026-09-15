'use client';

import { PASS_REASON_CHIPS } from '@sgee/shared';
import { Alert, Badge, Button, Card, cn, EmptyState, Field, Input, PageHeader, Skeleton, StudentAvatar, Textarea } from '@sgee/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, CloudOff, HeartPulse, Send, Users } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Dialog } from '@/components/dialog';
import { Elapsed } from '@/components/pass-card';
import { api, errorMessage, idem } from '@/lib/api';
import { fmtTime } from '@/lib/format';
import { useLive } from '@/lib/live';
import { postOrQueue } from '@/lib/offline-queue';

interface ClassGroup {
  id: string;
  name: string;
  grade: string;
  subject: string | null;
  isCurrent: boolean;
  students: { id: string; code: string; name: string; photoUrl: string | null; medicalAlert: boolean; openPass: { id: string; state: string; label: string; requestedAt: string } | null }[];
}

interface MyPass {
  id: string;
  state: string;
  stateLabel: string;
  reason: string;
  requestedAt: string;
  student: { id: string; name: string; photoUrl: string | null; group: { name: string } | null };
  nextStates: string[];
}

const STATE_TONE: Record<string, 'info' | 'primary' | 'success' | 'warning' | 'danger' | 'neutral' | 'violet'> = {
  REQUESTED: 'info',
  IN_TRANSIT: 'info',
  RECEIVED: 'primary',
  IN_CARE: 'primary',
  OBSERVATION: 'violet',
  RETURNED_TO_CLASS: 'success',
  WAITING_GUARDIAN: 'warning',
  EXIT_AUTHORIZED: 'warning',
  HANDED_OVER: 'neutral',
  TRANSFERRED_IPS: 'danger',
  CLOSED: 'neutral',
  CANCELLED: 'neutral',
  EXPIRED: 'danger',
};

function TeacherInner() {
  const qc = useQueryClient();
  const params = useSearchParams();
  const [groupId, setGroupId] = useState<string | null>(null);
  const [selected, setSelected] = useState<ClassGroup['students'][number] | null>(null);
  const classes = useQuery({ queryKey: ['teacher-class'], queryFn: () => api<ClassGroup[]>('/teacher/class'), refetchInterval: 60_000 });
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
  const passes = useQuery({ queryKey: ['my-passes', today], queryFn: () => api<MyPass[]>('/passes', { query: { mine: true, from: today, to: today, limit: 50 } }), refetchInterval: 60_000 });
  useLive(['pass:updated', 'notification'], [['teacher-class'], ['my-passes']], (ev, p) => {
    if (ev === 'pass:updated' && p.state === 'RETURNED_TO_CLASS') toast.success('Un estudiante regresa al aula desde enfermería');
    if (ev === 'pass:updated' && p.state === 'RECEIVED') toast.info('Su estudiante llegó a enfermería');
  });

  useEffect(() => {
    if (!groupId && classes.data?.length) setGroupId(classes.data[0].id);
  }, [classes.data, groupId]);

  useEffect(() => {
    const sid = params.get('student');
    if (sid && classes.data) {
      const s = classes.data.flatMap((g) => g.students).find((x) => x.id === sid);
      if (s) setSelected(s);
    }
  }, [params, classes.data]);

  const close = useMutation({
    mutationFn: (id: string) => api(`/passes/${id}/transition`, { body: { to: 'CLOSED', note: 'Recibido en el aula' } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-passes'] });
      qc.invalidateQueries({ queryKey: ['teacher-class'] });
    },
  });

  const group = classes.data?.find((g) => g.id === groupId);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Mi clase" description="Toque un estudiante para enviarlo a enfermería." />
      {classes.isLoading && <Skeleton className="h-64" />}
      {classes.data?.length === 0 && <EmptyState icon={<Users />} title="No tiene grupos asignados" description="Solicite a la administración que le asigne sus grupos." />}

      {!!classes.data?.length && (
        <div className="mb-4 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Grupos">
          {classes.data.map((g) => (
            <button key={g.id} role="tab" aria-selected={g.id === groupId} onClick={() => setGroupId(g.id)} className={cn('min-h-11 shrink-0 rounded-full border px-4 text-sm font-medium', g.id === groupId ? 'border-primary-700 bg-primary-700 text-white' : 'border-border bg-card')}>
              {g.name} {g.isCurrent && <span className="ml-1 rounded-full bg-emerald-500 px-1.5 text-[10px] text-white">Ahora</span>}
              {g.subject && <span className="ml-1 opacity-70">· {g.subject}</span>}
            </button>
          ))}
        </div>
      )}

      {group && (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
          {group.students.map((s) => (
            <li key={s.id}>
              <button onClick={() => setSelected(s)} disabled={!!s.openPass} className={cn('flex w-full flex-col items-center gap-2 rounded-2xl border bg-card p-3 text-center shadow-sm transition active:scale-[0.98] disabled:opacity-70', s.openPass ? 'border-primary-300' : 'border-border hover:border-primary-400')}>
                <StudentAvatar src={s.photoUrl} name={s.name} size={64} alert={s.medicalAlert} />
                <span className="line-clamp-2 text-sm font-medium leading-tight">{s.name}</span>
                {s.openPass ? <Badge tone={STATE_TONE[s.openPass.state]}>{s.openPass.label}</Badge> : s.medicalAlert ? (
                  <Badge tone="danger">
                    <HeartPulse className="h-3 w-3" /> Alerta médica
                  </Badge>
                ) : (
                  <span className="h-5" />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">Pases de hoy</h2>
        {passes.data?.length === 0 && <p className="text-sm text-muted">Aún no ha enviado estudiantes hoy.</p>}
        <ul className="flex flex-col gap-2">
          <AnimatePresence initial={false}>
            {passes.data?.map((p) => (
              <motion.li key={p.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <Card className="flex items-center gap-3 p-3">
                  <StudentAvatar src={p.student.photoUrl} name={p.student.name} size={44} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{p.student.name}</p>
                    <p className="truncate text-xs text-muted">
                      {fmtTime(p.requestedAt)} · {p.reason}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge tone={STATE_TONE[p.state]}>{p.stateLabel}</Badge>
                    {['REQUESTED', 'IN_TRANSIT'].includes(p.state) && <Elapsed since={p.requestedAt} />}
                  </div>
                  {p.nextStates.includes('CLOSED') && (
                    <Button size="sm" variant="success" onClick={() => close.mutate(p.id)} loading={close.isPending && close.variables === p.id}>
                      <CheckCircle2 className="h-4 w-4" /> Llegó
                    </Button>
                  )}
                </Card>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      </section>

      {selected && <PassDialog student={selected} subject={group?.subject ?? null} onClose={() => setSelected(null)} />}
    </div>
  );
}

function PassDialog({ student, subject, onClose }: { student: ClassGroup['students'][number]; subject: string | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState<string>('');
  const [other, setOther] = useState('');
  const [urgency, setUrgency] = useState<'MEDIUM' | 'HIGH' | 'EMERGENCY'>('MEDIUM');
  const [accompanied, setAccompanied] = useState(false);
  const [companionName, setCompanionName] = useState('');
  const [sending, setSending] = useState(false);
  const [key] = useState(idem());
  const finalReason = reason === 'Otro' ? other.trim() : reason;

  const send = async () => {
    setSending(true);
    try {
      const body = { studentId: student.id, reason: finalReason, urgency, accompanied, companionName: accompanied ? companionName || null : null, subject, clientCreatedAt: new Date().toISOString() };
      const r = await postOrQueue('/passes', body, `Pase de ${student.name}`, key);
      if (r.queued) toast.warning('Sin conexión: el pase se enviará automáticamente al reconectar.', { icon: <CloudOff className="h-4 w-4" /> });
      else toast.success(`${student.name} va en camino a enfermería`);
      qc.invalidateQueries({ queryKey: ['my-passes'] });
      qc.invalidateQueries({ queryKey: ['teacher-class'] });
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={
        <span className="flex items-center gap-3">
          <StudentAvatar src={student.photoUrl} name={student.name} size={40} alert={student.medicalAlert} /> {student.name}
        </span>
      }
      description="Pase a enfermería"
      footer={
        <Button size="xl" className="w-full" onClick={send} disabled={!finalReason} loading={sending} variant={urgency === 'EMERGENCY' ? 'danger' : 'primary'}>
          <Send className="h-5 w-5" /> {urgency === 'EMERGENCY' ? 'Solicitar enfermera al aula' : 'Enviar a enfermería'}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {student.medicalAlert && <Alert tone="danger" title="Estudiante con alerta médica">Si presenta dificultad para respirar, hinchazón o pérdida de conciencia, marque EMERGENCIA.</Alert>}
        <Field label="Motivo">
          <div className="flex flex-wrap gap-2">
            {PASS_REASON_CHIPS.map((c) => (
              <button key={c} onClick={() => setReason(c)} className={cn('min-h-11 rounded-full border px-3.5 text-sm', reason === c ? 'border-primary-700 bg-primary-700 text-white' : 'border-border bg-card hover:bg-card-muted')}>
                {c}
              </button>
            ))}
          </div>
          {reason === 'Otro' && <Textarea className="mt-2" rows={2} value={other} onChange={(e) => setOther(e.target.value)} placeholder="Describa brevemente" autoFocus />}
        </Field>
        <Field label="Urgencia">
          <div className="grid grid-cols-3 gap-2">
            {([['MEDIUM', 'Normal'], ['HIGH', 'Alta'], ['EMERGENCY', 'Emergencia']] as const).map(([k, l]) => (
              <button key={k} onClick={() => setUrgency(k)} className={cn('min-h-12 rounded-xl border text-sm font-medium', urgency === k ? (k === 'EMERGENCY' ? 'border-red-600 bg-red-600 text-white' : k === 'HIGH' ? 'border-amber-500 bg-amber-500 text-amber-950' : 'border-primary-700 bg-primary-700 text-white') : 'border-border')}>
                {l}
              </button>
            ))}
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setAccompanied(false)} className={cn('min-h-12 rounded-xl border text-sm', !accompanied ? 'border-primary-700 bg-primary-50 font-medium dark:bg-primary-950' : 'border-border')}>
            Va solo(a)
          </button>
          <button onClick={() => setAccompanied(true)} className={cn('min-h-12 rounded-xl border text-sm', accompanied ? 'border-primary-700 bg-primary-50 font-medium dark:bg-primary-950' : 'border-border')}>
            Acompañado(a)
          </button>
        </div>
        {accompanied && <Input placeholder="Nombre del acompañante (opcional)" value={companionName} onChange={(e) => setCompanionName(e.target.value)} />}
      </div>
    </Dialog>
  );
}

export default function TeacherPage() {
  return (
    <Suspense>
      <TeacherInner />
    </Suspense>
  );
}
