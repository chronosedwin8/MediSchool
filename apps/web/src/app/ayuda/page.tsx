import { BookOpen, ChevronRight } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { WikiSearch } from '@/components/marketing/wiki-search';
import { absoluteUrl, jsonLd, SITE } from '@/lib/site';
import { getArticles, getSearchIndex, WIKI_CATEGORIES } from '@/lib/wiki';

const TITLE = 'Centro de ayuda: guías de MediSchool por rol y módulo';
const DESCRIPTION = 'Guías paso a paso de MediSchool para enfermería, docentes, portería, padres, directivos y administradores: pases, atenciones, medicación, salidas, estadísticas y más.';

export const metadata: Metadata = {
  title: { absolute: `${TITLE} | ${SITE.name}` },
  description: DESCRIPTION,
  alternates: { canonical: '/ayuda' },
  openGraph: { type: 'website', url: '/ayuda', title: TITLE, description: DESCRIPTION, siteName: SITE.name, locale: SITE.locale },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION },
};

const ROLE_ORDER = ['rol-enfermeria', 'rol-docente', 'rol-padres-y-acudientes', 'rol-porteria', 'rol-medico', 'rol-coordinacion-enfermeria', 'rol-psicologia', 'rol-directivos', 'rol-administrador', 'rol-estudiante', 'rol-superadministrador'];

export default function HelpHome() {
  const articles = getArticles();
  const roles = ROLE_ORDER.map((slug) => articles.find((a) => a.slug === slug)).filter((a): a is (typeof articles)[number] => !!a);
  const data = [
    { '@context': 'https://schema.org', '@type': 'CollectionPage', name: TITLE, description: DESCRIPTION, url: absoluteUrl('/ayuda'), inLanguage: SITE.language, hasPart: articles.map((a) => ({ '@type': 'TechArticle', headline: a.title, url: absoluteUrl(`/ayuda/${a.slug}`) })) },
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Inicio', item: absoluteUrl('/') }, { '@type': 'ListItem', position: 2, name: 'Centro de ayuda', item: absoluteUrl('/ayuda') }] },
  ];

  return (
    <div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(data) }} />
      <section className="rounded-3xl border border-border bg-gradient-to-br from-primary-50 to-card p-6 sm:p-10 dark:from-primary-950 dark:to-card">
        <p className="flex items-center gap-2 text-sm font-medium text-primary-700 dark:text-primary-300">
          <BookOpen className="h-4 w-4" aria-hidden /> Centro de ayuda
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">¿Cómo podemos ayudarle con MediSchool?</h1>
        <p className="mt-3 max-w-2xl text-muted">Guías detalladas de todo lo que hace el sistema, explicadas desde cada rol, con pasos numerados, capturas de pantalla y buenas prácticas.</p>
        <div className="mt-6 max-w-2xl">
          <Suspense fallback={<div className="h-14 rounded-2xl border border-border bg-card" />}>
            <WikiSearch index={getSearchIndex()} />
          </Suspense>
        </div>
      </section>

      <section className="mt-12" aria-labelledby="por-rol">
        <h2 id="por-rol" className="text-2xl font-semibold tracking-tight">Empiece por su rol</h2>
        <p className="mt-1 text-muted">Cada guía explica qué puede hacer y cuáles son las tareas de su día a día.</p>
        <ul className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {roles.map((a) => (
            <li key={a.slug}>
              <Link href={`/ayuda/${a.slug}`} className="flex h-full items-start gap-3 rounded-2xl border border-border bg-card p-5 hover:border-primary-400">
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{a.title}</span>
                  <span className="mt-1 block text-sm text-muted">{a.description}</span>
                </span>
                <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {WIKI_CATEGORIES.filter((c) => c.key !== 'roles').map((c) => (
        <section key={c.key} className="mt-12" aria-labelledby={`cat-${c.key}`}>
          <h2 id={`cat-${c.key}`} className="text-2xl font-semibold tracking-tight">
            {c.title}
          </h2>
          <p className="mt-1 text-muted">{c.description}</p>
          <ul className="mt-5 grid gap-3 md:grid-cols-2">
            {articles
              .filter((a) => a.category === c.key)
              .map((a) => (
                <li key={a.slug}>
                  <Link href={`/ayuda/${a.slug}`} className="block h-full rounded-2xl border border-border bg-card p-5 hover:border-primary-400">
                    <span className="block font-semibold">{a.title}</span>
                    <span className="mt-1 block text-sm text-muted">{a.description}</span>
                    <span className="mt-3 block text-xs text-muted">Lectura de {a.readingMinutes} min</span>
                  </Link>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
