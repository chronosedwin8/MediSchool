'use client';

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { toast, Toaster } from 'sonner';
import { ApiError, errorMessage } from '@/lib/api';
import { I18nProvider } from '@/lib/i18n';
import { offlineQueue } from '@/lib/offline-queue';

type Theme = 'light' | 'dark';
const ThemeCtx = createContext<{ theme: Theme; toggle: () => void }>({ theme: 'light', toggle: () => {} });
export const useTheme = () => useContext(ThemeCtx);

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 15_000, refetchOnWindowFocus: true, retry: (n, e) => !(e instanceof ApiError && e.status >= 400 && e.status < 500) && n < 2 },
        },
        queryCache: new QueryCache({
          onError: (e) => {
            if (e instanceof ApiError && [401, 403, 404].includes(e.status)) return;
            toast.error(errorMessage(e));
          },
        }),
        mutationCache: new MutationCache({
          onError: (e, _v, _c, m) => {
            if (m.meta?.silent) return;
            toast.error(errorMessage(e), { description: e instanceof ApiError && e.body?.referenceId ? `Ref. ${String(e.body.referenceId).slice(0, 8)}` : undefined });
          },
        }),
      }),
  );
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    const saved = (localStorage.getItem('sgee:theme') as Theme | null) ?? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    setTheme(saved);
    document.documentElement.classList.toggle('dark', saved === 'dark');
  }, []);

  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    const flush = () =>
      offlineQueue.flush().then((r) => {
        if (r.sent) {
          toast.success(`${r.sent} acción(es) sin conexión enviada(s)`);
          client.invalidateQueries();
        }
      });
    const rejected = (e: Event) => toast.error(`No se pudo enviar "${(e as CustomEvent).detail.label}": ${(e as CustomEvent).detail.message}`);
    window.addEventListener('online', flush);
    window.addEventListener('sgee:queue-rejected', rejected);
    const t = setInterval(flush, 30_000);
    flush();
    return () => {
      window.removeEventListener('online', flush);
      window.removeEventListener('sgee:queue-rejected', rejected);
      clearInterval(t);
    };
  }, [client]);

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('sgee:theme', next);
    document.documentElement.classList.toggle('dark', next === 'dark');
  };

  return (
    <QueryClientProvider client={client}>
      <ThemeCtx.Provider value={{ theme, toggle }}>
        <I18nProvider>
          {children}
          <Toaster richColors position="top-right" closeButton theme={theme} />
        </I18nProvider>
      </ThemeCtx.Provider>
    </QueryClientProvider>
  );
}
