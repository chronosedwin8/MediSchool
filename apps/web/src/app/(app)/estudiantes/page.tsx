'use client';

import { Badge, Button, Card, Checkbox, EmptyState, Input, PageHeader, Select, Skeleton, StudentAvatar } from '@sgee/ui';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Search, Users } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { type StudentRow, useDebounced } from '@/components/student-picker';
import { api } from '@/lib/api';

export interface Structure {
  id: string;
  code: string;
  name: string;
  grades: { id: string; name: string; groups: { id: string; code: string; name: string; students: number; mine: boolean }[] }[];
}

export default function StudentsPage() {
  const [q, setQ] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [gradeId, setGradeId] = useState('');
  const [groupId, setGroupId] = useState('');
  const [withAlerts, setWithAlerts] = useState(false);
  const [status, setStatus] = useState('ACTIVE');
  const dq = useDebounced(q.trim());
  const structure = useQuery({ queryKey: ['structure'], queryFn: () => api<Structure[]>('/structure'), staleTime: 600_000 });
  const list = useInfiniteQuery({
    queryKey: ['students', 'list', dq, sectionId, gradeId, groupId, withAlerts, status],
    queryFn: ({ pageParam }) => api<{ items: StudentRow[]; nextCursor: string | null }>('/students', { query: { q: dq, sectionId, gradeId, groupId, withAlerts: withAlerts || undefined, status, limit: 60, cursor: pageParam } }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const section = structure.data?.find((s) => s.id === sectionId);
  const grade = section?.grades.find((g) => g.id === gradeId);
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div>
      <PageHeader title="Estudiantes" description="Maestro sincronizado con Phidias. Las alertas médicas se muestran siempre." />
      <Card className="mb-4 grid gap-3 p-4 md:grid-cols-[1fr_repeat(3,180px)_auto_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre, código o documento" className="pl-9" aria-label="Buscar" />
        </div>
        <Select value={sectionId} onChange={(e) => { setSectionId(e.target.value); setGradeId(''); setGroupId(''); }} aria-label="Sección">
          <option value="">Todas las secciones</option>
          {structure.data?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        <Select value={gradeId} onChange={(e) => { setGradeId(e.target.value); setGroupId(''); }} disabled={!section} aria-label="Grado">
          <option value="">Todos los grados</option>
          {section?.grades.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </Select>
        <Select value={groupId} onChange={(e) => setGroupId(e.target.value)} disabled={!grade} aria-label="Grupo">
          <option value="">Todos los grupos</option>
          {grade?.groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name} ({g.students})
            </option>
          ))}
        </Select>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Estado">
          <option value="ACTIVE">Activos</option>
          <option value="INACTIVE">Inactivos</option>
          <option value="ALL">Todos</option>
        </Select>
        <Checkbox label="Solo con alertas" checked={withAlerts} onChange={(e) => setWithAlerts(e.target.checked)} />
      </Card>

      {list.isLoading && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      )}
      {!list.isLoading && items.length === 0 && <EmptyState icon={<Users />} title="Sin resultados" description="Ajuste los filtros o la búsqueda." />}
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((s) => (
          <li key={s.id}>
            <Link href={`/estudiantes/${s.id}`} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 shadow-sm transition hover:border-primary-400">
              <StudentAvatar src={s.photoUrl} name={s.name} size={52} alert={s.alerts?.anaphylaxis} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{s.name}</p>
                <p className="text-xs text-muted">
                  {s.code} · {s.group?.name ?? 'Sin grupo'} {s.age !== null && `· ${s.age} años`}
                </p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {s.alerts?.anaphylaxis && <Badge tone="solidDanger">Anafilaxia</Badge>}
                  {s.alerts?.allergies.filter((_, i) => i < 2).map((a) => (
                    <Badge key={a} tone="danger">
                      {a}
                    </Badge>
                  ))}
                  {s.alerts?.criticalConditions.map((c) => (
                    <Badge key={c} tone="violet">
                      {c}
                    </Badge>
                  ))}
                  {!s.alerts && s.medicalAlert && <Badge tone="danger">Alerta médica</Badge>}
                  {s.openPass && <Badge tone="primary">{s.openPass.label}</Badge>}
                  {s.status !== 'ACTIVE' && <Badge tone="neutral">Inactivo</Badge>}
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
      {list.hasNextPage && (
        <div className="mt-4 flex justify-center">
          <Button variant="outline" onClick={() => list.fetchNextPage()} loading={list.isFetchingNextPage}>
            Cargar más
          </Button>
        </div>
      )}
    </div>
  );
}
