import { ArrowLeft, ArrowRight, Clock, Users } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { absoluteUrl, jsonLd, SITE } from '@/lib/site';
import { categoryTitle, getArticle, getArticles, getRelated, getSiblings } from '@/lib/wiki';

export const dynamicParams = false;

export function generateStaticParams() {
  return getArticles().map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const a = getArticle(slug);
  if (!a) return {};
  const url = `/ayuda/${a.slug}`;
  return {
    title: { absolute: `${a.title} | Ayuda de ${SITE.name}` },
    description: a.description,
    keywords: a.keywords,
    alternates: { canonical: url },
    openGraph: { type: 'article', url, title: a.title, description: a.description, siteName: SITE.name, locale: SITE.locale, modifiedTime: a.updated, section: categoryTitle(a.category) },
    twitter: { card: 'summary_large_image', title: a.title, description: a.description },
  };
}

const fmtDate = (d: string) => new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Bogota' }).format(new Date(`${d}T12:00:00-05:00`));

export default async function HelpArticle({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const a = getArticle(slug);
  if (!a) notFound();
  const related = getRelated(a);
  const { prev, next } = getSiblings(a.slug);
  const url = absoluteUrl(`/ayuda/${a.slug}`);
  const data = [
    {
      '@context': 'https://schema.org',
      '@type': 'TechArticle',
      headline: a.title,
      description: a.description,
      inLanguage: SITE.language,
      dateModified: a.updated,
      datePublished: '2026-09-15',
      mainEntityOfPage: url,
      url,
      keywords: a.keywords.join(', '),
      articleSection: categoryTitle(a.category),
      audience: a.roles.length ? { '@type': 'Audience', audienceType: a.roles.join(', ') } : undefined,
      author: { '@type': 'Organization', name: SITE.name, url: absoluteUrl('/') },
      publisher: { '@type': 'Organization', name: SITE.name, logo: { '@type': 'ImageObject', url: absoluteUrl('/icon.svg') } },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Inicio', item: absoluteUrl('/') },
        { '@type': 'ListItem', position: 2, name: 'Centro de ayuda', item: absoluteUrl('/ayuda') },
        { '@type': 'ListItem', position: 3, name: a.title, item: url },
      ],
    },
  ];

  return (
    <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_14rem]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(data) }} />
      <article className="min-w-0">
        <nav aria-label="Ruta de navegación" className="text-sm text-muted">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li>
              <Link href="/" className="hover:text-fg">
                Inicio
              </Link>
            </li>
            <li aria-hidden>/</li>
            <li>
              <Link href="/ayuda" className="hover:text-fg">
                Centro de ayuda
              </Link>
            </li>
            <li aria-hidden>/</li>
            <li className="text-fg" aria-current="page">
              {categoryTitle(a.category)}
            </li>
          </ol>
        </nav>
        <header className="mt-4 border-b border-border pb-6">
          <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{a.title}</h1>
          <p className="mt-3 text-lg text-muted text-pretty">{a.description}</p>
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted">
            <span className="flex items-center gap-1.5">
              <Clock className="h-4 w-4" aria-hidden /> Lectura de {a.readingMinutes} min
            </span>
            {a.roles.length > 0 && (
              <span className="flex items-center gap-1.5">
                <Users className="h-4 w-4" aria-hidden /> Para: {a.roles.join(', ')}
              </span>
            )}
            <span>
              Actualizado el <time dateTime={a.updated}>{fmtDate(a.updated)}</time>
            </span>
          </div>
        </header>

        <div className="wiki-prose mt-8" dangerouslySetInnerHTML={{ __html: a.html }} />

        <nav aria-label="Artículos anterior y siguiente" className="mt-12 grid gap-3 border-t border-border pt-6 sm:grid-cols-2">
          {prev ? (
            <Link href={`/ayuda/${prev.slug}`} className="rounded-2xl border border-border bg-card p-4 hover:border-primary-400">
              <span className="flex items-center gap-1 text-xs text-muted">
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Anterior
              </span>
              <span className="mt-1 block font-medium">{prev.title}</span>
            </Link>
          ) : (
            <span />
          )}
          {next && (
            <Link href={`/ayuda/${next.slug}`} className="rounded-2xl border border-border bg-card p-4 text-right hover:border-primary-400">
              <span className="flex items-center justify-end gap-1 text-xs text-muted">
                Siguiente <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </span>
              <span className="mt-1 block font-medium">{next.title}</span>
            </Link>
          )}
        </nav>

        {related.length > 0 && (
          <section className="mt-10" aria-labelledby="relacionados">
            <h2 id="relacionados" className="text-xl font-semibold">
              Artículos relacionados
            </h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {related.map((r) => (
                <li key={r.slug}>
                  <Link href={`/ayuda/${r.slug}`} className="block h-full rounded-2xl border border-border bg-card p-4 hover:border-primary-400">
                    <span className="block font-medium">{r.title}</span>
                    <span className="mt-1 block text-sm text-muted">{r.description}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </article>

      {a.headings.length > 2 && (
        <aside className="hidden xl:block">
          <nav aria-label="En este artículo" className="sticky top-24 text-sm">
            <p className="font-semibold">En este artículo</p>
            <ul className="mt-3 space-y-1.5 border-l border-border">
              {a.headings.map((h) => (
                <li key={h.id}>
                  <a href={`#${h.id}`} className={`-ml-px block border-l border-transparent py-0.5 text-muted hover:border-primary-500 hover:text-fg ${h.level === 3 ? 'pl-6' : 'pl-3'}`}>
                    {h.text}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </aside>
      )}
    </div>
  );
}
