'use client';

import { ROLE_LABELS, ROLES, type Role } from '@sgee/shared';
import { Alert, Badge, Button, Card, Field, Input, Select, Skeleton } from '@sgee/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Lock, Plus, ShieldOff, UserCog } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import type { Structure } from '@/app/(app)/estudiantes/page';
import { Dialog } from '@/components/dialog';
import { useDebounced } from '@/components/student-picker';
import { api } from '@/lib/api';
import { relative } from '@/lib/format';
import { hasRole, useMe } from '@/lib/session';

interface AdminUser {
  id: string;
  email: string;
  name: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  active: boolean;
  roles: { role: Role; label: string; scopeSectionId: string | null }[];
  teacherGroups: { id: string; name: string }[];
  mfaEnabled: boolean;
  locked: boolean;
  lastLoginAt: string | null;
  kioskDeviceCode: string | null;
}

export function UsersPanel() {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const dq = useDebounced(q);
  const users = useQuery({ queryKey: ['admin-users', dq, role], queryFn: () => api<AdminUser[]>('/admin/users', { query: { q: dq, role } }) });
  const [editing, setEditing] = useState<AdminUser | 'new' | null>(null);
  const [secret, setSecret] = useState<{ email: string; password?: string; kiosk?: string | null } | null>(null);
  const action = useMutation({
    mutationFn: (v: { id: string; body: Record<string, unknown> }) => api<{ temporaryPassword?: string }>(`/admin/users/${v.id}`, { method: 'PATCH', body: v.body }),
    onSuccess: (r, v) => {
      qc.invalidateQueries({ queryKey: ['admin-users'] });
      if (r.temporaryPassword) setSecret({ email: users.data?.find((u) => u.id === v.id)?.email ?? '', password: r.temporaryPassword });
      else toast.success('Usuario actualizado');
    },
  });
  return (
    <div>
      <Card className="mb-3 flex flex-wrap items-center gap-3 p-3">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre o correo" className="max-w-sm" aria-label="Buscar usuario" />
        <Select value={role} onChange={(e) => setRole(e.target.value)} className="w-56" aria-label="Rol">
          <option value="">Todos los roles</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </Select>
        <Button className="ml-auto" onClick={() => setEditing('new')}>
          <Plus className="h-4 w-4" /> Nuevo usuario
        </Button>
      </Card>
      {users.isLoading && <Skeleton className="h-64" />}
      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="bg-card-muted text-left text-xs text-muted">
            <tr>
              <th className="px-3 py-2">Usuario</th>
              <th>Roles</th>
              <th>Seguridad</th>
              <th>Último acceso</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {users.data?.map((u) => (
              <tr key={u.id} className="border-t border-border">
                <td className="px-3 py-2">
                  <p className="font-medium">
                    {u.name} {!u.active && <Badge tone="neutral">Inactivo</Badge>}
                  </p>
                  <p className="text-xs text-muted">{u.email}</p>
                </td>
                <td>
                  <div className="flex flex-wrap gap-1">
                    {u.roles.map((r) => (
                      <Badge key={r.role} tone="primary">
                        {r.label}
                        {r.scopeSectionId && ' (sección)'}
                      </Badge>
                    ))}
                    {u.teacherGroups.length > 0 && <Badge tone="neutral">{u.teacherGroups.map((g) => g.name).join(', ')}</Badge>}
                  </div>
                </td>
                <td>
                  <div className="flex flex-wrap gap-1">
                    {u.mfaEnabled ? <Badge tone="success">MFA</Badge> : <Badge tone="neutral">Sin MFA</Badge>}
                    {u.locked && <Badge tone="danger">Bloqueado</Badge>}
                    {u.kioskDeviceCode && <Badge tone="info">Kiosco {u.kioskDeviceCode}</Badge>}
                  </div>
                </td>
                <td className="text-muted">{relative(u.lastLoginAt)}</td>
                <td className="pr-3 text-right">
                  <div className="flex justify-end gap-1">
                    <Button size="icon-sm" variant="ghost" onClick={() => setEditing(u)} aria-label="Editar">
                      <UserCog className="h-4 w-4" />
                    </Button>
                    <Button size="icon-sm" variant="ghost" onClick={() => window.confirm(`¿Restablecer la contraseña de ${u.email}?`) && action.mutate({ id: u.id, body: { resetPassword: true } })} aria-label="Restablecer contraseña">
                      <KeyRound className="h-4 w-4" />
                    </Button>
                    {u.locked && (
                      <Button size="icon-sm" variant="ghost" onClick={() => action.mutate({ id: u.id, body: { unlock: true } })} aria-label="Desbloquear">
                        <Lock className="h-4 w-4" />
                      </Button>
                    )}
                    {u.mfaEnabled && (
                      <Button size="icon-sm" variant="ghost" onClick={() => window.confirm('¿Restablecer MFA?') && action.mutate({ id: u.id, body: { resetMfa: true } })} aria-label="Restablecer MFA">
                        <ShieldOff className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && <UserDialog user={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={(s) => { setEditing(null); if (s) setSecret(s); qc.invalidateQueries({ queryKey: ['admin-users'] }); }} />}
      {secret && (
        <Dialog open onOpenChange={() => setSecret(null)} title="Credenciales temporales">
          <Alert tone="warning">Entregue estas credenciales de forma segura. No se volverán a mostrar; el usuario deberá cambiar la contraseña al ingresar.</Alert>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-muted">Correo</dt>
            <dd>{secret.email}</dd>
            {secret.password && (
              <>
                <dt className="text-muted">Contraseña</dt>
                <dd className="font-mono">{secret.password}</dd>
              </>
            )}
            {secret.kiosk && (
              <>
                <dt className="text-muted">Dispositivo kiosco</dt>
                <dd className="font-mono">{secret.kiosk}</dd>
              </>
            )}
          </dl>
        </Dialog>
      )}
    </div>
  );
}

function UserDialog({ user, onClose, onSaved }: { user: AdminUser | null; onClose: () => void; onSaved: (s: { email: string; password?: string; kiosk?: string | null } | null) => void }) {
  const { data: me } = useMe();
  const structure = useQuery({ queryKey: ['structure'], queryFn: () => api<Structure[]>('/structure'), staleTime: 600_000 });
  const [v, setV] = useState({
    email: user?.email ?? '',
    firstName: user?.firstName ?? '',
    lastName: user?.lastName ?? '',
    phone: user?.phone ?? '',
    roles: user?.roles.map((r) => r.role) ?? (['TEACHER'] as Role[]),
    scopeSectionId: user?.roles.find((r) => r.scopeSectionId)?.scopeSectionId ?? '',
    teacherGroupIds: user?.teacherGroups.map((g) => g.id) ?? [],
    active: user?.active ?? true,
    kioskPin: '',
  });
  const groups = structure.data?.flatMap((s) => s.grades.flatMap((g) => g.groups)) ?? [];
  const save = useMutation({
    mutationFn: async () => {
      const roles = v.roles.map((role) => ({ role, scopeSectionId: role === 'DIRECTOR' && v.scopeSectionId ? v.scopeSectionId : null }));
      const body = { email: v.email, firstName: v.firstName, lastName: v.lastName, phone: v.phone || null, roles, teacherGroupIds: v.roles.includes('TEACHER') ? v.teacherGroupIds : [], ...(v.kioskPin ? { kioskPin: v.kioskPin } : {}) };
      if (user) {
        await api(`/admin/users/${user.id}`, { method: 'PATCH', body: { ...body, active: v.active } });
        return null;
      }
      const r = await api<{ email: string; temporaryPassword?: string; kioskDeviceCode?: string | null }>('/admin/users', { body });
      return { email: r.email, password: r.temporaryPassword, kiosk: r.kioskDeviceCode };
    },
    onSuccess: (s) => {
      toast.success(user ? 'Usuario actualizado' : 'Usuario creado');
      onSaved(s);
    },
  });
  const assignable = ROLES.filter((r) => r !== 'SUPERADMIN' || hasRole(me, 'SUPERADMIN'));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={user ? 'Editar usuario' : 'Nuevo usuario'} size="lg" footer={<Button onClick={() => save.mutate()} loading={save.isPending} disabled={!v.email || !v.firstName || !v.lastName || v.roles.length === 0}>Guardar</Button>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nombres" required>
          <Input value={v.firstName} onChange={(e) => setV({ ...v, firstName: e.target.value })} />
        </Field>
        <Field label="Apellidos" required>
          <Input value={v.lastName} onChange={(e) => setV({ ...v, lastName: e.target.value })} />
        </Field>
        <Field label="Correo" required>
          <Input type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} />
        </Field>
        <Field label="Celular">
          <Input type="tel" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} />
        </Field>
        <Field label="Roles" className="sm:col-span-2">
          <div className="flex flex-wrap gap-1.5">
            {assignable.map((r) => (
              <button key={r} type="button" onClick={() => setV({ ...v, roles: v.roles.includes(r) ? v.roles.filter((x) => x !== r) : [...v.roles, r] })} className={`min-h-9 rounded-full border px-3 text-sm ${v.roles.includes(r) ? 'border-primary-700 bg-primary-700 text-white' : 'border-border'}`}>
                {ROLE_LABELS[r]}
              </button>
            ))}
          </div>
        </Field>
        {v.roles.includes('DIRECTOR') && (
          <Field label="Alcance del directivo (sección)">
            <Select value={v.scopeSectionId} onChange={(e) => setV({ ...v, scopeSectionId: e.target.value })}>
              <option value="">Todo el colegio</option>
              {structure.data?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {v.roles.includes('GATE') && (
          <Field label="PIN de kiosco (4–8 dígitos)" hint="Genera un código de dispositivo para la tablet de portería.">
            <Input inputMode="numeric" maxLength={8} value={v.kioskPin} onChange={(e) => setV({ ...v, kioskPin: e.target.value.replace(/\D/g, '') })} />
          </Field>
        )}
        {v.roles.includes('TEACHER') && (
          <Field label="Grupos del docente" className="sm:col-span-2">
            <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
              {groups.map((g) => (
                <button key={g.id} type="button" onClick={() => setV({ ...v, teacherGroupIds: v.teacherGroupIds.includes(g.id) ? v.teacherGroupIds.filter((x) => x !== g.id) : [...v.teacherGroupIds, g.id] })} className={`min-h-8 rounded-full border px-2.5 text-xs ${v.teacherGroupIds.includes(g.id) ? 'border-primary-700 bg-primary-700 text-white' : 'border-border'}`}>
                  {g.name}
                </button>
              ))}
            </div>
          </Field>
        )}
        {user && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-5 w-5 accent-primary-700" checked={v.active} onChange={(e) => setV({ ...v, active: e.target.checked })} /> Usuario activo
          </label>
        )}
      </div>
    </Dialog>
  );
}
