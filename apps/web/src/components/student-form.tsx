'use client';

import { Alert, Button, Field, Input, Select } from '@sgee/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, ImageUp, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { Structure } from '@/app/(app)/estudiantes/page';
import { Dialog } from '@/components/dialog';
import { api } from '@/lib/api';

export interface StudentEdit {
  code: string;
  firstName: string;
  lastName: string;
  documentType: string | null;
  documentNumber: string | null;
  birthDate: string | null;
  sex: string | null;
  groupId: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  address: string | null;
  transport: string | null;
  status: string;
}

export const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  RC: 'Registro civil',
  TI: 'Tarjeta de identidad',
  CC: 'Cédula de ciudadanía',
  CE: 'Cédula de extranjería',
  PA: 'Pasaporte',
  PPT: 'Permiso por protección temporal',
  NIT: 'NIT',
  OTRO: 'Otro',
};

const EMPTY: StudentEdit = { code: '', firstName: '', lastName: '', documentType: 'TI', documentNumber: '', birthDate: '', sex: '', groupId: '', email: '', phone: '', mobile: '', address: '', transport: '', status: 'ACTIVE' };

/** Create or edit a student. When the student is linked to Phidias (Phidias mode) the academic fields are read-only. */
export function StudentFormDialog({ studentId, initial, locked = false, onClose, onSaved }: { studentId?: string; initial?: StudentEdit; locked?: boolean; onClose: () => void; onSaved?: (id: string) => void }) {
  const qc = useQueryClient();
  const [v, setV] = useState<StudentEdit>(() => ({ ...EMPTY, ...Object.fromEntries(Object.entries(initial ?? {}).map(([k, x]) => [k, x ?? ''])) }) as StudentEdit);
  const structure = useQuery({ queryKey: ['structure'], queryFn: () => api<Structure[]>('/structure'), staleTime: 600_000 });
  const groups = structure.data?.flatMap((s) => s.grades.flatMap((g) => g.groups.map((gr) => ({ id: gr.id, label: `${s.name} · ${g.name} · ${gr.name}` })))) ?? [];
  const set = (patch: Partial<StudentEdit>) => setV((o) => ({ ...o, ...patch }));
  const save = useMutation({
    mutationFn: async () => {
      const contact = { email: v.email || null, phone: v.phone || null, mobile: v.mobile || null, address: v.address || null, transport: v.transport || null };
      const academic = { code: v.code.trim(), firstName: v.firstName.trim(), lastName: v.lastName.trim(), documentType: v.documentType || 'OTRO', documentNumber: v.documentNumber || null, birthDate: v.birthDate || null, sex: v.sex || null, groupId: v.groupId || null };
      if (!studentId) return api<{ id: string }>('/students', { body: { ...academic, ...contact } });
      return api<{ id: string }>(`/students/${studentId}`, { method: 'PATCH', body: locked ? contact : { ...academic, ...contact, status: v.status } });
    },
    onSuccess: (r) => {
      toast.success(studentId ? 'Datos del estudiante actualizados' : 'Estudiante creado');
      qc.invalidateQueries({ queryKey: ['student', r.id] });
      qc.invalidateQueries({ queryKey: ['students'] });
      qc.invalidateQueries({ queryKey: ['structure'] });
      onSaved?.(r.id);
      onClose();
    },
  });
  const valid = v.code.trim() && v.firstName.trim() && v.lastName.trim();
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="lg"
      title={studentId ? 'Editar datos del estudiante' : 'Nuevo estudiante'}
      footer={
        <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!valid}>
          Guardar
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {locked && <Alert tone="info">Este estudiante está vinculado a Phidias: código, nombres, documento, fecha de nacimiento, sexo, grupo y estado se corrigen en Phidias. Aquí puede actualizar los datos de contacto y el transporte.</Alert>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Código del estudiante" required hint="Número de carné o matrícula. Único en el colegio.">
            <Input value={v.code} onChange={(e) => set({ code: e.target.value })} disabled={locked} inputMode="numeric" />
          </Field>
          <Field label="Grupo">
            <Select value={v.groupId ?? ''} onChange={(e) => set({ groupId: e.target.value })} disabled={locked}>
              <option value="">Sin grupo</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Nombres" required>
            <Input value={v.firstName} onChange={(e) => set({ firstName: e.target.value })} disabled={locked} autoComplete="off" />
          </Field>
          <Field label="Apellidos" required>
            <Input value={v.lastName} onChange={(e) => set({ lastName: e.target.value })} disabled={locked} autoComplete="off" />
          </Field>
          <Field label="Tipo de documento">
            <Select value={v.documentType ?? 'TI'} onChange={(e) => set({ documentType: e.target.value })} disabled={locked}>
              {Object.entries(DOCUMENT_TYPE_LABELS).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Número de documento">
            <Input value={v.documentNumber ?? ''} onChange={(e) => set({ documentNumber: e.target.value })} disabled={locked} inputMode="numeric" />
          </Field>
          <Field label="Fecha de nacimiento">
            <Input type="date" value={v.birthDate ?? ''} onChange={(e) => set({ birthDate: e.target.value })} disabled={locked} />
          </Field>
          <Field label="Sexo">
            <Select value={v.sex ?? ''} onChange={(e) => set({ sex: e.target.value })} disabled={locked}>
              <option value="">Sin dato</option>
              <option value="F">Femenino</option>
              <option value="M">Masculino</option>
            </Select>
          </Field>
          <Field label="Correo">
            <Input type="email" value={v.email ?? ''} onChange={(e) => set({ email: e.target.value })} />
          </Field>
          <Field label="Celular">
            <Input type="tel" value={v.mobile ?? ''} onChange={(e) => set({ mobile: e.target.value })} />
          </Field>
          <Field label="Teléfono fijo">
            <Input type="tel" value={v.phone ?? ''} onChange={(e) => set({ phone: e.target.value })} />
          </Field>
          <Field label="Transporte" hint="Ruta escolar, particular, a pie…">
            <Input value={v.transport ?? ''} onChange={(e) => set({ transport: e.target.value })} />
          </Field>
          <Field label="Dirección" className="sm:col-span-2">
            <Input value={v.address ?? ''} onChange={(e) => set({ address: e.target.value })} />
          </Field>
          {studentId && !locked && (
            <Field label="Estado" hint="Un estudiante retirado conserva su historia clínica.">
              <Select value={v.status} onChange={(e) => set({ status: e.target.value })}>
                <option value="ACTIVE">Activo</option>
                <option value="INACTIVE">Retirado / inactivo</option>
              </Select>
            </Field>
          )}
        </div>
      </div>
    </Dialog>
  );
}

/** Downscales large photos in the browser (max 900 px, JPEG) before uploading. */
async function prepareImage(file: File): Promise<Blob> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('Seleccione una imagen JPG, PNG o WEBP.');
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 900 / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size <= 1024 * 1024) return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo procesar la imagen.'))), 'image/jpeg', 0.85));
  } catch {
    return file;
  }
}

