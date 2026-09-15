'use client';

import { Alert, Badge, Button, Card, PatientHeader, Skeleton } from '@sgee/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Phone, Siren } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, idem } from '@/lib/api';
import { RELATIONSHIP_LABELS } from '@/lib/format';
import { Dialog } from './dialog';
import { StudentPicker, type StudentRow } from './student-picker';

interface EmergencyCard {
  student: StudentRow;
  bloodType: string | null;
  insurance: { eps?: string | null; prepaid?: string | null; accidentInsurance?: string | null; policy?: string | null; preferredIps?: string | null };
  allergies: { id: string; agent: string; severity: string; reaction: string | null; requiresEpinephrine: boolean }[];
  conditions: { id: string; name: string; critical: boolean }[];
  carePlans: { id: string; title: string; steps: string[]; rescueMedications: string[] }[];
  devices: { id: string; description: string; location: string | null }[];
  rescueMedications: { id: string; name: string; dose: string; route: string; criteria: string | null }[];
  contacts: { name: string; relationship: string; phone: string | null; canPickUp: boolean }[];
  protocols: { key: string; title: string; steps: string[] }[];
  emergencyNumber: string;
}

export function EmergencyDialog({ open, onOpenChange, studentId: initial }: { open: boolean; onOpenChange: (o: boolean) => void; studentId?: string }) {
  const router = useRouter();
  const [studentId, setStudentId] = useState<string | undefined>(initial);
  const card = useQuery({ queryKey: ['emergency-card', studentId], queryFn: () => api<EmergencyCard>(`/students/${studentId}/emergency-card`), enabled: open && !!studentId });
  const start = useMutation({
    mutationFn: () => api<{ id: string }>('/encounters', { body: { subjectType: 'STUDENT', studentId, type: 'ACCIDENT', chiefComplaint: 'Emergencia', templateKey: null }, idempotencyKey: idem() }),
    onSuccess: (e) => {
      onOpenChange(false);
      router.push(`/enfermeria/atenciones/${e.id}`);
    },
  });
  const c = card.data;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setStudentId(initial);
      }}
      tone="danger"
      size="lg"
      title={
        <span className="flex items-center gap-2">
          <Siren className="h-5 w-5" /> Modo emergencia
        </span>
      }
      description="Ficha crítica, contactos y protocolo en un solo lugar."
      footer={
        <>
          <a href="tel:123" className="mr-auto">
            <Button variant="danger" size="lg">
              <Phone className="h-4 w-4" /> Llamar al 123
            </Button>
          </a>
          {studentId && (
            <Button size="lg" onClick={() => start.mutate()} loading={start.isPending}>
              Iniciar atención de emergencia
            </Button>
          )}
        </>
      }
    >
      {!studentId ? (
        <StudentPicker autoFocus onSelect={(s) => setStudentId(s.id)} />
      ) : card.isLoading || !c ? (
        <div className="space-y-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-40" />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <PatientHeader
            name={c.student.name}
            photoUrl={c.student.photoUrl}
            subtitle={`${c.student.code} · ${c.student.group?.name ?? ''} · ${c.student.age ?? '—'} años`}
            allergies={c.allergies}
            conditions={c.conditions}
            bloodType={c.bloodType}
            actions={
              <Button variant="outline" size="sm" onClick={() => setStudentId(undefined)}>
                Cambiar estudiante
              </Button>
            }
          />
          {c.rescueMedications.length > 0 && (
            <Alert tone="danger" title="Medicación de rescate autorizada">
              <ul className="list-disc pl-4">
                {c.rescueMedications.map((m) => (
                  <li key={m.id}>
                    <strong>{m.name}</strong> {m.dose} · {m.route}
                    {m.criteria && ` — ${m.criteria}`}
                  </li>
                ))}
              </ul>
            </Alert>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="p-4">
              <h3 className="mb-2 font-semibold">Contactos</h3>
              <ul className="flex flex-col gap-2">
                {c.contacts.map((ct, i) => (
                  <li key={i} className="flex items-center justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{ct.name}</span>
                      <span className="text-xs text-muted">{RELATIONSHIP_LABELS[ct.relationship] ?? ct.relationship}</span>
                    </span>
                    {ct.phone && (
                      <a href={`tel:${ct.phone}`} className="shrink-0">
                        <Button size="sm" variant="outline">
                          <Phone className="h-4 w-4" /> {ct.phone}
                        </Button>
                      </a>
                    )}
                  </li>
                ))}
                {c.contacts.length === 0 && <li className="text-sm text-muted">Sin contactos registrados.</li>}
              </ul>
            </Card>
            <Card className="p-4">
              <h3 className="mb-2 font-semibold">Aseguramiento</h3>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                <dt className="text-muted">EPS</dt>
                <dd>{c.insurance.eps ?? '—'}</dd>
                <dt className="text-muted">Prepagada</dt>
                <dd>{c.insurance.prepaid ?? '—'}</dd>
                <dt className="text-muted">Póliza</dt>
                <dd>{[c.insurance.accidentInsurance, c.insurance.policy].filter(Boolean).join(' · ') || '—'}</dd>
                <dt className="text-muted">IPS preferida</dt>
                <dd>{c.insurance.preferredIps ?? '—'}</dd>
              </dl>
              {c.devices.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1">
                  {c.devices.map((d) => (
                    <Badge key={d.id} tone="info">
                      {d.description}
                      {d.location && ` · ${d.location}`}
                    </Badge>
                  ))}
                </div>
              )}
            </Card>
          </div>
          {c.carePlans.map((p) => (
            <Card key={p.id} className="border-violet-300 p-4 dark:border-violet-800">
              <h3 className="mb-2 font-semibold text-violet-800 dark:text-violet-200">{p.title}</h3>
              <ol className="list-decimal space-y-1 pl-5 text-sm">
                {(p.steps as string[]).map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
            </Card>
          ))}
          <div className="grid gap-3 md:grid-cols-2">
            {c.protocols.map((p) => (
              <details key={p.key} className="rounded-xl border border-border p-3" open={p.key !== 'cpr'}>
                <summary className="cursor-pointer font-semibold">Protocolo: {p.title}</summary>
                <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
                  {p.steps.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ol>
              </details>
            ))}
          </div>
        </div>
      )}
    </Dialog>
  );
}
