'use client';

import { type ReactNode, useEffect, useState } from 'react';

/**
 * Renders its children only in the browser. Used on public forms (login,
 * registration…) where password-manager extensions inject buttons next to the
 * inputs before React hydrates, which otherwise triggers hydration errors.
 */
export function ClientOnly({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return <>{mounted ? children : fallback}</>;
}

export function FormPageFallback() {
  return (
    <main className="grid min-h-dvh place-items-center" aria-busy="true">
      <img src="/icon.svg" alt="MediSchool" className="h-14 w-14 animate-pulse" />
    </main>
  );
}
