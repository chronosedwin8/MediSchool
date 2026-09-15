'use client';

import { Badge, Card, EmptyState, PageHeader, Skeleton, StudentAvatar } from '@sgee/ui';
import { useQuery } from '@tanstack/react-query';
import { QrCode } from 'lucide-react';
import { api } from '@/lib/api';
import { useLive } from '@/lib/live';

export default function StudentPassPage() {
  const q = useQuery({ queryKey: ['student-portal'], queryFn: () => api<{ student: { name: string; photoUrl: string | null; group: { name: string } | null }; pass: { code: string; label: string; qr: string } | null }>('/portal/student'), refetchInterval: 30_000 });
  useLive(['pass:updated'], [['student-portal']]);
  return (
    <div className="mx-auto max-w-sm">
      <PageHeader title="Mi pase" />
      {q.isLoading && <Skeleton className="h-96" />}
      {q.data && (
        <Card className="flex flex-col items-center gap-3 p-6 text-center">
          <StudentAvatar src={q.data.student.photoUrl} name={q.data.student.name} size={88} />
          <p className="text-lg font-semibold">{q.data.student.name}</p>
          <p className="text-sm text-muted">{q.data.student.group?.name}</p>
          {q.data.pass ? (
            <>
              <img src={q.data.pass.qr} alt="Código QR del pase" className="h-64 w-64 rounded-xl bg-white p-3" />
              <p className="tabular text-2xl font-bold tracking-widest">{q.data.pass.code}</p>
              <Badge tone="primary">{q.data.pass.label}</Badge>
              <p className="text-xs text-muted">Muestre este código en enfermería.</p>
            </>
          ) : (
            <EmptyState icon={<QrCode />} title="No tiene un pase activo" />
          )}
        </Card>
      )}
    </div>
  );
}
