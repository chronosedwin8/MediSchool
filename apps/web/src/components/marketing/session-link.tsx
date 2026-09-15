'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

/** "Iniciar sesión" by default (server HTML); switches to "Ir a mi panel" when a session exists. */
export function SessionLink({ className }: { className?: string }) {
  const [home, setHome] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetch('/api/v1/auth/me', { credentials: 'include', headers: { Accept: 'application/json' } })
      .then((r) => (r.ok ? r.json() : null))
      .then((me: { home?: string; mustChangePassword?: boolean } | null) => {
        if (alive && me?.home) setHome(me.mustChangePassword ? '/cambiar-clave' : me.home);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  return (
    <Link href={home ?? '/login'} className={className} prefetch={false}>
      {home ? 'Ir a mi panel' : 'Iniciar sesión'}
    </Link>
  );
}
