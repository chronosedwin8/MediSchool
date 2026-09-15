'use client';

import { Alert, Card, PageHeader, Skeleton } from '@sgee/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { Suspense, use, useState } from 'react';
import { type ExitConfirmBody, ExitConfirmForm, type PickupOption } from '@/components/exit-confirm-form';
import { api } from '@/lib/api';

interface Student {
  name: string;
  guardians: { personId: string; name: string; relationship: string; canPickUp: boolean; judicialRestriction: boolean }[];
  emergencyContacts: { name: string; relationship: string; canPickUp: boolean }[];
}

function Inner({ id }: { id: string }) {
  const params = useSearchParams();
  const studentId = params.get('student');
  const qc = useQueryClient();
  const [done, setDone] = useState<string | null>(null);
  const s = useQuery({ queryKey: ['student', studentId], queryFn: () => api<Student>(`/students/${studentId}`), enabled: !!studentId });
  const confirm = useMutation({
    mutationFn: (b: ExitConfirmBody) => api<{ pickupName: string }>(`/exit-authorizations/${id}/confirm`, { body: b }),
    onSuccess: (r) => {
      setDone(r.pickupName);
      qc.invalidateQueries({ queryKey: ['portal-home'] });
    },
  });
  if (!studentId) return <Alert tone="danger">Enlace incompleto.</Alert>;
  if (s.isLoading || !s.data) return <Skeleton className="h-64" />;
  const options: PickupOption[] = [
    ...s.data.guardians.filter((g) => g.canPickUp && !g.judicialRestriction).map((g) => ({ kind: 'GUARDIAN' as const, personId: g.personId, name: g.name, relationship: g.relationship, document: null })),
    ...s.data.emergencyContacts.filter((c) => c.canPickUp).map((c) => ({ kind: 'CONTACT' as const, personId: null, name: c.name, relationship: c.relationship, document: null })),
  ];
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Confirmar salida" description={`Enfermería solicita que recojan a ${s.data.name}.`} />
      <Card className="p-5">
        {done ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <CheckCircle2 className="h-12 w-12 text-emerald-600" />
            <p className="text-lg font-semibold">Confirmado</p>
            <p className="text-muted">Portería entregará al estudiante a {done} presentando su documento.</p>
          </div>
        ) : (
          <ExitConfirmForm options={options} onSubmit={(b) => confirm.mutate(b)} loading={confirm.isPending} />
        )}
      </Card>
    </div>
  );
}

export default function FamilyExitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense>
      <Inner id={id} />
    </Suspense>
  );
}
