import type { ReactNode } from 'react';
import { SiteFooter, SiteHeader } from '@/components/marketing/site-chrome';
import { WikiNav } from '@/components/marketing/wiki-nav';
import { getNavigation } from '@/lib/wiki';

export default function HelpLayout({ children }: { children: ReactNode }) {
  const groups = getNavigation();
  return (
    <>
      <SiteHeader />
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-24 lg:h-[calc(100dvh-7rem)] lg:overflow-y-auto lg:pr-2">
          <details className="rounded-2xl border border-border bg-card p-3 lg:hidden">
            <summary className="cursor-pointer font-medium">Índice de la guía</summary>
            <div className="mt-3">
              <WikiNav groups={groups} />
            </div>
          </details>
          <div className="hidden lg:block">
            <WikiNav groups={groups} />
          </div>
        </aside>
        <main id="contenido" className="min-w-0">
          {children}
        </main>
      </div>
      <SiteFooter />
    </>
  );
}
