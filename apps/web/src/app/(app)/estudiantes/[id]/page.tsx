'use client';

import { Alert, Badge, Button, Card, CardContent, CardHeader, CardTitle, EmptyState, Field, Input, PatientHeader, Select, Skeleton, StatusTimeline, Textarea } from '@sgee/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, CheckCircle2, ClipboardPlus, Copy, FileDown, History, Link2, Pencil, Plus, RefreshCw, Siren, UserMinus, UserPlus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { use, useState } from 'react';
import { toast } from 'sonner';
import { Dialog, TabPanel, Tabs } from '@/components/dialog';
import { EmergencyDialog } from '@/components/emergency-dialog';
import { HealthProfileEditor } from '@/components/health-profile';
import { type StudentEdit, StudentFormDialog, StudentPhotoDialog } from '@/components/student-form';
import { api, idem, openFile } from '@/lib/api';
import { fmtDate, fmtDateTime, RELATIONSHIP_LABELS } from '@/lib/format';
import { can, useMe } from '@/lib/session';

interface StudentDetail {
  id: string;
  personId: string;
  code: string;
  name: string;
  age: number | null;
  sex: string | null;
  birthDate: string | null;
  status: string;
  photoUrl: string | null;
  group: { name: string } | null;
  grade: { name: string } | null;
  section: { name: string } | null;
  document: { type: string | null; number: string | null } | null;
  transport: string | null;
  dataSource: 'PHIDIAS' | 'LOCAL';
  phidiasLinked: boolean;
  phidiasLocked: boolean;
  edit?: StudentEdit;
  guardians: { linkId: string; personId: string; name: string; relationship: string; isPrimary: boolean; canPickUp: boolean; legalCustody: boolean; priority: number; restrictions: string | null; judicialRestriction: boolean; phone: string | null; email: string | null }[];
  emergencyContacts: { id: string; name: string; relationship: string; phone: string; canPickUp: boolean; verified: boolean }[];
  medicalAlert?: boolean;
  health?: {
    bloodType: string | null;
    allergies: { agent: string; severity: string; requiresEpinephrine: boolean }[];
    conditions: { name: string; critical: boolean }[];
    activeMedications: { id: string; medicationName: string; dose: number; doseUnit: string; route: string; isPrn: boolean; times: string[] }[];
    completenessPct: number;
  };
}

interface Timeline {
  events: { kind: string; id: string; at: string; title: string; subtitle: string; status: string; accident?: boolean; historical?: boolean }[];
}

const KIND_TONE: Record<string, 'primary' | 'warning' | 'success' | 'danger' | 'violet' | 'neutral'> = { ENCOUNTER: 'primary', PASS: 'neutral', MEDICATION: 'success', CONSENT: 'violet', EXIT: 'warning' };

