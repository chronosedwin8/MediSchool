'use client';

import { COMPLIANCE_PROFILES } from '@sgee/shared';
import { Alert, Badge, Button, Card, Field, Input, Select } from '@sgee/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api';
import { fmtDate } from '@/lib/format';

export function TenantsPanel() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['tenants'], queryFn: () => api<{ id: string; slug: string; name: string; country: string; active: boolean; createdAt: string }[]>('/admin/tenants') });
  const [v, setV] = useState({ slug: '', name: '', country: 'CO', adminEmail: '' });
  const [created, setCreated] = useState<{ adminEmail: string; temporaryPassword: string } | null>(null);
  const create = useMutation({
    mutationFn: () => api<{ adminEmail: string; temporaryPassword: string }>('/admin/tenants', { body: v }),
    onSuccess: (r) => {
      setCreated(r);
      qc.invalidateQueries({ queryKey: ['tenants'] });
    },
  });
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
      <Card className="p-4">
        <ul className="divide-y divide-border text-sm">
          {q.data?.map((t) => (
            <li key={t.id} className="flex items-center gap-2 py-2">
              <span className="flex-1 font-medium">{t.name}</span>
              <span className="font-mono text-xs text-muted">{t.slug}</span>
              <Badge tone="neutral">{t.country}</Badge>
              <span className="text-xs text-muted">{fmtDate(t.createdAt)}</span>
            </li>
          ))}
        </ul>
      </Card>
      <Card className="flex flex-col gap-3 p-4">
        <h3 className="font-semibold">Nuevo colegio</h3>
        {created && (
          <Alert tone="success" title="Colegio creado">
            Administrador: {created.adminEmail} · contraseña temporal <span className="font-mono">{created.temporaryPassword}</span>
          </Alert>
        )}
        <Field label="Nombre">
          <Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
        </Field>
        <Field label="Identificador (slug)">
          <Input value={v.slug} onChange={(e) => setV({ ...v, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} />
        </Field>
        <Field label="Perfil legal">
          <Select value={v.country} onChange={(e) => setV({ ...v, country: e.target.value })}>
            {COMPLIANCE_PROFILES.map((p) => (
              <option key={p.country} value={p.country}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Correo del administrador">
          <Input type="email" value={v.adminEmail} onChange={(e) => setV({ ...v, adminEmail: e.target.value })} />
        </Field>
        <Button onClick={() => create.mutate()} loading={create.isPending} disabled={!v.name || v.slug.length < 3 || !v.adminEmail}>
          Crear colegio
        </Button>
      </Card>
    </div>
  );
}
