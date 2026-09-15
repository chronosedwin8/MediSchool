'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { createContext, forwardRef, useContext, useId, type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, type LabelHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from './cn';

// ── Button ───────────────────────────────────────────────────────────────────
export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors select-none disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.98] motion-safe:transition-transform',
  {
    variants: {
      variant: {
        primary: 'bg-primary-700 text-white hover:bg-primary-800 shadow-sm dark:bg-primary-500 dark:text-[#06201e] dark:hover:bg-primary-400',
        secondary: 'bg-card-muted text-fg hover:bg-border',
        outline: 'border border-border bg-card text-fg hover:bg-card-muted',
        ghost: 'text-fg hover:bg-card-muted',
        danger: 'bg-red-600 text-white hover:bg-red-700 shadow-sm',
        success: 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm',
        warning: 'bg-amber-500 text-amber-950 hover:bg-amber-400 shadow-sm',
        link: 'text-primary-700 underline-offset-4 hover:underline dark:text-primary-300 px-0',
      },
      size: {
        sm: 'h-9 px-3 text-sm',
        md: 'h-11 px-4 text-[15px]',
        lg: 'h-13 px-6 text-base min-h-[52px]',
        xl: 'min-h-[64px] px-6 text-lg',
        icon: 'h-11 w-11',
        'icon-sm': 'h-9 w-9',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, loading, disabled, children, type = 'button', ...props }, ref) => (
  <button ref={ref} type={type} className={cn(buttonVariants({ variant, size }), className)} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
    {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
    {children}
  </button>
));
Button.displayName = 'Button';

// ── Card ─────────────────────────────────────────────────────────────────────
export const Card = ({ className, ...p }: HTMLAttributes<HTMLDivElement>) => <div className={cn('rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)]', className)} {...p} />;
export const CardHeader = ({ className, ...p }: HTMLAttributes<HTMLDivElement>) => <div className={cn('flex flex-wrap items-start justify-between gap-3 p-5 pb-3', className)} {...p} />;
export const CardTitle = ({ className, ...p }: HTMLAttributes<HTMLHeadingElement>) => <h3 className={cn('text-base font-semibold tracking-tight', className)} {...p} />;
export const CardDescription = ({ className, ...p }: HTMLAttributes<HTMLParagraphElement>) => <p className={cn('text-sm text-muted', className)} {...p} />;
export const CardContent = ({ className, ...p }: HTMLAttributes<HTMLDivElement>) => <div className={cn('p-5 pt-2', className)} {...p} />;
export const CardFooter = ({ className, ...p }: HTMLAttributes<HTMLDivElement>) => <div className={cn('flex items-center justify-end gap-2 border-t border-border p-4', className)} {...p} />;

// ── Badge ────────────────────────────────────────────────────────────────────
export const badgeVariants = cva('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap', {
  variants: {
    tone: {
      neutral: 'bg-card-muted text-muted border border-border',
      primary: 'bg-primary-100 text-primary-800 dark:bg-primary-900/60 dark:text-primary-200',
      success: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200',
      warning: 'bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-200',
      danger: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200',
      violet: 'bg-violet-100 text-violet-800 dark:bg-violet-900/50 dark:text-violet-200',
      info: 'bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200',
      solidDanger: 'bg-red-600 text-white',
    },
  },
  defaultVariants: { tone: 'neutral' },
});
export const Badge = ({ className, tone, ...p }: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) => <span className={cn(badgeVariants({ tone }), className)} {...p} />;

// ── Form controls ────────────────────────────────────────────────────────────
const control = 'w-full rounded-xl border border-border bg-card px-3 text-[15px] text-fg placeholder:text-muted/70 shadow-sm transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/25 disabled:opacity-60 aria-[invalid=true]:border-red-500';

/** Links a Field's label/hint to the first control rendered inside it, even through wrappers. */
const FieldContext = createContext<{ id: string; describedBy?: string } | null>(null);
function useFieldControl(id: string | undefined, describedBy: string | undefined) {
  const ctx = useContext(FieldContext);
  return { id: id ?? ctx?.id, 'aria-describedby': describedBy ?? ctx?.describedBy };
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, id, 'aria-describedby': d, ...p }, ref) => <input ref={ref} className={cn(control, 'h-11', className)} {...useFieldControl(id, d)} {...p} />);
Input.displayName = 'Input';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, rows = 3, id, 'aria-describedby': d, ...p }, ref) => <textarea ref={ref} rows={rows} className={cn(control, 'py-2.5 leading-relaxed', className)} {...useFieldControl(id, d)} {...p} />);
Textarea.displayName = 'Textarea';

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, id, 'aria-describedby': d, ...p }, ref) => (
  <select ref={ref} {...useFieldControl(id, d)} className={cn(control, 'h-11 appearance-none bg-[url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2716%27 height=%2716%27 fill=%27none%27 stroke=%27%236f6a63%27 stroke-width=%272%27%3E%3Cpath d=%27M4 6l4 4 4-4%27/%3E%3C/svg%3E")] bg-[position:right_0.75rem_center] bg-no-repeat pr-9', className)} {...p}>
    {children}
  </select>
));
Select.displayName = 'Select';

