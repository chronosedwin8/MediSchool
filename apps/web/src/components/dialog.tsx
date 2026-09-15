'use client';

import * as D from '@radix-ui/react-dialog';
import * as P from '@radix-ui/react-popover';
import * as T from '@radix-ui/react-tabs';
import { cn } from '@sgee/ui';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = 'md',
  tone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  tone?: 'danger';
}) {
  const widths = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl', full: 'max-w-[min(1400px,96vw)]' };
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in" />
        <D.Content
          className={cn(
            'fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[92dvh] w-full flex-col rounded-t-2xl border border-border bg-card shadow-2xl outline-none sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl',
            widths[size],
            tone === 'danger' && 'border-red-400',
          )}
        >
          <div className={cn('flex items-start justify-between gap-4 border-b border-border px-5 py-4', tone === 'danger' && 'bg-red-600 text-white sm:rounded-t-2xl')}>
            <div className="min-w-0">
              <D.Title className="text-lg font-semibold tracking-tight">{title}</D.Title>
              {description ? <D.Description className={cn('mt-0.5 text-sm', tone === 'danger' ? 'text-white/90' : 'text-muted')}>{description}</D.Description> : <D.Description className="sr-only">{typeof title === 'string' ? title : 'Diálogo'}</D.Description>}
            </div>
            <D.Close className="rounded-lg p-1.5 hover:bg-black/10" aria-label="Cerrar">
              <X className="h-5 w-5" />
            </D.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-3">{footer}</div>}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

export function Popover({ trigger, children, align = 'end', className }: { trigger: ReactNode; children: ReactNode; align?: 'start' | 'center' | 'end'; className?: string }) {
  return (
    <P.Root>
      <P.Trigger asChild>{trigger}</P.Trigger>
      <P.Portal>
        <P.Content align={align} sideOffset={8} className={cn('z-50 w-80 rounded-2xl border border-border bg-card p-2 shadow-xl outline-none', className)}>
          {children}
        </P.Content>
      </P.Portal>
    </P.Root>
  );
}

export function Tabs({ value, onValueChange, tabs, children, className }: { value: string; onValueChange: (v: string) => void; tabs: { value: string; label: ReactNode; hidden?: boolean }[]; children: ReactNode; className?: string }) {
  return (
    <T.Root value={value} onValueChange={onValueChange} className={className}>
      <T.List className="mb-4 flex gap-1 overflow-x-auto rounded-xl bg-card-muted p-1" aria-label="Secciones">
        {tabs
          .filter((t) => !t.hidden)
          .map((t) => (
            <T.Trigger key={t.value} value={t.value} className="min-h-10 whitespace-nowrap rounded-lg px-3 text-sm font-medium text-muted transition-colors data-[state=active]:bg-card data-[state=active]:text-fg data-[state=active]:shadow-sm">
              {t.label}
            </T.Trigger>
          ))}
      </T.List>
      {children}
    </T.Root>
  );
}

export const TabPanel = ({ value, children }: { value: string; children: ReactNode }) => (
  <T.Content value={value} className="outline-none">
    {children}
  </T.Content>
);
