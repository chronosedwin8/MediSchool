'use client';

import { type Permission, type Role, ROLE_HOME, primaryRole } from '@sgee/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { api } from './api';
import { disconnectLive } from './live';

export interface Me {
  id: string;
  name: string;
  email: string;
  roles: Role[];
  home: string;
  mustChangePassword: boolean;
  permissions: Permission[];
  mfaEnabled: boolean;
  kiosk: boolean;
  locale: string;
  tenant: { id: string; slug: string; name: string; country: string; timezone: string; locale: string };
  teacherGroups: { id: string; name: string; grade: string; subject: string | null }[];
  children: { id: string; name: string; code: string; group: string | null }[];
  settings: { dataSource: 'PHIDIAS' | 'LOCAL'; passTransitAlertMinutes: number; observationRecheckMinutes: number; medicationTimeWindowMinutes: number };
}

export function useMe() {
  return useQuery({ queryKey: ['me'], queryFn: () => api<Me>('/auth/me'), staleTime: 60_000, retry: false });
}

export function can(me: Me | undefined, ...perms: Permission[]) {
  return !!me && perms.some((p) => me.permissions.includes(p));
}

export function hasRole(me: Me | undefined, ...roles: Role[]) {
  return !!me && roles.some((r) => me.roles.includes(r));
}

export function homeFor(roles: Role[]) {
  return ROLE_HOME[primaryRole(roles)];
}

export function useLogout() {
  const qc = useQueryClient();
  const router = useRouter();
  return async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch {}
    disconnectLive();
    qc.clear();
    router.replace('/login');
  };
}
