'use client';

import { Alert, Badge, Button, Card, EmptyState, PageHeader, Progress, Skeleton, StudentAvatar } from '@sgee/ui';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Bell, ChevronRight, DoorOpen, FileSignature, HeartPulse, MessageSquare, Pill, Stethoscope } from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useLive } from '@/lib/live';

interface Home {
  date: string;
  unreadNotifications: number;
  unreadCirculars: number;
  guardian: { name: string };
  children: {
    id: string;
    name: string;
    code: string;
    photoUrl: string | null;
    group: { name: string } | null;
    age: number | null;
    today: {
      openPass: { id: string; state: string; label: string; since: string } | null;
      encounters: { id: string; time: string; chiefComplaint: string; status: string; disposition: string | null; summary: string | null }[];
      pendingExit: { id: string; reason: string; expiresAt: string }[];
      doses: { time: string; status: string }[];
    };
    profileCompleteness: { pct: number; items: { key: string; label: string; done: boolean }[] };
    pendingConsents: number;
    medicationRequests: number;
    unreadMessages: number;
  }[];
}

export default function FamilyHome() {
  const q = useQuery({ queryKey: ['portal-home'], queryFn: () => api<Home>('/portal/home'), refetchInterval: 60_000 });
  useLive(['notification'], [['portal-home']]);
  const firstName = q.data?.guardian.name.split(' ')[0];

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={firstName ? `Hola, ${firstName}` : 'Inicio'} description="Estado de salud de sus hijos en el colegio hoy." />
      {q.isLoading && <Skeleton className="h-64" />}
      {q.data?.children.length === 0 && <EmptyState icon={<HeartPulse />} title="Aún no tiene estudiantes vinculados" description="Solicite a enfermería o secretaría un código de invitación." />}

      <div className="flex flex-col gap-5">
        {q.data?.children.map((c, i) => (
          <motion.div key={c.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <Card className="overflow-hidden">
              <div className="flex items-center gap-4 p-5">
                <StudentAvatar src={c.photoUrl} name={c.name} size={64} />
                <div className="min-w-0 flex-1">
                  <p className="text-lg font-semibold">{c.name}</p>
                  <p className="text-sm text-muted">
                    {c.group?.name} · {c.age ?? '—'} años
                  </p>
                </div>
              </div>

              {c.today.pendingExit.map((x) => (
                <Alert
                  key={x.id}
                  tone="danger"
                  icon={<DoorOpen />}
                  className="mx-5 mb-3"
                  title="Enfermería solicita que recojan a su hijo(a)"
                  action={
                    <Link href={`/familia/salida/${x.id}?student=${c.id}`}>
                      <Button size="sm" variant="danger">
                        Confirmar quién recoge
                      </Button>
                    </Link>
                  }
                >
                  {x.reason}
                </Alert>
              ))}

              <div className="grid gap-px border-t border-border bg-border sm:grid-cols-2">
                <div className="bg-card p-5">
                  <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
                    <Stethoscope className="h-4 w-4 text-primary-700" /> Hoy en enfermería
                  </p>
                  {c.today.openPass && (
                    <p className="mb-2">
                      <Badge tone="primary">{c.today.openPass.label}</Badge> <span className="text-sm text-muted">desde {c.today.openPass.since}</span>
                    </p>
                  )}
                  {c.today.encounters.length === 0 && !c.today.openPass && <p className="text-sm text-muted">Sin visitas a enfermería hoy.</p>}
                  <ul className="flex flex-col gap-2">
                    {c.today.encounters.map((e) => (
                      <li key={e.id}>
                        <Link href={e.status === 'CLOSED' ? `/familia/atenciones/${e.id}` : '#'} className="block rounded-xl bg-card-muted p-3 text-sm hover:ring-1 hover:ring-primary-400">
                          <span className="tabular font-semibold">{e.time}</span> · {e.chiefComplaint}
                          <span className="mt-0.5 block text-muted">{e.summary}</span>
                          {e.disposition && <Badge tone="neutral" className="mt-1">{e.disposition}</Badge>}
                        </Link>
                      </li>
                    ))}
                  </ul>
                  {c.today.doses.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1">
                      {c.today.doses.map((d, j) => (
                        <Badge key={j} tone={d.status === 'GIVEN' ? 'success' : d.status === 'PENDING' ? 'info' : 'danger'}>
                          <Pill className="h-3 w-3" /> {d.time} {d.status === 'GIVEN' ? 'administrada' : d.status === 'PENDING' ? 'programada' : 'no administrada'}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
                <div className="bg-card p-5">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm font-semibold">Ficha de salud</p>
                    <span className="tabular text-sm font-semibold">{c.profileCompleteness.pct}%</span>
                  </div>
                  <Progress value={c.profileCompleteness.pct} tone={c.profileCompleteness.pct >= 80 ? 'success' : 'warning'} label="Completitud de la ficha" />
                  {c.profileCompleteness.pct < 100 && <p className="mt-2 text-xs text-muted">Pendiente: {c.profileCompleteness.items.filter((it) => !it.done).slice(0, 3).map((it) => it.label.toLowerCase()).join(', ')}.</p>}
                  <nav className="mt-4 flex flex-col">
                    <Link href={`/familia/salud/${c.id}`} className="flex min-h-11 items-center gap-3 rounded-lg px-2 hover:bg-card-muted">
                      <HeartPulse className="h-4 w-4" /> <span className="flex-1 text-sm">Actualizar ficha de salud</span> <ChevronRight className="h-4 w-4 text-muted" />
                    </Link>
                    <Link href="/familia/consentimientos" className="flex min-h-11 items-center gap-3 rounded-lg px-2 hover:bg-card-muted">
                      <FileSignature className="h-4 w-4" /> <span className="flex-1 text-sm">Consentimientos</span> {c.pendingConsents > 0 && <Badge tone="danger">{c.pendingConsents} pendientes</Badge>} <ChevronRight className="h-4 w-4 text-muted" />
                    </Link>
                    <Link href="/familia/medicacion" className="flex min-h-11 items-center gap-3 rounded-lg px-2 hover:bg-card-muted">
                      <Pill className="h-4 w-4" /> <span className="flex-1 text-sm">Medicamentos en el colegio</span> {c.medicationRequests > 0 && <Badge tone="neutral">{c.medicationRequests}</Badge>} <ChevronRight className="h-4 w-4 text-muted" />
                    </Link>
                    <Link href="/mensajes" className="flex min-h-11 items-center gap-3 rounded-lg px-2 hover:bg-card-muted">
                      <MessageSquare className="h-4 w-4" /> <span className="flex-1 text-sm">Mensajes con enfermería</span> {c.unreadMessages > 0 && <Badge tone="primary">{c.unreadMessages}</Badge>} <ChevronRight className="h-4 w-4 text-muted" />
                    </Link>
                  </nav>
                </div>
              </div>
            </Card>
          </motion.div>
        ))}
        {!!q.data?.unreadCirculars && (
          <Link href="/familia/circulares">
            <Alert tone="info" icon={<Bell />} title={`${q.data.unreadCirculars} circular(es) de salud sin leer`} />
          </Link>
        )}
      </div>
    </div>
  );
}
