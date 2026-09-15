import { classifyVital, VITAL_META, type VitalKey, type VitalLevel } from '@sgee/shared';
import { AlertTriangle, Droplet, HeartPulse, ShieldAlert } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from './cn';
import { Badge } from './primitives';

// ── Avatar ───────────────────────────────────────────────────────────────────
export function StudentAvatar({ src, name, size = 48, alert, className }: { src?: string | null; name: string; size?: number; alert?: boolean; className?: string }) {
  const [failed, setFailed] = useState(false);
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
  return (
    <span
      className={cn('relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-100 font-semibold text-primary-800 dark:bg-primary-900 dark:text-primary-100', alert && 'ring-2 ring-red-600 ring-offset-2 ring-offset-card', className)}
      style={{ width: size, height: size, fontSize: Math.max(11, size * 0.36) }}
    >
      {src && !failed ? <img src={src} alt={`Foto de ${name}`} className="h-full w-full object-cover" loading="lazy" onError={() => setFailed(true)} /> : <span aria-hidden>{initials}</span>}
    </span>
  );
}

// ── PatientHeader: red alerts always visible (PLAN §9.1) ─────────────────────
export interface PatientHeaderProps {
  name: string;
  photoUrl?: string | null;
  subtitle?: ReactNode;
  allergies?: { agent: string; severity: string; requiresEpinephrine?: boolean }[];
  conditions?: { name: string; critical?: boolean }[];
  bloodType?: string | null;
  actions?: ReactNode;
  compact?: boolean;
  className?: string;
}

