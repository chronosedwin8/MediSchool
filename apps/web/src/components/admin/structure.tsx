'use client';

import { Alert, Badge, Button, Card, CardContent, CardHeader, CardTitle, EmptyState, Field, Input, Select, Skeleton, Toggle } from '@sgee/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Layers, Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Dialog } from '@/components/dialog';
import { api } from '@/lib/api';
import { useMe } from '@/lib/session';

interface GroupNode { id: string; code: string; name: string; active: boolean; external: boolean; students: number }
interface GradeNode { id: string; code: string; name: string; sortOrder: number; external: boolean; groups: GroupNode[] }
interface SectionNode { id: string; code: string; name: string; sortOrder: number; external: boolean; grades: GradeNode[] }

type Editing =
  | { kind: 'section'; item?: SectionNode }
  | { kind: 'grade'; sectionId: string; item?: GradeNode }
  | { kind: 'group'; gradeId: string; item?: GroupNode };

const LABEL = { section: 'sección', grade: 'grado', group: 'grupo' } as const;

export function StructurePanel() {
  const { data: me } = useMe();
  const tree = useQuery({ queryKey: ['structure', 'all'], queryFn: () => api<SectionNode[]>('/structure', { query: { all: 1 } }) });
  const [editing, setEditing] = useState<Editing | null>(null);
  const phidias = me?.settings.dataSource === 'PHIDIAS';

  if (tree.isLoading) return <Skeleton className="h-96" />;
  return (
    <div className="flex flex-col gap-4">
      {phidias ? (
        <Alert tone="info" title="Estructura administrada por Phidias">
          En modalidad con Phidias, las secciones, grados y grupos se sincronizan desde Phidias y se muestran en solo lectura. Para administrarlos aquí, cambie la modalidad en Configuración.
        </Alert>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <p className="flex-1 text-sm text-muted">Organice el colegio en secciones (por ejemplo, Preescolar, Primaria, Bachillerato), grados y grupos. Los grupos se asignan a los estudiantes y a los docentes.</p>
          <Button onClick={() => setEditing({ kind: 'section' })}>
            <Plus className="h-4 w-4" /> Nueva sección
          </Button>
        </div>
      )}
      {tree.data?.length === 0 && <EmptyState icon={<Layers />} title="Aún no hay estructura académica" description="Cree la primera sección para empezar." />}
      {tree.data?.map((s) => (
        <Card key={s.id}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {s.name} <Badge tone="neutral">{s.code}</Badge>
            </CardTitle>
            {!phidias && (
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => setEditing({ kind: 'section', item: s })}>
                  <Pencil className="h-4 w-4" /> Editar
                </Button>
                <Button size="sm" variant="outline" onClick={() => setEditing({ kind: 'grade', sectionId: s.id })}>
                  <Plus className="h-4 w-4" /> Grado
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {s.grades.length === 0 && <p className="text-sm text-muted">Sin grados.</p>}
            {s.grades.map((g) => (
              <div key={g.id} className="rounded-xl border border-border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="flex-1 font-medium">
                    {g.name} <span className="text-xs text-muted">({g.code})</span>
                  </p>
                  {!phidias && (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => setEditing({ kind: 'grade', sectionId: s.id, item: g })} aria-label={`Editar grado ${g.name}`}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditing({ kind: 'group', gradeId: g.id })}>
                        <Plus className="h-4 w-4" /> Grupo
                      </Button>
                    </>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {g.groups.length === 0 && <span className="text-sm text-muted">Sin grupos.</span>}
                  {g.groups.map((gr) => (
                    <button
                      key={gr.id}
                      type="button"
                      disabled={phidias}
                      onClick={() => setEditing({ kind: 'group', gradeId: g.id, item: gr })}
                      className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm ${gr.active ? 'border-border hover:bg-card-muted' : 'border-dashed border-border text-muted'} disabled:cursor-default`}
                    >
                      {gr.name} <span className="tabular text-xs text-muted">{gr.students}</span>
                      {!gr.active && <Badge tone="neutral">Inactivo</Badge>}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
      {editing && <StructureDialog editing={editing} sections={tree.data ?? []} onClose={() => setEditing(null)} />}
    </div>
  );
}

function StructureDialog({ editing, sections, onClose }: { editing: Editing; sections: SectionNode[]; onClose: () => void }) {
  const qc = useQueryClient();
  const item = editing.item;
  const [v, setV] = useState({
    code: item?.code ?? '',
    name: item?.name ?? '',
    sortOrder: item && 'sortOrder' in item ? item.sortOrder : 0,
    parentId: editing.kind === 'grade' ? editing.sectionId : editing.kind === 'group' ? editing.gradeId : '',
    active: item && 'active' in item ? item.active : true,
  });
  const grades = sections.flatMap((s) => s.grades.map((g) => ({ id: g.id, label: `${s.name} · ${g.name}` })));
  const save = useMutation({
    mutationFn: () => {
      const path = { section: 'sections', grade: 'grades', group: 'groups' }[editing.kind];
      const body =
        editing.kind === 'section'
          ? { code: v.code, name: v.name, sortOrder: v.sortOrder }
          : editing.kind === 'grade'
            ? { sectionId: v.parentId, code: v.code, name: v.name, sortOrder: v.sortOrder }
            : { gradeId: v.parentId, code: v.code, name: v.name, active: v.active };
      return api(`/structure/${path}${item ? `/${item.id}` : ''}`, { method: item ? 'PATCH' : 'POST', body });
    },
    onSuccess: () => {
      toast.success(`${LABEL[editing.kind][0].toUpperCase()}${LABEL[editing.kind].slice(1)} ${item ? 'actualizado(a)' : 'creado(a)'}`);
      qc.invalidateQueries({ queryKey: ['structure'] });
      onClose();
    },
  });
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`${item ? 'Editar' : 'Nuevo(a)'} ${LABEL[editing.kind]}`}
      footer={
        <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!v.code.trim() || !v.name.trim()}>
          Guardar
        </Button>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Código" required hint={editing.kind === 'group' ? 'Único en el colegio, por ejemplo 6A o K8B.' : 'Corto y único, por ejemplo PRI.'}>
          <Input value={v.code} onChange={(e) => setV({ ...v, code: e.target.value.toUpperCase() })} />
        </Field>
        <Field label="Nombre" required>
          <Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
        </Field>
        {editing.kind === 'grade' && (
          <Field label="Sección">
            <Select value={v.parentId} onChange={(e) => setV({ ...v, parentId: e.target.value })}>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {editing.kind === 'group' && (
          <Field label="Grado" className="sm:col-span-2">
            <Select value={v.parentId} onChange={(e) => setV({ ...v, parentId: e.target.value })}>
              {grades.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {editing.kind !== 'group' && (
          <Field label="Orden" hint="Define el orden en listas y filtros.">
            <Input type="number" min={0} value={v.sortOrder} onChange={(e) => setV({ ...v, sortOrder: Number(e.target.value) })} />
          </Field>
        )}
        {editing.kind === 'group' && item && (
          <div className="sm:col-span-2">
            <Toggle label="Grupo activo" checked={v.active} onChange={(val) => setV({ ...v, active: val })} />
          </div>
        )}
      </div>
    </Dialog>
  );
}
