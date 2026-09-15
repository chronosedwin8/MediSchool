'use client';

import { Search } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import type { WikiSearchEntry } from '@/lib/wiki';

const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function WikiSearch({ index }: { index: WikiSearchEntry[] }) {
  const params = useSearchParams();
  const router = useRouter();
  const [q, setQ] = useState(params.get('q') ?? '');
  const results = useMemo(() => {
    const terms = normalize(q).split(/\s+/).filter((t) => t.length > 1);
    if (!terms.length) return [];
    return index
      .map((e) => {
        const title = normalize(e.title);
        const body = normalize([e.description, e.category, ...e.headings, ...e.keywords].join(' '));
        let score = 0;
        for (const t of terms) {
          if (title.includes(t)) score += 5;
          else if (body.includes(t)) score += 1;
          else return null;
        }
        return { e, score };
      })
      .filter((x): x is { e: WikiSearchEntry; score: number } => !!x)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((x) => x.e);
  }, [q, index]);

  return (
    <div className="relative">
      <form
        role="search"
        onSubmit={(ev) => {
          ev.preventDefault();
          if (results[0]) router.push(`/ayuda/${results[0].slug}`);
        }}
      >
        <label htmlFor="wiki-q" className="sr-only">
          Buscar en el centro de ayuda
        </label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" aria-hidden />
          <input
            id="wiki-q"
            type="search"
            value={q}
            onChange={(ev) => setQ(ev.target.value)}
            placeholder="Buscar: medicamento, pase, contraseña, portería…"
            autoComplete="off"
            className="h-14 w-full rounded-2xl border border-border bg-card pl-12 pr-4 text-base shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/25"
          />
        </div>
      </form>
      {q.trim().length > 1 && (
        <div className="mt-2 rounded-2xl border border-border bg-card p-2 shadow-lg" aria-live="polite">
          {results.length === 0 ? (
            <p className="px-3 py-2 text-sm text-muted">No hay resultados para “{q}”. Pruebe con otra palabra.</p>
          ) : (
            <ul>
              {results.map((r) => (
                <li key={r.slug}>
                  <Link href={`/ayuda/${r.slug}`} className="block rounded-xl px-3 py-2.5 hover:bg-card-muted">
                    <span className="block font-medium">{r.title}</span>
                    <span className="block text-xs text-muted">
                      {r.category} · {r.description}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
