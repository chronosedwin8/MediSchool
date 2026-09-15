'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useMe } from '@/lib/session';

/** Entry point of the installed app (PWA start_url): sends each user to their role home. */
export default function Panel() {
  const { data, error } = useMe();
  const router = useRouter();
  useEffect(() => {
    if (data) router.replace(data.mustChangePassword ? '/cambiar-clave' : data.home);
    if (error) router.replace('/login');
  }, [data, error, router]);
  return (
    <div className="grid min-h-dvh place-items-center">
      <img src="/icon.svg" alt="MediSchool" className="h-14 w-14 animate-pulse" />
    </div>
  );
}
