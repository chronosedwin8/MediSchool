'use client';

import { Alert, Button, Card, CardContent, CardHeader, CardTitle, cn, Field, Input, Skeleton, Toggle } from '@sgee/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';

interface Settings {
  tenant: { name: string; timezone: string; slug: string; country: string };
  settings: {
    dataSource: 'PHIDIAS' | 'LOCAL';
    mfaEnforced: boolean;
    passTransitAlertMinutes: number;
    passExpireMinutes: number;
    returnedAutoCloseMinutes: number;
    observationRecheckMinutes: number;
    medicationTimeWindowMinutes: number;
    medicationOmissionAlertMinutes: number;
    outbreak: { windowDays: number; minCases: number; attackRatePct: number };
    frequentVisitorThreshold: number;
    quietHours: { start: string; end: string };
    sessionMinutes: number;
    kioskSessionMinutes: number;
    enabledChannels: string[];
    requirePrescriptionForOtc: boolean;
    [k: string]: unknown;
  };
}

export function SettingsPanel() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin-settings'], queryFn: () => api<Settings>('/admin/settings') });
  const [v, setV] = useState<Settings | null>(null);
  useEffect(() => {
    if (q.data) setV(q.data);
  }, [q.data]);
  const save = useMutation({
    mutationFn: () => api('/admin/settings', { method: 'PUT', body: { name: v!.tenant.name, timezone: v!.tenant.timezone, settings: v!.settings } }),
    onSuccess: () => {
      toast.success('Configuración guardada');
      qc.invalidateQueries({ queryKey: ['admin-settings'] });
      qc.invalidateQueries({ queryKey: ['me'] });
    },
  });
  if (!v) return <Skeleton className="h-96" />;
  const s = v.settings;
  const num = (key: keyof Settings['settings'], label: string, hint?: string) => (
    <Field label={label} hint={hint}>
      <Input type="number" value={String(s[key] as number)} onChange={(e) => setV({ ...v, settings: { ...s, [key]: Number(e.target.value) } })} />
    </Field>
  );
  const MODES = [
    { key: 'PHIDIAS', title: 'Con Phidias', text: 'Estudiantes, grados, grupos y fotos se sincronizan automáticamente desde Phidias. Los datos académicos de los estudiantes vinculados se corrigen en Phidias.' },
    { key: 'LOCAL', title: 'Independiente de Phidias', text: 'Todo se administra dentro de MediSchool: estructura académica, estudiantes, fotos, acudientes y contactos. Las sincronizaciones con Phidias se detienen.' },
  ] as const;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Modalidad de datos</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {MODES.map((m) => (
            <button
              key={m.key}
              type="button"
              aria-pressed={s.dataSource === m.key}
              onClick={() => setV({ ...v, settings: { ...s, dataSource: m.key } })}
              className={cn('rounded-2xl border p-4 text-left transition-colors', s.dataSource === m.key ? 'border-primary-700 bg-primary-50 ring-1 ring-primary-700 dark:bg-primary-950' : 'border-border hover:bg-card-muted')}
            >
              <span className="block font-semibold">{m.title}</span>
              <span className="mt-1 block text-sm text-muted">{m.text}</span>
            </button>
          ))}
          {q.data && q.data.settings.dataSource !== s.dataSource && (
            <Alert tone="warning" className="md:col-span-2">
              {s.dataSource === 'LOCAL'
                ? 'Al guardar, el colegio pasará a trabajar de forma independiente: se detienen las sincronizaciones con Phidias y los datos ya importados se conservan y podrán editarse en MediSchool.'
                : 'Al guardar, se activará la sincronización con Phidias: los estudiantes vinculados tendrán sus datos académicos en solo lectura y se actualizarán desde Phidias.'}
            </Alert>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Colegio</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <Field label="Nombre">
            <Input value={v.tenant.name} onChange={(e) => setV({ ...v, tenant: { ...v.tenant, name: e.target.value } })} />
          </Field>
          <Field label="Zona horaria">
            <Input value={v.tenant.timezone} onChange={(e) => setV({ ...v, tenant: { ...v.tenant, timezone: e.target.value } })} />
          </Field>
          <p className="text-sm text-muted">
            Identificador: <span className="font-mono">{v.tenant.slug}</span> · Perfil legal: {v.tenant.country}
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Seguridad y sesiones</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Toggle label="MFA obligatorio para roles clínicos y administrativos" checked={s.mfaEnforced} onChange={(val) => setV({ ...v, settings: { ...s, mfaEnforced: val } })} />
          </div>
          {num('sessionMinutes', 'Duración de sesión (min)')}
          {num('kioskSessionMinutes', 'Sesión de kiosco (min)')}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Pases y trazabilidad</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {num('passTransitAlertMinutes', 'Alerta de tránsito (min)', 'Si el estudiante no llega a enfermería')}
          {num('passExpireMinutes', 'Vencimiento del pase (min)')}
          {num('returnedAutoCloseMinutes', 'Cierre automático tras retorno (min)')}
          {num('observationRecheckMinutes', 'Reevaluación de observación (min)')}
          {num('frequentVisitorThreshold', 'Umbral de consultas frecuentes (30 días)')}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Medicación y vigilancia</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {num('medicationTimeWindowMinutes', 'Ventana de la hora correcta (± min)')}
          {num('medicationOmissionAlertMinutes', 'Alerta de dosis omitida (min)')}
          <div className="sm:col-span-2">
            <Toggle label="Exigir fórmula también para medicamentos de venta libre" checked={s.requirePrescriptionForOtc} onChange={(val) => setV({ ...v, settings: { ...s, requirePrescriptionForOtc: val } })} />
          </div>
          <Field label="Brotes: ventana (días)">
            <Input type="number" value={s.outbreak.windowDays} onChange={(e) => setV({ ...v, settings: { ...s, outbreak: { ...s.outbreak, windowDays: Number(e.target.value) } } })} />
          </Field>
          <Field label="Brotes: casos mínimos">
            <Input type="number" value={s.outbreak.minCases} onChange={(e) => setV({ ...v, settings: { ...s, outbreak: { ...s.outbreak, minCases: Number(e.target.value) } } })} />
          </Field>
          <Field label="Brotes: tasa de ataque (%)">
            <Input type="number" value={s.outbreak.attackRatePct} onChange={(e) => setV({ ...v, settings: { ...s, outbreak: { ...s.outbreak, attackRatePct: Number(e.target.value) } } })} />
          </Field>
        </CardContent>
      </Card>
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Canales de comunicación</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          {['EMAIL', 'WHATSAPP', 'SMS', 'PUSH'].map((ch) => (
            <Toggle key={ch} label={{ EMAIL: 'Correo', WHATSAPP: 'WhatsApp', SMS: 'SMS', PUSH: 'Push' }[ch]} checked={s.enabledChannels.includes(ch)} onChange={(val) => setV({ ...v, settings: { ...s, enabledChannels: val ? [...new Set([...s.enabledChannels, ch, 'IN_APP'])] : s.enabledChannels.filter((c) => c !== ch) } })} />
          ))}
          <Field label="Horario de silencio desde">
            <Input type="time" value={s.quietHours.start} onChange={(e) => setV({ ...v, settings: { ...s, quietHours: { ...s.quietHours, start: e.target.value } } })} />
          </Field>
          <Field label="Hasta">
            <Input type="time" value={s.quietHours.end} onChange={(e) => setV({ ...v, settings: { ...s, quietHours: { ...s.quietHours, end: e.target.value } } })} />
          </Field>
        </CardContent>
      </Card>
      <div className="flex justify-end lg:col-span-2">
        <Button size="lg" onClick={() => save.mutate()} loading={save.isPending}>
          Guardar configuración
        </Button>
      </div>
    </div>
  );
}
