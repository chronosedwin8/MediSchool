'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export interface WikiNavGroup {
  key: string;
  title: string;
  articles: { slug: string; title: string }[];
}

export function WikiNav({ groups }: { groups: WikiNavGroup[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Índice del centro de ayuda" className="text-sm">
      <Link href="/ayuda" aria-current={pathname === '/ayuda' ? 'page' : undefined} className="mb-4 block rounded-lg px-2 py-1.5 font-semibold hover:bg-card-muted aria-[current=page]:text-primary-700 dark:aria-[current=page]:text-primary-300">
        Inicio de la ayuda
      </Link>
      {groups.map((g) => (
        <div key={g.key} className="mb-5">
          <p className="px-2 text-xs font-semibold uppercase tracking-wider text-muted">{g.title}</p>
          <ul className="mt-1.5 space-y-0.5">
            {g.articles.map((a) => {
              const href = `/ayuda/${a.slug}`;
              const active = pathname === href;
              return (
                <li key={a.slug}>
                  <Link href={href} aria-current={active ? 'page' : undefined} className="block rounded-lg px-2 py-1.5 text-muted hover:bg-card-muted hover:text-fg aria-[current=page]:bg-primary-50 aria-[current=page]:font-medium aria-[current=page]:text-primary-800 dark:aria-[current=page]:bg-primary-950 dark:aria-[current=page]:text-primary-200">
                    {a.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
