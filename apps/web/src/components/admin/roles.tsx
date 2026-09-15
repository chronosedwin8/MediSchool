'use client';

import { Button, Skeleton } from '@sgee/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';

interface Matrix {
  permissions: string[];
  roles: { role: string; label: string; permissions: string[]; defaults: string[] }[];
}

export function RolesPanel() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin-roles'], queryFn: () => api<Matrix>('/admin/roles') });
  const [draft, setDraft] = useState<Record<string, Set<string>>>({});
  useEffect(() => {
    if (q.data) setDraft(Object.fromEntries(q.data.roles.map((r) => [r.role, new Set(r.permissions)])));
  }, [q.data]);
  const save = useMutation({
    mutationFn: (role: string) => api(`/admin/roles/${role}`, { method: 'PUT', body: { permissions: [...(draft[role] ?? [])] } }),
    onSuccess: () => {
      toast.success('Permisos actualizados');
      qc.invalidateQueries({ queryKey: ['admin-roles'] });
    },
  });
  if (!q.data) return <Skeleton className="h-96" />;
  const toggle = (role: string, perm: string) => {
    const next = new Set(draft[role]);
    if (next.has(perm)) next.delete(perm);
    else next.add(perm);
    setDraft({ ...draft, [role]: next });
  };
  const changed = (role: string) => {
    const orig = new Set(q.data.roles.find((r) => r.role === role)?.permissions);
    const d = draft[role];
    return !!d && (d.size !== orig.size || [...d].some((p) => !orig.has(p)));
  };
  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-card">
      <table className="text-xs">
        <thead className="sticky top-0 bg-card-muted">
          <tr>
            <th className="sticky left-0 z-10 bg-card-muted px-3 py-2 text-left">Permiso</th>
            {q.data.roles.map((r) => (
              <th key={r.role} className="min-w-24 px-2 py-2 text-center font-medium">
                {r.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {q.data.permissions.map((p) => (
            <tr key={p} className="border-t border-border">
              <td className="sticky left-0 bg-card px-3 py-1.5 font-mono">{p}</td>
              {q.data.roles.map((r) => (
                <td key={r.role} className="text-center">
                  <input type="checkbox" className="h-4 w-4 accent-primary-700" checked={draft[r.role]?.has(p) ?? false} onChange={() => toggle(r.role, p)} aria-label={`${r.label}: ${p}`} disabled={r.role === 'SUPERADMIN'} />
                </td>
              ))}
            </tr>
          ))}
          <tr className="border-t border-border">
            <td className="sticky left-0 bg-card px-3 py-2" />
            {q.data.roles.map((r) => (
              <td key={r.role} className="px-1 py-2 text-center">
                {changed(r.role) && (
                  <Button size="sm" onClick={() => save.mutate(r.role)} loading={save.isPending && save.variables === r.role}>
                    Guardar
                  </Button>
                )}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
