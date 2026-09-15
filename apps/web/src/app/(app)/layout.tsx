'use client';

import { Skeleton } from '@sgee/ui';
import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { AppShell } from '@/components/app-shell';
import { useMe } from '@/lib/session';

export default function AuthenticatedLayout({ children }: { children: ReactNode }) {
  const { data: me, isLoading, error } = useMe();
  const router = useRouter();

  useEffect(() => {
    if (error) router.replace(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
    else if (me?.mustChangePassword) router.replace('/cambiar-clave');
  }, [error, me, router]);

  if (isLoading || !me) {
    return (
      <div className="flex min-h-dvh">
        <div className="hidden w-64 border-r border-border bg-card p-4 lg:block">
          <Skeleton className="mb-6 h-10" />
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="mb-2 h-10" />
          ))}
        </div>
        <div className="flex-1 p-6">
          <Skeleton className="mb-6 h-10 w-72" />
          <div className="grid gap-4 md:grid-cols-3">
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
          </div>
        </div>
      </div>
    );
  }
  return <AppShell me={me}>{children}</AppShell>;
}
