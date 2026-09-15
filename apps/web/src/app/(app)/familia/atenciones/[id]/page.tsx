'use client';

import { Button, Card, PageHeader, Skeleton, StudentAvatar } from '@sgee/ui';
import { useQuery } from '@tanstack/react-query';
import { FileDown, MessageSquare } from 'lucide-react';
import Link from 'next/link';
import { use } from 'react';
import { api, openFile } from '@/lib/api';
import { fmtDateTime, fmtTime } from '@/lib/format';

interface ParentEncounter {
  id: string;
  startedAt: string;
  endedAt: string | null;
  chiefComplaint: string;
  typeLabel: string;
  dispositionLabel: string | null;
  parentSummary: string | null;
  attendedBy: string | null;
  vitals: { takenAt: string; temperatureC: number | null }[];
  treatments: { description: string }[];
  referral: { destination: string; transport: string } | null;
  student: { id: string; name: string; photoUrl: string | null; group: { name: string } | null } | null;
}

export default function FamilyEncounterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const q = useQuery({ queryKey: ['encounter', id, 'parent'], queryFn: () => api<ParentEncounter>(`/encounters/${id}`) });
  if (q.isLoading || !q.data) return <Skeleton className="h-64" />;
  const e = q.data;
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Atención en enfermería" description={fmtDateTime(e.startedAt)} />
      <Card className="p-5">
        {e.student && (
          <div className="mb-4 flex items-center gap-3">
            <StudentAvatar src={e.student.photoUrl} name={e.student.name} size={52} />
            <div>
              <p className="font-semibold">{e.student.name}</p>
              <p className="text-sm text-muted">{e.student.group?.name}</p>
            </div>
          </div>
        )}
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted">Motivo</dt>
          <dd className="font-medium">{e.chiefComplaint}</dd>
          <dt className="text-muted">Horario</dt>
          <dd>
            {fmtTime(e.startedAt)} – {fmtTime(e.endedAt)}
          </dd>
          <dt className="text-muted">Conducta</dt>
          <dd>{e.dispositionLabel}</dd>
          <dt className="text-muted">Atendido por</dt>
          <dd>{e.attendedBy}</dd>
          {e.vitals.some((v) => v.temperatureC) && (
            <>
              <dt className="text-muted">Temperatura</dt>
              <dd>{e.vitals.filter((v) => v.temperatureC).map((v) => `${v.temperatureC} °C (${fmtTime(v.takenAt)})`).join(', ')}</dd>
            </>
          )}
          {e.treatments.length > 0 && (
            <>
              <dt className="text-muted">Cuidados</dt>
              <dd>{e.treatments.map((t) => t.description).join(', ')}</dd>
            </>
          )}
          {e.referral && (
            <>
              <dt className="text-muted">Traslado</dt>
              <dd>{e.referral.destination}</dd>
            </>
          )}
        </dl>
        {e.parentSummary && <p className="mt-4 rounded-xl bg-card-muted p-3 text-sm leading-relaxed">{e.parentSummary}</p>}
        <div className="mt-5 flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => openFile(`/encounters/${id}/pdf`)}>
            <FileDown className="h-4 w-4" /> Constancia PDF
          </Button>
          <Link href={`/mensajes?student=${e.student?.id ?? ''}`}>
            <Button variant="ghost">
              <MessageSquare className="h-4 w-4" /> Escribir a enfermería
            </Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
