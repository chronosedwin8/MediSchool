'use client';

import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Field, Input, Select, Skeleton, Textarea } from '@sgee/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';

interface Outbound {
  items: { id: string; createdAt: string; channel: string; event: string; subject: string | null; status: string; recipient: string | null; error: string | null }[];
  stats: { channel: string; status: string; _count: number }[];
}
interface Template {
  event: string;
  default: { subject: string; body: string; urgent?: boolean };
  overrides: { channel: string; subject: string | null; body: string; active: boolean }[];
}

export function NotificationsPanel() {
  const qc = useQueryClient();
  const [status, setStatus] = useState('');
  const out = useQuery({ queryKey: ['outbound', status], queryFn: () => api<Outbound>('/notifications/outbound', { query: { status } }) });
  const templates = useQuery({ queryKey: ['templates'], queryFn: () => api<Template[]>('/notification-templates') });
  const [editing, setEditing] = useState<{ event: string; channel: string; subject: string; body: string } | null>(null);
  const save = useMutation({
    mutationFn: () => api(`/notification-templates/${editing!.event}/${editing!.channel}`, { method: 'PUT', body: { subject: editing!.subject, body: editing!.body, active: true } }),
    onSuccess: () => {
      toast.success('Plantilla guardada');
      setEditing(null);
      qc.invalidateQueries({ queryKey: ['templates'] });
    },
  });
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Envíos (30 días)</CardTitle>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-44" aria-label="Estado">
            <option value="">Todos</option>
            {['QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'SUPPRESSED'].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </CardHeader>
        <CardContent>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {out.data?.stats.map((s) => (
              <Badge key={`${s.channel}-${s.status}`} tone={s.status === 'FAILED' ? 'danger' : s.status === 'QUEUED' ? 'info' : 'neutral'}>
                {s.channel} · {s.status}: {s._count}
              </Badge>
            ))}
          </div>
          {out.isLoading && <Skeleton className="h-64" />}
          <ul className="max-h-[480px] divide-y divide-border overflow-y-auto text-sm">
            {out.data?.items.map((n) => (
              <li key={n.id} className="py-2">
                <div className="flex items-center gap-2">
                  <Badge tone="primary">{n.channel}</Badge>
                  <span className="flex-1 truncate">{n.subject}</span>
                  <Badge tone={n.status === 'FAILED' ? 'danger' : n.status === 'SUPPRESSED' ? 'neutral' : 'success'}>{n.status}</Badge>
                </div>
                <p className="text-xs text-muted">
                  {fmtDateTime(n.createdAt)} · {n.event} · {n.recipient} {n.error && `· ${n.error}`}
                </p>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Plantillas por evento</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-2 text-sm text-muted">Variables: {'{{studentName}}'}, {'{{time}}'}, {'{{disposition}}'}… Nunca incluya información clínica detallada.</p>
          <ul className="max-h-[520px] divide-y divide-border overflow-y-auto text-sm">
            {templates.data?.map((t) => (
              <li key={t.event} className="py-2">
                <div className="flex items-center gap-2">
                  <span className="flex-1 font-mono text-xs">{t.event}</span>
                  {t.default.urgent && <Badge tone="danger">Urgente</Badge>}
                  {t.overrides.length > 0 && <Badge tone="info">Personalizada</Badge>}
                  <Button size="sm" variant="ghost" onClick={() => setEditing({ event: t.event, channel: 'EMAIL', subject: t.overrides.find((o) => o.channel === 'EMAIL')?.subject ?? t.default.subject, body: t.overrides.find((o) => o.channel === 'EMAIL')?.body ?? t.default.body })}>
                    Editar
                  </Button>
                </div>
                <p className="text-xs text-muted">{t.overrides[0]?.body ?? t.default.body}</p>
              </li>
            ))}
          </ul>
          {editing && (
            <div className="mt-3 flex flex-col gap-2 rounded-xl border border-border p-3">
              <p className="font-mono text-xs">{editing.event}</p>
              <Field label="Canal">
                <Select value={editing.channel} onChange={(e) => setEditing({ ...editing, channel: e.target.value })}>
                  {['IN_APP', 'EMAIL', 'WHATSAPP', 'SMS', 'PUSH'].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Asunto">
                <Input value={editing.subject} onChange={(e) => setEditing({ ...editing, subject: e.target.value })} />
              </Field>
              <Field label="Mensaje">
                <Textarea rows={3} value={editing.body} onChange={(e) => setEditing({ ...editing, body: e.target.value })} />
              </Field>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setEditing(null)}>
                  Cancelar
                </Button>
                <Button onClick={() => save.mutate()} loading={save.isPending}>
                  Guardar
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
