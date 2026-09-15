'use client';

import { Alert, Card, Skeleton } from '@sgee/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CheckCircle2, ShieldCheck } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { type ExitConfirmBody, ExitConfirmForm, type PickupOption } from '@/components/exit-confirm-form';
import { ClientOnly, FormPageFallback } from '@/components/client-only';
import { api, errorMessage } from '@/lib/api';

interface PublicExit {
  tenant: string;
  student: { firstName: string; lastName: string; group: string | null };
  reason: string;
  status: string;
  expired: boolean;
  confirmed: boolean;
  pickupName: string | null;
  options: PickupOption[];
}

function Inner() {
  const token = useSearchParams().get('token') ?? '';
  const [done, setDone] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['public-exit', token], queryFn: () => api<PublicExit>(`/public/exit-confirmations/${encodeURIComponent(token)}`), enabled: !!token, retry: false });
  const confirm = useMutation({
    mutationFn: (b: ExitConfirmBody) => api<{ pickupName: string }>(`/public/exit-confirmations/${encodeURIComponent(token)}`, { body: b }),
    onSuccess: (r) => setDone(r.pickupName),
  });

  return (
    <main className="grid min-h-dvh place-items-center p-4">
      <Card className="w-full max-w-lg p-6">
        <div className="mb-4 flex items-center gap-3">
          <img src="/icon.svg" alt="" className="h-9 w-9" />
          <div>
            <p className="font-semibold">Confirmación de salida</p>
            <p className="text-xs text-muted">{q.data?.tenant ?? 'MediSchool'}</p>
          </div>
        </div>
        {!token && <Alert tone="danger">Enlace inválido.</Alert>}
        {q.isLoading && <Skeleton className="h-48" />}
        {q.error && <Alert tone="danger">{errorMessage(q.error)}</Alert>}
        {q.data && (
          <>
            <p className="text-lg">
              Enfermería solicita que recojan a <strong>{q.data.student.firstName} {q.data.student.lastName}</strong> ({q.data.student.group}).
            </p>
            <p className="mt-2 rounded-xl bg-card-muted p-3 text-sm">{q.data.reason}</p>
            <div className="mt-5">
              {done || q.data.confirmed ? (
                <div className="flex flex-col items-center gap-2 py-6 text-center">
                  <CheckCircle2 className="h-12 w-12 text-emerald-600" />
                  <p className="text-lg font-semibold">Salida confirmada</p>
                  <p className="text-muted">Portería entregará al estudiante a {done ?? q.data.pickupName} con documento de identidad.</p>
                </div>
              ) : q.data.expired ? (
                <Alert tone="warning">Este enlace ya fue utilizado o expiró. Comuníquese con enfermería del colegio.</Alert>
              ) : (
                <>
                  {confirm.error && <Alert tone="danger" className="mb-3">{errorMessage(confirm.error)}</Alert>}
                  <ExitConfirmForm options={q.data.options} onSubmit={(b) => confirm.mutate(b)} loading={confirm.isPending} />
                </>
              )}
            </div>
          </>
        )}
        <p className="mt-6 flex items-center gap-2 text-xs text-muted">
          <ShieldCheck className="h-4 w-4" /> Enlace firmado de un solo uso. No contiene información clínica.
        </p>
      </Card>
    </main>
  );
}

export default function PublicExitConfirmPage() {
  return (
    <ClientOnly fallback={<FormPageFallback />}>
      <Suspense fallback={<FormPageFallback />}>
        <Inner />
      </Suspense>
    </ClientOnly>
  );
}