export const Label = ({ className, ...p }: LabelHTMLAttributes<HTMLLabelElement>) => <label className={cn('text-sm font-medium text-fg', className)} {...p} />;

export function Field({ label, hint, error, children, className, htmlFor, required }: { label?: ReactNode; hint?: ReactNode; error?: string | null; children: ReactNode; className?: string; htmlFor?: string; required?: boolean }) {
  const autoId = useId();
  const id = htmlFor ?? `field-${autoId}`;
  const noteId = `${id}-note`;
  const note = error ?? hint;
  return (
    <FieldContext.Provider value={{ id, describedBy: note ? noteId : undefined }}>
      <div className={cn('flex flex-col gap-1.5', className)}>
        {label && (
          <Label htmlFor={id}>
            {label}
            {required && <span className="ml-0.5 text-red-600" aria-hidden>*</span>}
          </Label>
        )}
        {children}
        {error ? <p id={noteId} className="text-xs text-red-600" role="alert">{error}</p> : hint ? <p id={noteId} className="text-xs text-muted">{hint}</p> : null}
      </div>
    </FieldContext.Provider>
  );
}

export function Checkbox({ label, className, ...p }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }) {
  return (
    <label className={cn('flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-1 text-[15px]', className)}>
      <input type="checkbox" className="h-5 w-5 shrink-0 rounded border-border accent-primary-700" {...p} />
      <span>{label}</span>
    </label>
  );
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; disabled?: boolean }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center justify-between gap-4">
      <span className="text-[15px]">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn('relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50', checked ? 'bg-primary-600' : 'bg-border')}
      >
        <span className={cn('absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-5.5' : 'translate-x-0.5')} />
      </button>
    </label>
  );
}

// ── Feedback ─────────────────────────────────────────────────────────────────
export const Skeleton = ({ className, ...p }: HTMLAttributes<HTMLDivElement>) => <div className={cn('animate-pulse rounded-xl bg-card-muted', className)} aria-hidden {...p} />;

export function EmptyState({ icon, title, description, action, className }: { icon?: ReactNode; title: string; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border px-6 py-10 text-center', className)}>
      {icon && <div className="mb-1 text-muted [&_svg]:h-8 [&_svg]:w-8">{icon}</div>}
      <p className="font-medium">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

const alertTones = {
  info: 'border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-100',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100',
  warning: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100',
  danger: 'border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100',
};
export function Alert({ tone = 'info', title, children, icon, className, action }: { tone?: keyof typeof alertTones; title?: ReactNode; children?: ReactNode; icon?: ReactNode; className?: string; action?: ReactNode }) {
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cn('flex items-start gap-3 rounded-xl border p-3.5 text-sm', alertTones[tone], className)}>
      {icon && <span className="mt-0.5 shrink-0 [&_svg]:h-5 [&_svg]:w-5">{icon}</span>}
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title && 'mt-0.5', 'opacity-90')}>{children}</div>}
      </div>
      {action}
    </div>
  );
}

export function Progress({ value, tone = 'primary', className, label }: { value: number; tone?: 'primary' | 'success' | 'warning' | 'danger'; className?: string; label?: string }) {
  const colors = { primary: 'bg-primary-600', success: 'bg-emerald-600', warning: 'bg-amber-500', danger: 'bg-red-600' };
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className={cn('h-2 w-full overflow-hidden rounded-full bg-card-muted', className)} role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className={cn('h-full rounded-full transition-[width] duration-500', colors[tone])} style={{ width: `${v}%` }} />
    </div>
  );
}

export function StatCard({ label, value, hint, icon, tone = 'neutral', onClick, className }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode; tone?: 'neutral' | 'primary' | 'danger' | 'warning' | 'success'; onClick?: () => void; className?: string }) {
  const tones = { neutral: 'text-muted', primary: 'text-primary-700 dark:text-primary-300', danger: 'text-red-600', warning: 'text-amber-600', success: 'text-emerald-600' };
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp onClick={onClick} className={cn('flex flex-col gap-1 rounded-2xl border border-border bg-card p-4 text-left shadow-[var(--shadow-soft)]', onClick && 'transition-colors hover:border-primary-400', className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-muted">{label}</span>
        {icon && <span className={cn('[&_svg]:h-5 [&_svg]:w-5', tones[tone])}>{icon}</span>}
      </div>
      <span className="tabular text-2xl font-semibold tracking-tight">{value}</span>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </Comp>
  );
}

export function PageHeader({ title, description, actions, className }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn('mb-5 flex flex-wrap items-end justify-between gap-3', className)}>
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
