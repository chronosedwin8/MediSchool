'use client';

import { Alert, Badge, Button, Card, EmptyState, Field, Input, PageHeader, SignaturePad, Skeleton, StudentAvatar } from '@sgee/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Html5Qrcode } from 'html5-qrcode';
import { CheckCircle2, DoorOpen, IdCard, QrCode, Radio, ScanLine } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Dialog } from '@/components/dialog';
import { api, errorMessage, idem } from '@/lib/api';
import { fmtTime, relative } from '@/lib/format';
import { useLive } from '@/lib/live';
import { postOrQueue } from '@/lib/offline-queue';

interface ExitItem {
  id: string;
  status: 'PENDING_GUARDIAN' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED';
  pickupName: string | null;
  pickupDocument: string | null;
  pickupRelationship: string | null;
  confirmedAt: string | null;
  estimatedArrival: string | null;
  standing: boolean;
  reason: string;
  student: { id: string; name: string; code: string; photoUrl: string | null; group: { name: string } | null; age: number | null };
}

interface Queue {
  queue: ExitItem[];
  recent: { id: string; checkedOutAt: string; method: string; pickupName: string | null; student: ExitItem['student'] }[];
}

export default function GatePage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['gate-queue'], queryFn: () => api<Queue>('/gate/queue'), refetchInterval: 30_000 });
  const [selected, setSelected] = useState<ExitItem | null>(null);
  const [scan, setScan] = useState(false);
  const [code, setCode] = useState('');
  const connected = useLive(['gate:updated'], [['gate-queue']], () => undefined);
  const lookup = useMutation({
    mutationFn: (c: string) => api<ExitItem>('/gate/lookup', { query: { code: c } }),
    onSuccess: (x) => {
      setSelected(x);
      setCode('');
    },
  });

  const confirmed = q.data?.queue.filter((x) => x.status === 'CONFIRMED') ?? [];
  const pending = q.data?.queue.filter((x) => x.status === 'PENDING_GUARDIAN') ?? [];

  return (
    <div>
      <PageHeader
        title="Portería"
        description={
          <span className="inline-flex items-center gap-2">
            <Radio className={connected ? 'h-3.5 w-3.5 text-emerald-600' : 'h-3.5 w-3.5 text-muted'} /> Salidas autorizadas por enfermería
          </span>
        }
        actions={
          <>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (code.trim()) lookup.mutate(code.trim());
              }}
            >
              <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Código del pase" className="tabular w-44 tracking-widest" aria-label="Código" />
              <Button type="submit" variant="outline" loading={lookup.isPending}>
                Buscar
              </Button>
            </form>
            <Button size="lg" onClick={() => setScan(true)}>
              <ScanLine className="h-5 w-5" /> Escanear QR
            </Button>
          </>
        }
      />

      {q.isLoading && <Skeleton className="h-64" />}
      <section aria-labelledby="ready">
        <h2 id="ready" className="mb-3 flex items-center gap-2 text-lg font-semibold">
          Listos para salir <Badge tone="success">{confirmed.length}</Badge>
        </h2>
        {confirmed.length === 0 && !q.isLoading && <EmptyState icon={<DoorOpen />} title="No hay salidas confirmadas" description="Cuando el acudiente confirme quién recoge, aparecerá aquí con la foto del estudiante." />}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {confirmed.map((x) => (
            <Card key={x.id} className="flex flex-col gap-4 border-emerald-300 p-5 dark:border-emerald-800">
              <div className="flex items-center gap-4">
                <StudentAvatar src={x.student.photoUrl} name={x.student.name} size={112} className="rounded-2xl" />
                <div className="min-w-0">
                  <p className="text-xl font-semibold leading-tight">{x.student.name}</p>
                  <p className="text-sm text-muted">
                    {x.student.group?.name} · código {x.student.code}
                  </p>
                  <Badge tone="success" className="mt-2">
                    Confirmado {relative(x.confirmedAt)}
                  </Badge>
                </div>
              </div>
              <div className="rounded-xl bg-card-muted p-3">
                <p className="text-xs text-muted">Recoge</p>
                <p className="text-lg font-semibold">{x.pickupName}</p>
                <p className="text-sm">
                  {x.pickupRelationship} {x.pickupDocument && <span className="tabular">· Doc. {x.pickupDocument}</span>}
                </p>
                {x.estimatedArrival && <p className="text-sm text-muted">Llegada estimada {x.estimatedArrival}</p>}
              </div>
              <Button size="xl" variant="success" onClick={() => setSelected(x)}>
                <CheckCircle2 className="h-6 w-6" /> Entregar
              </Button>
            </Card>
          ))}
        </div>
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 flex items-center gap-2 font-semibold">
            Esperando confirmación del acudiente <Badge tone="warning">{pending.length}</Badge>
          </h2>
          <ul className="flex flex-col gap-2">
            {pending.map((x) => (
              <li key={x.id}>
                <Card className="flex items-center gap-3 p-3">
                  <StudentAvatar src={x.student.photoUrl} name={x.student.name} size={48} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{x.student.name}</p>
                    <p className="text-xs text-muted">{x.student.group?.name} · no entregar hasta confirmación</p>
                  </div>
                  <Badge tone="warning">Pendiente</Badge>
                </Card>
              </li>
            ))}
            {pending.length === 0 && <p className="text-sm text-muted">Ninguna.</p>}
          </ul>
        </section>
        <section>
          <h2 className="mb-3 font-semibold">Salidas registradas hoy</h2>
          <ul className="flex flex-col gap-2">
            {q.data?.recent.map((r) => (
              <li key={r.id} className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2">
                <StudentAvatar src={r.student.photoUrl} name={r.student.name} size={36} />
                <span className="min-w-0 flex-1 truncate text-sm">
                  <strong>{r.student.name}</strong> con {r.pickupName}
                </span>
                <span className="tabular text-sm text-muted">{fmtTime(r.checkedOutAt)}</span>
              </li>
            ))}
            {q.data?.recent.length === 0 && <p className="text-sm text-muted">Sin salidas.</p>}
          </ul>
        </section>
      </div>

      {scan && <ScanDialog onClose={() => setScan(false)} onCode={(c) => { setScan(false); lookup.mutate(c); }} />}
      {selected && <CheckoutDialog exit={selected} onClose={() => setSelected(null)} onDone={() => { setSelected(null); qc.invalidateQueries({ queryKey: ['gate-queue'] }); }} />}
    </div>
  );
}