export default function StudentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const [tab, setTab] = useState('resumen');
  const [emergency, setEmergency] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [guardianOpen, setGuardianOpen] = useState(false);
  const [invite, setInvite] = useState<{ code: string; link: string } | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [guardianEdit, setGuardianEdit] = useState<StudentDetail['guardians'][number] | null>(null);
  const updateContact = useMutation({
    mutationFn: (x: { contactId: string; body: Record<string, unknown> }) => api(`/students/${id}/emergency-contacts/${x.contactId}`, { method: 'PATCH', body: x.body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['student', id] }),
  });
  const unlinkGuardian = useMutation({
    mutationFn: (linkId: string) => api(`/students/${id}/guardians/${linkId}`, { method: 'PATCH', body: { active: false } }),
    onSuccess: () => {
      toast.success('Acudiente desvinculado');
      qc.invalidateQueries({ queryKey: ['student', id] });
    },
  });
  const clinical = can(me, 'clinical:read');
  const s = useQuery({ queryKey: ['student', id], queryFn: () => api<StudentDetail>(`/students/${id}`) });
  const timeline = useQuery({ queryKey: ['timeline', id], queryFn: () => api<Timeline>(`/students/${id}/timeline`), enabled: tab === 'historial' && clinical });
  const month = new Date().toISOString().slice(0, 7);
  const mar = useQuery({ queryKey: ['mar', id, month], queryFn: () => api<{ rows: { id: string; date: string; time: string; medication: string; dose: string; outcome: string; reason: string | null; by: string }[] }>(`/students/${id}/mar`, { query: { month } }), enabled: tab === 'medicacion' && clinical });
  const consents = useQuery({ queryKey: ['consents', id], queryFn: () => api<{ template: { id: string; title: string; version: string; mandatory: boolean }; status: string; consent: { signedAt: string } | null }[]>(`/students/${id}/consents`), enabled: tab === 'consentimientos' && clinical });
  const mh = useQuery({ queryKey: ['mh', id], queryFn: () => api<{ id: string; note: string; riskLevel: string; createdAt: string; author: { firstName: string; lastName: string } | null }[]>(`/students/${id}/mental-health-notes`), enabled: tab === 'salud-mental' });
  const [mhNote, setMhNote] = useState({ note: '', riskLevel: 'NONE' });

  const startEncounter = useMutation({
    mutationFn: () => api<{ id: string }>('/encounters', { body: { subjectType: 'STUDENT', studentId: id, type: 'ILLNESS', chiefComplaint: 'Consulta' }, idempotencyKey: idem() }),
    onSuccess: (e) => router.push(`/enfermeria/atenciones/${e.id}`),
  });
  const createInvite = useMutation({
    mutationFn: (relationship: string) => api<{ code: string; link: string }>('/invitations', { body: { studentId: id, relationship, expiresInDays: 14 } }),
    onSuccess: setInvite,
  });
  const syncOne = useMutation({
    mutationFn: () => api<{ relatives?: { status: string; inserted: number; updated: number; details?: { error?: string; action?: string } } }>(`/integrations/phidias/sync-one/${id}`, { method: 'POST' }),
    onSuccess: (r) => {
      if (r.relatives?.status === 'FAILED') toast.warning('Datos del estudiante sincronizados. Acudientes y contactos no disponibles.', { description: r.relatives.details?.action ?? r.relatives.details?.error });
      else toast.success('Sincronizado con Phidias (incluye acudientes y contactos)');
      qc.invalidateQueries({ queryKey: ['student', id] });
    },
  });
  const addMh = useMutation({
    mutationFn: () => api('/mental-health-notes', { body: { studentId: id, ...mhNote } }),
    onSuccess: () => {
      setMhNote({ note: '', riskLevel: 'NONE' });
      qc.invalidateQueries({ queryKey: ['mh', id] });
    },
  });

  if (s.isLoading || !s.data) return <Skeleton className="h-96" />;
  const st = s.data;

  return (
    <div className="flex flex-col gap-4">
      <PatientHeader
        name={st.name}
        photoUrl={st.photoUrl}
        subtitle={`${st.code} · ${st.section?.name ?? ''} · ${st.group?.name ?? 'Sin grupo'} · ${st.age ?? '—'} años${st.status !== 'ACTIVE' ? ' · INACTIVO' : ''}`}
        allergies={st.health?.allergies ?? (st.medicalAlert ? [{ agent: 'Alerta médica: consulte enfermería', severity: 'SEVERE' }] : [])}
        conditions={st.health?.conditions ?? []}
        bloodType={st.health?.bloodType}
        actions={
          <>
            {clinical && (
              <Button variant="danger" size="sm" onClick={() => setEmergency(true)}>
                <Siren className="h-4 w-4" /> Emergencia
              </Button>
            )}
            {can(me, 'encounters:write') && (
              <Button size="sm" onClick={() => startEncounter.mutate()} loading={startEncounter.isPending}>
                <ClipboardPlus className="h-4 w-4" /> Atender
              </Button>
            )}
            {can(me, 'people:write', 'clinical:write') && (
              <Button size="sm" variant="outline" onClick={() => setPhotoOpen(true)}>
                <Camera className="h-4 w-4" /> Foto
              </Button>
            )}
            {st.edit && (
              <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
                <Pencil className="h-4 w-4" /> Editar datos
              </Button>
            )}
            {st.dataSource === 'PHIDIAS' && st.phidiasLinked && can(me, 'admin:integrations') && (
              <Button size="sm" variant="ghost" onClick={() => syncOne.mutate()} loading={syncOne.isPending} aria-label="Sincronizar con Phidias">
                <RefreshCw className="h-4 w-4" />
              </Button>
            )}
          </>
        }
      />

      <Tabs
        value={tab}
        onValueChange={setTab}
        tabs={[
          { value: 'resumen', label: 'Resumen' },
          { value: 'salud', label: 'Ficha de salud', hidden: !clinical },
          { value: 'historial', label: 'Historial', hidden: !clinical },
          { value: 'medicacion', label: 'Medicación', hidden: !clinical },
          { value: 'consentimientos', label: 'Consentimientos', hidden: !clinical },
          { value: 'salud-mental', label: 'Salud mental', hidden: !can(me, 'mental_health:read') },
        ]}
      >
        <TabPanel value="resumen">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Acudientes</CardTitle>
                <div className="flex gap-1">
                  {can(me, 'people:write', 'clinical:write') && (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => setGuardianOpen(true)}>
                        <UserPlus className="h-4 w-4" /> Vincular
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => createInvite.mutate('LEGAL_GUARDIAN')} loading={createInvite.isPending}>
                        <Link2 className="h-4 w-4" /> Invitación
                      </Button>
                    </>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {st.guardians.length === 0 && <p className="text-sm text-muted">Sin acudientes vinculados. Genere una invitación para que el acudiente cree su cuenta.</p>}
                <ul className="flex flex-col gap-2">
                  {st.guardians.map((g) => (
                    <li key={g.linkId} className="rounded-xl border border-border p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{g.name}</span>
                        <Badge tone="neutral">{RELATIONSHIP_LABELS[g.relationship] ?? g.relationship}</Badge>
                        {g.isPrimary && <Badge tone="primary">Principal</Badge>}
                        {g.judicialRestriction ? <Badge tone="solidDanger">Restricción judicial</Badge> : g.canPickUp ? <Badge tone="success">Puede recoger</Badge> : <Badge tone="warning">No recoge</Badge>}
                      </div>
                      <p className="text-sm text-muted">
                        {g.phone && (
                          <a href={`tel:${g.phone}`} className="hover:underline">
                            {g.phone}
                          </a>
                        )}
                        {g.email && ` · ${g.email}`}
                      </p>
                      {g.restrictions && <p className="mt-1 text-sm text-red-700 dark:text-red-400">{g.restrictions}</p>}
                      {can(me, 'people:write', 'clinical:write') && (
                        <div className="mt-2 flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => setGuardianEdit(g)}>
                            <Pencil className="h-4 w-4" /> Editar
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => window.confirm(`¿Desvincular a ${g.name} de este estudiante?`) && unlinkGuardian.mutate(g.linkId)}>
                            <UserMinus className="h-4 w-4" /> Desvincular
                          </Button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Contactos de emergencia</CardTitle>
                {can(me, 'people:write', 'clinical:write') && (
                  <Button size="sm" variant="ghost" onClick={() => setContactOpen(true)}>
                    <Plus className="h-4 w-4" /> Agregar
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {st.emergencyContacts.length === 0 && <p className="text-sm text-muted">Sin contactos adicionales.</p>}
                <ul className="flex flex-col gap-2">
                  {st.emergencyContacts.map((c) => (
                    <li key={c.id} className="flex items-center gap-2 rounded-xl border border-border p-3 text-sm">
                      <span className="flex-1">
                        <span className="font-medium">{c.name}</span> · {c.relationship}
                        <br />
                        <a href={`tel:${c.phone}`} className="text-muted hover:underline">
                          {c.phone}
                        </a>
                      </span>
                      {c.canPickUp && <Badge tone="success">Puede recoger</Badge>}
                      {!c.verified && <Badge tone="info">Por verificar</Badge>}
                      {can(me, 'people:write', 'clinical:write') && (
                        <span className="flex gap-1">
                          {!c.verified && (
                            <Button size="icon-sm" variant="ghost" aria-label={`Verificar contacto ${c.name}`} onClick={() => updateContact.mutate({ contactId: c.id, body: { verified: true } })}>
                              <CheckCircle2 className="h-4 w-4" />
                            </Button>
                          )}
                          <Button size="icon-sm" variant="ghost" aria-label={`Quitar contacto ${c.name}`} onClick={() => window.confirm(`¿Quitar a ${c.name} de los contactos de emergencia?`) && updateContact.mutate({ contactId: c.id, body: { active: false } })}>
                            <UserMinus className="h-4 w-4" />
                          </Button>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
            {st.health && (
              <Card>
                <CardHeader>
                  <CardTitle>Medicación activa en el colegio</CardTitle>
                </CardHeader>
                <CardContent>
                  {st.health.activeMedications.length === 0 && <p className="text-sm text-muted">Sin medicación activa.</p>}
                  <ul className="flex flex-col gap-1 text-sm">
                    {st.health.activeMedications.map((m) => (
                      <li key={m.id} className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{m.medicationName}</span> {m.dose} {m.doseUnit}
                        {m.isPrn ? <Badge tone="warning">Rescate / PRN</Badge> : <Badge tone="info">{m.times.join(', ')}</Badge>}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
            <Card>
              <CardHeader>
                <CardTitle>Datos</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                  <dt className="text-muted">Documento</dt>
                  <dd>{st.document ? `${st.document.type ?? ''} ${st.document.number ?? '—'}` : '—'}</dd>
                  <dt className="text-muted">Nacimiento</dt>
                  <dd>{fmtDate(st.birthDate)}</dd>
                  <dt className="text-muted">Sexo</dt>
                  <dd>{st.sex === 'F' ? 'Femenino' : st.sex === 'M' ? 'Masculino' : '—'}</dd>
                  <dt className="text-muted">Grado</dt>
                  <dd>{st.grade?.name ?? '—'}</dd>
                  <dt className="text-muted">Transporte</dt>
                  <dd>{st.transport ?? '—'}</dd>
                </dl>
              </CardContent>
            </Card>
          </div>
        </TabPanel>

        <TabPanel value="salud">{tab === 'salud' && <HealthProfileEditor studentId={id} mode="clinical" />}</TabPanel>

        <TabPanel value="historial">
          <Card className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-semibold">
                <History className="h-5 w-5" /> Línea de tiempo
              </h2>
            </div>
            {timeline.isLoading && <Skeleton className="h-64" />}
            {timeline.data?.events.length === 0 && <EmptyState title="Sin eventos" />}
            {timeline.data && (
              <StatusTimeline
                items={timeline.data.events.map((ev) => ({
                  id: `${ev.kind}-${ev.id}`,
                  title: (
                    <span className="flex flex-wrap items-center gap-2">
                      {ev.kind === 'ENCOUNTER' ? (
                        <button className="hover:underline" onClick={() => router.push(`/enfermeria/atenciones/${ev.id}`)}>
                          {ev.title}
                        </button>
                      ) : (
                        ev.title
                      )}
                      {ev.accident && <Badge tone="warning">Accidente</Badge>}
                      {ev.historical && <Badge tone="neutral">Phidias</Badge>}
                      {ev.status === 'ANNULLED' && <Badge tone="danger">Anulada</Badge>}
                    </span>
                  ),
                  time: fmtDateTime(ev.at),
                  description: ev.subtitle,
                  tone: KIND_TONE[ev.kind],
                }))}
              />
            )}
          </Card>
        </TabPanel>

        <TabPanel value="medicacion">
          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">Registro de administración (MAR) · {month}</h2>
              <Button size="sm" variant="outline" onClick={() => openFile(`/students/${id}/mar/pdf?month=${month}`)}>
                <FileDown className="h-4 w-4" /> Constancia PDF
              </Button>
            </div>
            {mar.data?.rows.length === 0 && <p className="text-sm text-muted">Sin administraciones este mes.</p>}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <tbody>
                  {mar.data?.rows.map((r) => (
                    <tr key={r.id} className="border-t border-border">
                      <td className="tabular py-2">{r.date}</td>
                      <td className="tabular">{r.time}</td>
                      <td>{r.medication}</td>
                      <td>{r.dose}</td>
                      <td>{r.outcome === 'GIVEN' ? <Badge tone="success">Administrada</Badge> : <Badge tone="danger">{r.reason ?? r.outcome}</Badge>}</td>
                      <td className="text-muted">{r.by}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabPanel>

        <TabPanel value="consentimientos">
          <Card className="p-5">
            <ul className="divide-y divide-border">
              {consents.data?.map((c) => (
                <li key={c.template.id} className="flex flex-wrap items-center gap-2 py-3">
                  <span className="flex-1">
                    {c.template.title} <span className="text-xs text-muted">v{c.template.version}</span>
                  </span>
                  {c.status === 'GRANTED' ? <Badge tone="success">Firmado {fmtDate(c.consent?.signedAt)}</Badge> : <Badge tone={c.template.mandatory ? 'danger' : 'warning'}>{c.status === 'REVOKED' ? 'Revocado' : 'Pendiente'}</Badge>}
                </li>
              ))}
            </ul>
          </Card>
        </TabPanel>

        <TabPanel value="salud-mental">
          <Alert tone="info" className="mb-4">
            Notas cifradas y de acceso restringido (Ley 1616 de 2013). Cada consulta queda registrada.
          </Alert>
          {can(me, 'mental_health:write') && (
            <Card className="mb-4 p-4">
              <Field label="Nueva nota">
                <Textarea rows={3} value={mhNote.note} onChange={(e) => setMhNote({ ...mhNote, note: e.target.value })} />
              </Field>
              <div className="mt-2 flex items-end gap-2">
                <Field label="Nivel de riesgo" className="w-48">
                  <Select value={mhNote.riskLevel} onChange={(e) => setMhNote({ ...mhNote, riskLevel: e.target.value })}>
                    <option value="NONE">Sin riesgo</option>
                    <option value="LOW">Bajo</option>
                    <option value="MODERATE">Moderado</option>
                    <option value="HIGH">Alto</option>
                  </Select>
                </Field>
                <Button onClick={() => addMh.mutate()} disabled={mhNote.note.length < 3} loading={addMh.isPending}>
                  Guardar
                </Button>
              </div>
            </Card>
          )}
          <ul className="flex flex-col gap-2">
            {mh.data?.map((n) => (
              <Card key={n.id} className="p-4">
                <div className="mb-1 flex items-center gap-2 text-sm text-muted">
                  {fmtDateTime(n.createdAt)} · {n.author ? `${n.author.firstName} ${n.author.lastName}` : ''}
                  <Badge tone={n.riskLevel === 'HIGH' ? 'danger' : n.riskLevel === 'MODERATE' ? 'warning' : 'neutral'}>{n.riskLevel}</Badge>
                </div>
                <p className="whitespace-pre-wrap">{n.note}</p>
              </Card>
            ))}
          </ul>
        </TabPanel>
      </Tabs>

      {clinical && <EmergencyDialog open={emergency} onOpenChange={setEmergency} studentId={id} />}
      {contactOpen && <ContactDialog studentId={id} onClose={() => setContactOpen(false)} />}
      {guardianOpen && <GuardianDialog studentId={id} onClose={() => setGuardianOpen(false)} />}
      {guardianEdit && <GuardianEditDialog studentId={id} guardian={guardianEdit} onClose={() => setGuardianEdit(null)} />}
      {editOpen && st.edit && <StudentFormDialog studentId={id} initial={st.edit} locked={st.phidiasLocked} onClose={() => setEditOpen(false)} />}
      {photoOpen && <StudentPhotoDialog studentId={id} name={st.name} photoUrl={st.photoUrl} onClose={() => setPhotoOpen(false)} />}
      {invite && (
        <Dialog open onOpenChange={() => setInvite(null)} title="Invitación para acudiente">
          <p className="text-sm text-muted">Comparta este código o enlace. Vence en 14 días y solo puede usarse una vez.</p>
          <p className="tabular my-4 text-center text-3xl font-bold tracking-widest">{invite.code}</p>
          <Button variant="outline" className="w-full" onClick={() => navigator.clipboard.writeText(invite.link).then(() => toast.success('Enlace copiado'))}>
            <Copy className="h-4 w-4" /> Copiar enlace
          </Button>
        </Dialog>
      )}
    </div>
  );
}

function ContactDialog({ studentId, onClose }: { studentId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [v, setV] = useState({ name: '', relationship: '', phone: '', canPickUp: false, documentNumber: '' });
  const add = useMutation({
    mutationFn: () => api(`/students/${studentId}/emergency-contacts`, { body: { ...v, documentNumber: v.documentNumber || null } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['student', studentId] });
      onClose();
    },
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Contacto de emergencia" footer={<Button onClick={() => add.mutate()} loading={add.isPending} disabled={!v.name || !v.phone || !v.relationship}>Guardar</Button>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nombre" required>
          <Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
        </Field>
        <Field label="Parentesco" required>
          <Input value={v.relationship} onChange={(e) => setV({ ...v, relationship: e.target.value })} />
        </Field>
        <Field label="Teléfono" required>
          <Input type="tel" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} />
        </Field>
        <Field label="Documento">
          <Input value={v.documentNumber} onChange={(e) => setV({ ...v, documentNumber: e.target.value })} />
        </Field>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" className="h-5 w-5 accent-primary-700" checked={v.canPickUp} onChange={(e) => setV({ ...v, canPickUp: e.target.checked })} /> Autorizado para recoger al estudiante
        </label>
      </div>
    </Dialog>
  );
}

function GuardianEditDialog({ studentId, guardian, onClose }: { studentId: string; guardian: StudentDetail['guardians'][number]; onClose: () => void }) {
  const qc = useQueryClient();
  const [v, setV] = useState({ relationship: guardian.relationship, isPrimary: guardian.isPrimary, canPickUp: guardian.canPickUp, legalCustody: guardian.legalCustody, judicialRestriction: guardian.judicialRestriction, restrictions: guardian.restrictions ?? '' });
  const save = useMutation({
    mutationFn: () => api(`/students/${studentId}/guardians/${guardian.linkId}`, { method: 'PATCH', body: { ...v, canPickUp: v.judicialRestriction ? false : v.canPickUp, restrictions: v.restrictions || null } }),
    onSuccess: () => {
      toast.success('Acudiente actualizado');
      qc.invalidateQueries({ queryKey: ['student', studentId] });
      onClose();
    },
  });
  const check = (key: 'isPrimary' | 'canPickUp' | 'legalCustody' | 'judicialRestriction', label: string) => (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" className="h-5 w-5 accent-primary-700" checked={v[key]} onChange={(e) => setV({ ...v, [key]: e.target.checked })} /> {label}
    </label>
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={`Editar acudiente · ${guardian.name}`} footer={<Button onClick={() => save.mutate()} loading={save.isPending}>Guardar</Button>}>
      <div className="grid gap-3">
        <Field label="Parentesco">
          <Select value={v.relationship} onChange={(e) => setV({ ...v, relationship: e.target.value })}>
            {Object.entries(RELATIONSHIP_LABELS).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        {check('isPrimary', 'Acudiente principal')}
        {check('canPickUp', 'Puede recoger al estudiante')}
        {check('legalCustody', 'Tiene custodia legal')}
        {check('judicialRestriction', 'Restricción judicial (nunca puede recoger)')}
        {v.judicialRestriction && <Alert tone="danger">Con restricción judicial, esta persona no aparecerá como opción para recoger y portería no podrá entregarle al estudiante.</Alert>}
        <Field label="Restricciones u observaciones" hint="Visible para enfermería, portería y administración.">
          <Textarea rows={2} value={v.restrictions} onChange={(e) => setV({ ...v, restrictions: e.target.value })} />
        </Field>
      </div>
    </Dialog>
  );
}

function GuardianDialog({ studentId, onClose }: { studentId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [v, setV] = useState({ firstName: '', lastName: '', documentType: 'CC', documentNumber: '', email: '', phone: '', relationship: 'MOTHER', isPrimary: false, canPickUp: true, legalCustody: true, priority: 1 });
  const add = useMutation({
    mutationFn: () => api(`/students/${studentId}/guardians`, { body: { ...v, email: v.email || null, phone: v.phone || null } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['student', studentId] });
      onClose();
    },
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Vincular acudiente" footer={<Button onClick={() => add.mutate()} loading={add.isPending}>Vincular</Button>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nombres" required>
          <Input value={v.firstName} onChange={(e) => setV({ ...v, firstName: e.target.value })} />
        </Field>
        <Field label="Apellidos" required>
          <Input value={v.lastName} onChange={(e) => setV({ ...v, lastName: e.target.value })} />
        </Field>
        <Field label="Documento" required>
          <Input value={v.documentNumber} onChange={(e) => setV({ ...v, documentNumber: e.target.value })} />
        </Field>
        <Field label="Parentesco">
          <Select value={v.relationship} onChange={(e) => setV({ ...v, relationship: e.target.value })}>
            {Object.entries(RELATIONSHIP_LABELS).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Correo">
          <Input type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} />
        </Field>
        <Field label="Celular">
          <Input type="tel" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-5 w-5 accent-primary-700" checked={v.canPickUp} onChange={(e) => setV({ ...v, canPickUp: e.target.checked })} /> Puede recoger
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-5 w-5 accent-primary-700" checked={v.isPrimary} onChange={(e) => setV({ ...v, isPrimary: e.target.checked })} /> Acudiente principal
        </label>
      </div>
    </Dialog>
  );
}
