'use client';

import { Alert, Badge, Button, Card, CardContent, CardHeader, CardTitle, Field, Input, PageHeader, Select, Skeleton, Toggle } from '@sgee/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellRing, KeyRound, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { LOCALE_LABELS, LOCALES } from '@/lib/i18n';
import { useMe } from '@/lib/session';

interface Prefs {
  channels: Record<string, boolean>;
  quietHoursStart: string;
  quietHoursEnd: string;
  language: string;
  whatsappNumber: string | null;
  availableChannels: string[];
  vapidPublicKey: string | null;
}

const CHANNEL_LABELS: Record<string, string> = { IN_APP: 'En la aplicación', EMAIL: 'Correo electrónico', WHATSAPP: 'WhatsApp', SMS: 'SMS', PUSH: 'Notificaciones push' };

function urlBase64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export default function ProfilePage() {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const prefs = useQuery({ queryKey: ['prefs'], queryFn: () => api<Prefs>('/me/notification-preferences') });
  const [v, setV] = useState<Prefs | null>(null);
  useEffect(() => {
    if (prefs.data) setV(prefs.data);
  }, [prefs.data]);
  const save = useMutation({
    mutationFn: () => api('/me/notification-preferences', { method: 'PUT', body: { channels: v!.channels, quietHoursStart: v!.quietHoursStart, quietHoursEnd: v!.quietHoursEnd, language: v!.language, whatsappNumber: v!.whatsappNumber || null } }),
    onSuccess: () => {
      toast.success('Preferencias guardadas');
      qc.invalidateQueries({ queryKey: ['prefs'] });
    },
  });
  const [mfa, setMfa] = useState<{ qr: string; secret: string } | null>(null);
  const [code, setCode] = useState('');
  const setup = useMutation({ mutationFn: () => api<{ qr: string; secret: string }>('/auth/mfa/setup', { method: 'POST' }), onSuccess: setMfa });
  const enable = useMutation({
    mutationFn: () => api('/auth/mfa/enable', { body: { code } }),
    onSuccess: () => {
      toast.success('Verificación en dos pasos activada');
      setMfa(null);
      qc.invalidateQueries({ queryKey: ['me'] });
    },
  });
  const subscribePush = async () => {
    try {
      if (!v?.vapidPublicKey) return toast.error('Las notificaciones push no están configuradas en el servidor.');
      const reg = await navigator.serviceWorker.register('/sw.js');
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(v.vapidPublicKey) });
      const json = sub.toJSON();
      await api('/push-subscriptions', { body: { endpoint: json.endpoint, keys: json.keys } });
      toast.success('Notificaciones push activadas en este dispositivo');
    } catch {
      toast.error('No fue posible activar las notificaciones push.');
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Mi perfil" description={me ? `${me.name} · ${me.email}` : undefined} />
      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BellRing className="h-5 w-5" /> Notificaciones
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!v ? (
              <Skeleton className="h-40" />
            ) : (
              <div className="flex flex-col gap-2">
                {['IN_APP', 'EMAIL', 'WHATSAPP', 'SMS', 'PUSH'].map((ch) => (
                  <Toggle key={ch} label={<span>{CHANNEL_LABELS[ch]} {!v.availableChannels.includes(ch) && ch !== 'IN_APP' && <Badge tone="neutral">No habilitado por el colegio</Badge>}</span>} checked={ch === 'IN_APP' ? true : !!v.channels[ch]} disabled={ch === 'IN_APP'} onChange={(val) => setV({ ...v, channels: { ...v.channels, [ch]: val } })} />
                ))}
                <div className="mt-2 grid gap-3 sm:grid-cols-3">
                  <Field label="Silencio desde" hint="Las alertas urgentes siempre llegan.">
                    <Input type="time" value={v.quietHoursStart} onChange={(e) => setV({ ...v, quietHoursStart: e.target.value })} />
                  </Field>
                  <Field label="Hasta">
                    <Input type="time" value={v.quietHoursEnd} onChange={(e) => setV({ ...v, quietHoursEnd: e.target.value })} />
                  </Field>
                  <Field label="Idioma">
                    <Select value={v.language} onChange={(e) => setV({ ...v, language: e.target.value })}>
                      {LOCALES.map((l) => (
                        <option key={l} value={l}>
                          {LOCALE_LABELS[l]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Número de WhatsApp" className="sm:col-span-3">
                    <Input type="tel" value={v.whatsappNumber ?? ''} onChange={(e) => setV({ ...v, whatsappNumber: e.target.value })} placeholder="+57 300 000 0000" />
                  </Field>
                </div>
                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  <Button variant="outline" onClick={subscribePush}>
                    Activar push en este dispositivo
                  </Button>
                  <Button onClick={() => save.mutate()} loading={save.isPending}>
                    Guardar
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" /> Seguridad
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex-1">Verificación en dos pasos (TOTP)</span>
              {me?.mfaEnabled ? <Badge tone="success">Activa</Badge> : <Badge tone="warning">Inactiva</Badge>}
              {!me?.mfaEnabled && !mfa && (
                <Button variant="outline" onClick={() => setup.mutate()} loading={setup.isPending}>
                  Configurar
                </Button>
              )}
            </div>
            {mfa && (
              <div className="grid items-center gap-4 rounded-xl border border-border p-4 sm:grid-cols-[auto_1fr]">
                <img src={mfa.qr} alt="Código QR para la aplicación autenticadora" className="h-40 w-40 rounded-lg bg-white p-2" />
                <div className="flex flex-col gap-2">
                  <p className="text-sm">Escanee el código con Google Authenticator, Microsoft Authenticator o similar y escriba el código de 6 dígitos.</p>
                  <p className="font-mono text-xs text-muted">{mfa.secret}</p>
                  <Input inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className="tabular w-40 text-center text-xl tracking-[0.4em]" />
                  <Button onClick={() => enable.mutate()} disabled={code.length !== 6} loading={enable.isPending} className="self-start">
                    Activar
                  </Button>
                </div>
              </div>
            )}
            {['NURSE', 'DOCTOR', 'ADMIN', 'HEALTH_COORDINATOR'].some((r) => me?.roles.includes(r as never)) && !me?.mfaEnabled && <Alert tone="warning">Su rol maneja información clínica o administrativa. Se recomienda activar la verificación en dos pasos.</Alert>}
            <Link href="/cambiar-clave">
              <Button variant="outline">
                <KeyRound className="h-4 w-4" /> Cambiar contraseña
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
