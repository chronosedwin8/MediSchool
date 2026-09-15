'use client';

import { Alert, Button, Card, CardContent, CardHeader, CardTitle, Field, Input, PageHeader } from '@sgee/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { use, useState } from 'react';
import { toast } from 'sonner';
import { HealthProfileEditor } from '@/components/health-profile';
import { api } from '@/lib/api';

interface Student {
  name: string;
  age: number | null;
  emergencyContacts: { id: string; name: string; relationship: string; phone: string; canPickUp: boolean; verified: boolean }[];
}

export default function FamilyHealthPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const qc = useQueryClient();
  const s = useQuery({ queryKey: ['student', id], queryFn: () => api<Student>(`/students/${id}`) });
  const standing = useQuery({ queryKey: ['standing', id], queryFn: () => api<{ id: string; active: boolean; validFrom: string; validTo: string; conditions: string }[]>(`/students/${id}/standing-exit-permissions`) });
  const [contact, setContact] = useState({ name: '', relationship: '', phone: '', canPickUp: false, documentNumber: '' });
  const addContact = useMutation({
    mutationFn: () => api(`/students/${id}/emergency-contacts`, { body: { ...contact, documentNumber: contact.documentNumber || null } }),
    onSuccess: () => {
      toast.success('Contacto agregado. Enfermería lo verificará.');
      setContact({ name: '', relationship: '', phone: '', canPickUp: false, documentNumber: '' });
      qc.invalidateQueries({ queryKey: ['student', id] });
      qc.invalidateQueries({ queryKey: ['health-profile', id] });
    },
  });
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
  const [perm, setPerm] = useState({ validTo: `${new Date().getFullYear()}-12-15`, conditions: 'Puede retirarse solo del colegio cuando enfermería lo indique, informando a la familia por la app.' });
  const grant = useMutation({
    mutationFn: () => api('/standing-exit-permissions', { body: { studentId: id, validFrom: today, validTo: perm.validTo, conditions: perm.conditions } }),
    onSuccess: () => {
      toast.success('Autorización registrada');
      qc.invalidateQueries({ queryKey: ['standing', id] });
    },
  });
  const revoke = useMutation({ mutationFn: (pid: string) => api(`/standing-exit-permissions/${pid}/revoke`, { method: 'POST' }), onSuccess: () => qc.invalidateQueries({ queryKey: ['standing', id] }) });

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={`Ficha de salud${s.data ? ` · ${s.data.name}` : ''}`} description="Mantenga la información actualizada. Es la que usa enfermería en una emergencia." />
      <HealthProfileEditor studentId={id} mode="guardian" />

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Contactos de emergencia adicionales</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <ul className="flex flex-col gap-1 text-sm">
              {s.data?.emergencyContacts.map((c) => (
                <li key={c.id} className="rounded-lg bg-card-muted px-3 py-2">
                  <strong>{c.name}</strong> · {c.relationship} · {c.phone} {c.canPickUp && '· puede recoger'} {!c.verified && <span className="text-muted">(por verificar)</span>}
                </li>
              ))}
            </ul>
            <div className="grid gap-2 sm:grid-cols-2">
              <Input placeholder="Nombre" value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} />
              <Input placeholder="Parentesco" value={contact.relationship} onChange={(e) => setContact({ ...contact, relationship: e.target.value })} />
              <Input placeholder="Teléfono" type="tel" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} />
              <Input placeholder="Documento (si recoge)" value={contact.documentNumber} onChange={(e) => setContact({ ...contact, documentNumber: e.target.value })} />
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input type="checkbox" className="h-5 w-5 accent-primary-700" checked={contact.canPickUp} onChange={(e) => setContact({ ...contact, canPickUp: e.target.checked })} /> Autorizado para recoger
              </label>
            </div>
            <Button variant="outline" onClick={() => addContact.mutate()} disabled={!contact.name || !contact.phone || !contact.relationship} loading={addContact.isPending}>
              <Plus className="h-4 w-4" /> Agregar contacto
            </Button>
          </CardContent>
        </Card>

        {(s.data?.age ?? 0) >= 14 && (
          <Card>
            <CardHeader>
              <CardTitle>Autorización permanente de salida autónoma</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Alert tone="info">Para estudiantes de bachillerato: permite que salga del colegio sin ser recogido cuando enfermería lo indique. Puede revocarla en cualquier momento.</Alert>
              {standing.data?.filter((p) => p.active).map((p) => (
                <div key={p.id} className="flex items-center gap-2 rounded-lg bg-card-muted p-3 text-sm">
                  <span className="flex-1">Vigente hasta {p.validTo.slice(0, 10)}</span>
                  <Button size="sm" variant="ghost" onClick={() => revoke.mutate(p.id)}>
                    Revocar
                  </Button>
                </div>
              ))}
              {!standing.data?.some((p) => p.active) && (
                <>
                  <Field label="Vigente hasta">
                    <Input type="date" min={today} value={perm.validTo} onChange={(e) => setPerm({ ...perm, validTo: e.target.value })} />
                  </Field>
                  <Field label="Condiciones">
                    <Input value={perm.conditions} onChange={(e) => setPerm({ ...perm, conditions: e.target.value })} />
                  </Field>
                  <Button onClick={() => grant.mutate()} loading={grant.isPending}>
                    Otorgar autorización
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