export function StudentPhotoDialog({ studentId, name, photoUrl, onClose }: { studentId: string; name: string; photoUrl: string | null; onClose: () => void }) {
  const qc = useQueryClient();
  const camera = useRef<HTMLInputElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);
  const refresh = () => qc.invalidateQueries();
  const upload = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      fd.append('file', blob!, 'foto.jpg');
      return api<{ photoUrl: string }>(`/students/${studentId}/photo`, { form: fd });
    },
    onSuccess: () => {
      toast.success('Foto actualizada. Se verá en todos los paneles.');
      refresh();
      onClose();
    },
  });
  const remove = useMutation({
    mutationFn: () => api(`/students/${studentId}/photo`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Foto eliminada');
      refresh();
      onClose();
    },
  });
  const choose = async (file?: File) => {
    if (!file) return;
    try {
      const prepared = await prepareImage(file);
      if (prepared.size > 5 * 1024 * 1024) return toast.error('La foto supera 5 MB.');
      setBlob(prepared);
      setPreview(URL.createObjectURL(prepared));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const shown = preview ?? photoUrl;
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Foto del estudiante"
      description={name}
      footer={
        <>
          {photoUrl && !preview && (
            <Button variant="ghost" className="mr-auto text-red-600" onClick={() => window.confirm('¿Quitar la foto del estudiante?') && remove.mutate()} loading={remove.isPending}>
              <Trash2 className="h-4 w-4" /> Quitar foto
            </Button>
          )}
          <Button onClick={() => upload.mutate()} disabled={!blob} loading={upload.isPending}>
            Guardar foto
          </Button>
        </>
      }
    >
      <div className="flex flex-col items-center gap-4">
        <div className="flex h-56 w-56 items-center justify-center overflow-hidden rounded-3xl bg-card-muted">
          {shown ? <img src={shown} alt={`Foto de ${name}`} className="h-full w-full object-cover" /> : <span className="text-sm text-muted">Sin foto</span>}
        </div>
        <p className="text-center text-sm text-muted">Use una foto de frente, reciente y con buena luz. Se usa para identificar al estudiante en enfermería, portería y los demás paneles.</p>
        <div className="grid w-full grid-cols-2 gap-2">
          <Button variant="outline" onClick={() => camera.current?.click()}>
            <Camera className="h-4 w-4" /> Tomar foto
          </Button>
          <Button variant="outline" onClick={() => picker.current?.click()}>
            <ImageUp className="h-4 w-4" /> Elegir archivo
          </Button>
        </div>
        <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => choose(e.target.files?.[0])} />
        <input ref={picker} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => choose(e.target.files?.[0])} />
      </div>
    </Dialog>
  );
}

