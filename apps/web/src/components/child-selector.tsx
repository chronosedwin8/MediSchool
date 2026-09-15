'use client';

import { cn, StudentAvatar } from '@sgee/ui';
import { useEffect } from 'react';
import { useMe } from '@/lib/session';

export function useChildren() {
  const { data } = useMe();
  return data?.children ?? [];
}

export function ChildSelector({ value, onChange }: { value: string | null; onChange: (id: string) => void }) {
  const children = useChildren();
  useEffect(() => {
    if (!value && children.length) onChange(children[0].id);
  }, [children, value, onChange]);
  if (children.length <= 1) return null;
  return (
    <div className="mb-4 flex gap-2 overflow-x-auto" role="tablist" aria-label="Estudiante">
      {children.map((c) => (
        <button key={c.id} role="tab" aria-selected={value === c.id} onClick={() => onChange(c.id)} className={cn('flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-3 text-sm', value === c.id ? 'border-primary-700 bg-primary-700 text-white' : 'border-border bg-card')}>
          <StudentAvatar name={c.name} size={28} src={`/api/v1/students/${c.id}/photo`} />
          {c.name.split(' ')[0]}
        </button>
      ))}
    </div>
  );
}