export function PatientHeader({ name, photoUrl, subtitle, allergies = [], conditions = [], bloodType, actions, compact, className }: PatientHeaderProps) {
  const anaphylaxis = allergies.some((a) => a.severity === 'ANAPHYLAXIS' || a.requiresEpinephrine);
  const severe = allergies.filter((a) => ['SEVERE', 'ANAPHYLAXIS'].includes(a.severity));
  const critical = conditions.filter((c) => c.critical);
  return (
    <div className={cn('rounded-2xl border bg-card shadow-[var(--shadow-soft)]', anaphylaxis ? 'border-red-300 dark:border-red-800' : 'border-border', className)}>
      {anaphylaxis && (
        <div className="flex items-center gap-2 rounded-t-2xl bg-red-600 px-4 py-2 text-sm font-semibold text-white" role="alert">
          <ShieldAlert className="h-4 w-4" aria-hidden />
          RIESGO DE ANAFILAXIA — {severe.map((a) => a.agent).join(', ')}
          {allergies.some((a) => a.requiresEpinephrine) && <span className="ml-auto rounded-full bg-white/20 px-2 py-0.5 text-xs">Requiere epinefrina</span>}
        </div>
      )}
      <div className={cn('flex flex-wrap items-center gap-4', compact ? 'p-3' : 'p-4')}>
        <StudentAvatar src={photoUrl} name={name} size={compact ? 44 : 64} alert={anaphylaxis} />
        <div className="min-w-0 flex-1">
          <p className={cn('truncate font-semibold tracking-tight', compact ? 'text-base' : 'text-xl')}>{name}</p>
          {subtitle && <div className="mt-0.5 text-sm text-muted">{subtitle}</div>}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {bloodType && (
              <Badge tone="neutral">
                <Droplet className="h-3 w-3" aria-hidden /> {bloodType}
              </Badge>
            )}
            {allergies.length === 0 && <Badge tone="success">Sin alergias registradas</Badge>}
            {allergies.map((a) => (
              <Badge key={a.agent} tone={['SEVERE', 'ANAPHYLAXIS'].includes(a.severity) ? 'danger' : 'warning'}>
                <AlertTriangle className="h-3 w-3" aria-hidden /> {a.agent}
              </Badge>
            ))}
            {conditions.map((c) => (
              <Badge key={c.name} tone={c.critical ? 'violet' : 'info'}>
                {c.critical && <HeartPulse className="h-3 w-3" aria-hidden />} {c.name}
              </Badge>
            ))}
            {critical.length > 0 && <span className="sr-only">Condiciones críticas: {critical.map((c) => c.name).join(', ')}</span>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}

// ── VitalsInput: numeric keypad, coloured by age range ───────────────────────
export type VitalsValue = Partial<Record<VitalKey, number | null>>;

const LEVEL_CLASS: Record<VitalLevel, string> = {
  normal: 'border-emerald-300 bg-emerald-50/60 dark:border-emerald-800 dark:bg-emerald-950/30',
  warning: 'border-amber-400 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40',
  critical: 'border-red-500 bg-red-50 text-red-900 dark:border-red-700 dark:bg-red-950/50 dark:text-red-100',
};

export function VitalsInput({ value, onChange, ageYears, keys, disabled }: { value: VitalsValue; onChange: (v: VitalsValue) => void; ageYears: number; keys?: VitalKey[]; disabled?: boolean }) {
  const fields = keys ?? (['temperatureC', 'heartRate', 'respiratoryRate', 'spo2', 'systolic', 'diastolic', 'glucoseMgDl', 'painScore', 'glasgow'] as VitalKey[]);
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {fields.map((k) => {
        const meta = VITAL_META[k];
        const v = value[k];
        const level = classifyVital(k, v ?? null, ageYears);
        return (
          <label key={k} className={cn('flex flex-col gap-1 rounded-xl border p-2.5 transition-colors', level ? LEVEL_CLASS[level] : 'border-border bg-card')}>
            <span className="flex items-center justify-between text-xs font-medium text-muted">
              {meta.label}
              {level && level !== 'normal' && <span className={cn('rounded px-1 text-[10px] uppercase', level === 'critical' ? 'bg-red-600 text-white' : 'bg-amber-400 text-amber-950')}>{level === 'critical' ? 'Crítico' : 'Alerta'}</span>}
            </span>
            <span className="flex items-baseline gap-1">
              <input
                type="number"
                inputMode={meta.step < 1 ? 'decimal' : 'numeric'}
                step={meta.step}
                min={meta.min}
                max={meta.max}
                disabled={disabled}
                value={v ?? ''}
                aria-label={`${meta.label} (${meta.unit})`}
                aria-invalid={level === 'critical' || undefined}
                onChange={(e) => onChange({ ...value, [k]: e.target.value === '' ? null : Number(e.target.value) })}
                className="tabular w-full bg-transparent text-xl font-semibold outline-none"
              />
              <span className="text-xs text-muted">{meta.unit}</span>
            </span>
          </label>
        );
      })}
    </div>
  );
}

// ── StatusTimeline ───────────────────────────────────────────────────────────
export function StatusTimeline({ items }: { items: { id: string; title: ReactNode; time?: ReactNode; description?: ReactNode; tone?: 'primary' | 'success' | 'warning' | 'danger' | 'neutral' | 'violet' }[] }) {
  const dot = { primary: 'bg-primary-600', success: 'bg-emerald-600', warning: 'bg-amber-500', danger: 'bg-red-600', neutral: 'bg-border', violet: 'bg-violet-600' };
  return (
    <ol className="relative ml-2 border-l border-border">
      {items.map((it) => (
        <li key={it.id} className="mb-4 ml-5 last:mb-0">
          <span className={cn('absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-card', dot[it.tone ?? 'primary'])} aria-hidden />
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <p className="text-sm font-medium">{it.title}</p>
            {it.time && <time className="tabular text-xs text-muted">{it.time}</time>}
          </div>
          {it.description && <div className="mt-0.5 text-sm text-muted">{it.description}</div>}
        </li>
      ))}
    </ol>
  );
}

// ── Kanban column ────────────────────────────────────────────────────────────
export function KanbanColumn({ title, count, tone = 'neutral', children, className }: { title: string; count: number; tone?: 'neutral' | 'primary' | 'warning' | 'danger' | 'violet' | 'success'; children: ReactNode; className?: string }) {
  const bar = { neutral: 'bg-border', primary: 'bg-primary-500', warning: 'bg-amber-500', danger: 'bg-red-500', violet: 'bg-violet-500', success: 'bg-emerald-500' };
  return (
    <section className={cn('flex min-w-[260px] flex-1 flex-col rounded-2xl bg-card-muted/70 p-2', className)} aria-label={`${title}: ${count}`}>
      <header className="flex items-center gap-2 px-2 py-2">
        <span className={cn('h-2.5 w-2.5 rounded-full', bar[tone])} aria-hidden />
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="tabular ml-auto rounded-full bg-card px-2 text-xs text-muted">{count}</span>
      </header>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}

// ── SignaturePad ─────────────────────────────────────────────────────────────
export function SignaturePad({ onChange, height = 160, className }: { onChange: (dataUrl: string | null) => void; height?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const dirty = useRef(false);

  useEffect(() => {
    const c = ref.current!;
    const ratio = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * ratio;
    c.height = height * ratio;
    const ctx = c.getContext('2d')!;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#111827';
  }, [height]);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as const;
  };

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <canvas
        ref={ref}
        style={{ height, touchAction: 'none' }}
        className="w-full rounded-xl border border-dashed border-border bg-white"
        aria-label="Área de firma"
        onPointerDown={(e) => {
          drawing.current = true;
          const ctx = e.currentTarget.getContext('2d')!;
          const [x, y] = pos(e);
          ctx.beginPath();
          ctx.moveTo(x, y);
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const ctx = e.currentTarget.getContext('2d')!;
          const [x, y] = pos(e);
          ctx.lineTo(x, y);
          ctx.stroke();
          dirty.current = true;
        }}
        onPointerUp={(e) => {
          drawing.current = false;
          if (dirty.current) onChange(e.currentTarget.toDataURL('image/png'));
        }}
      />
      <button
        type="button"
        className="self-end text-sm text-muted underline-offset-4 hover:underline"
        onClick={() => {
          const c = ref.current!;
          c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
          dirty.current = false;
          onChange(null);
        }}
      >
        Borrar firma
      </button>
    </div>
  );
}

// ── FileDropzone (camera on mobile) ──────────────────────────────────────────
export function FileDropzone({ onFile, accept = 'image/jpeg,image/png,image/webp,application/pdf', label = 'Tomar foto o seleccionar archivo', hint = 'JPG, PNG, WEBP o PDF · máx. 10 MB', file, className }: { onFile: (f: File | null) => void; accept?: string; label?: string; hint?: string; file?: File | null; className?: string }) {
  const [over, setOver] = useState(false);
  return (
    <label
      className={cn('flex min-h-28 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed p-4 text-center transition-colors', over ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/30' : 'border-border hover:border-primary-400', className)}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
      }}
    >
      <input type="file" accept={accept} capture="environment" className="sr-only" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
      <span className="font-medium">{file ? file.name : label}</span>
      <span className="text-xs text-muted">{file ? `${Math.round(file.size / 1024)} KB` : hint}</span>
    </label>
  );
}