export function StudentImportDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [csv, setCsv] = useState('');
  const run = useMutation({
    mutationFn: () => api<{ inserted: number; updated: number; errors: { line: number; error: string }[] }>('/admin/import/students', { body: { csv } }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['students'] });
      qc.invalidateQueries({ queryKey: ['structure'] });
      if (r.errors.length) toast.warning(`${r.inserted} creados, ${r.updated} actualizados, ${r.errors.length} filas con error`);
      else {
        toast.success(`${r.inserted} estudiantes creados y ${r.updated} actualizados`);
        onClose();
      }
    },
  });
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="lg"
      title="Importar estudiantes desde CSV"
      description="Cree o actualice muchos estudiantes a la vez. Los grupos deben existir en la estructura académica."
      footer={
        <Button onClick={() => run.mutate()} loading={run.isPending} disabled={csv.trim().split(/\r?\n/).length < 2}>
          Importar
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <Alert tone="info">
          Primera fila (encabezado), separado por punto y coma: <span className="font-mono text-xs">codigo;documento;nombres;apellidos;fecha_nacimiento;sexo;grupo</span>. Fecha en formato AAAA-MM-DD, sexo M o F y grupo con su código (por ejemplo 6A). Si el código ya existe, el estudiante se actualiza.
        </Alert>
        <input
          type="file"
          accept=".csv,text/csv,text/plain"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) setCsv(await f.text());
          }}
          className="text-sm"
        />
        <textarea value={csv} onChange={(e) => setCsv(e.target.value)} rows={8} placeholder={'codigo;documento;nombres;apellidos;fecha_nacimiento;sexo;grupo\n3001;1043000999;Lucas;Pérez Gómez;2014-05-02;M;6A'} className="w-full rounded-xl border border-border bg-card p-3 font-mono text-xs" />
        {run.data?.errors.length ? (
          <ul className="max-h-40 overflow-y-auto rounded-xl border border-amber-300 p-3 text-sm text-amber-800 dark:text-amber-200">
            {run.data.errors.map((e) => (
              <li key={e.line}>
                Línea {e.line}: {e.error}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </Dialog>
  );
}