function ScanDialog({ onClose, onCode }: { onClose: () => void; onCode: (c: string) => void }) {
  const done = useRef(false);
  useEffect(() => {
    const s = new Html5Qrcode('qr-gate');
    s.start({ facingMode: 'environment' }, { fps: 10, qrbox: 240 }, (text) => {
      if (done.current) return;
      done.current = true;
      s.stop().catch(() => undefined);
      onCode(text);
    }, () => undefined).catch(() => toast.error('No fue posible acceder a la cámara.'));
    return () => {
      s.stop().catch(() => undefined);
    };
  }, [onCode]);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Escanear QR" description="Apunte la cámara al código del pase o de la autorización.">
      <div id="qr-gate" className="overflow-hidden rounded-xl bg-black" />
      <p className="mt-3 flex items-center gap-2 text-sm text-muted">
        <QrCode className="h-4 w-4" /> También puede escribir el código corto del pase.
      </p>
    </Dialog>
  );
}

function CheckoutDialog({ exit, onClose, onDone }: { exit: ExitItem; onClose: () => void; onDone: () => void }) {
  const [method, setMethod] = useState<'DOCUMENT' | 'QR' | 'MANUAL'>(exit.standing ? 'MANUAL' : 'DOCUMENT');
  const [doc, setDoc] = useState('');
  const [signature, setSignature] = useState<string | null>(null);
  const [observations, setObservations] = useState('');
  const [key] = useState(idem());
  const [sending, setSending] = useState(false);
  const docOk = method !== 'DOCUMENT' || exit.standing || (!!doc && doc.replace(/\D/g, '') === (exit.pickupDocument ?? '').replace(/\D/g, ''));

  if (exit.status !== 'CONFIRMED') {
    return (
      <Dialog open onOpenChange={(o) => !o && onClose()} title={exit.student.name}>
        <Alert tone="danger" title="No entregue al estudiante">
          {exit.status === 'PENDING_GUARDIAN' ? 'El acudiente aún no ha confirmado quién recoge.' : exit.status === 'COMPLETED' ? 'Esta salida ya fue registrada.' : 'La autorización no está vigente.'}
        </Alert>
      </Dialog>
    );
  }

  const submit = async () => {
    setSending(true);
    try {
      const r = await postOrQueue('/gate-checkouts', { exitAuthorizationId: exit.id, method, verifiedDocument: method === 'DOCUMENT' ? doc : null, observations: observations || null, signature }, `Salida de ${exit.student.name}`, key);
      toast.success(r.queued ? 'Sin conexión: la salida se registrará al reconectar.' : `Salida registrada: ${exit.student.name}`);
      onDone();
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
      title="Registrar entrega"
      size="lg"
      footer={
        <Button size="xl" variant="success" className="w-full" disabled={!docOk} loading={sending} onClick={submit}>
          <CheckCircle2 className="h-6 w-6" /> Confirmar entrega
        </Button>
      }
    >
      <div className="grid gap-5 md:grid-cols-2">
        <div className="flex flex-col items-center gap-2 text-center">
          <StudentAvatar src={exit.student.photoUrl} name={exit.student.name} size={180} className="rounded-3xl" />
          <p className="text-xl font-semibold">{exit.student.name}</p>
          <p className="text-sm text-muted">
            {exit.student.group?.name} · {exit.student.age ?? '—'} años
          </p>
        </div>
        <div className="flex flex-col gap-4">
          <div className="rounded-xl bg-card-muted p-3">
            <p className="text-xs text-muted">Persona autorizada</p>
            <p className="text-lg font-semibold">{exit.pickupName}</p>
            <p className="text-sm">
              {exit.pickupRelationship} · Doc. <span className="tabular font-semibold">{exit.pickupDocument ?? '—'}</span>
            </p>
          </div>
          {!exit.standing && (
            <Field label="Método de verificación">
              <div className="grid grid-cols-3 gap-2">
                {([['DOCUMENT', 'Documento'], ['QR', 'QR'], ['MANUAL', 'Manual']] as const).map(([k, l]) => (
                  <button key={k} onClick={() => setMethod(k)} className={`min-h-11 rounded-xl border text-sm ${method === k ? 'border-primary-700 bg-primary-700 text-white' : 'border-border'}`}>
                    {l}
                  </button>
                ))}
              </div>
            </Field>
          )}
          {method === 'DOCUMENT' && !exit.standing && (
            <Field label="Número de documento presentado" error={doc && !docOk ? 'No coincide con el documento autorizado. No entregue.' : null}>
              <div className="relative">
                <IdCard className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
                <Input value={doc} onChange={(e) => setDoc(e.target.value.replace(/\D/g, ''))} inputMode="numeric" className="tabular pl-10 text-lg" aria-invalid={!!doc && !docOk} autoFocus />
              </div>
            </Field>
          )}
          {method === 'MANUAL' && !exit.standing && <Alert tone="warning">Registre en observaciones cómo verificó la identidad.</Alert>}
          <Field label="Firma de quien recoge (opcional)">
            <SignaturePad onChange={setSignature} height={130} />
          </Field>
          <Field label="Observaciones">
            <Input value={observations} onChange={(e) => setObservations(e.target.value)} />
          </Field>
        </div>
      </div>
    </Dialog>
  );
}
