import { Menu } from 'lucide-react';
import Link from 'next/link';
import { SITE } from '@/lib/site';
import { SessionLink } from './session-link';

const NAV = [
  { href: '/#funcionalidades', label: 'Funcionalidades' },
  { href: '/#como-funciona', label: 'Cómo funciona' },
  { href: '/#roles', label: 'Roles' },
  { href: '/#seguridad', label: 'Seguridad' },
  { href: '/#preguntas', label: 'Preguntas' },
  { href: '/ayuda', label: 'Centro de ayuda' },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-bg/85 backdrop-blur supports-[backdrop-filter]:bg-bg/70">
      <a href="#contenido" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:rounded-lg focus:bg-card focus:px-3 focus:py-2">
        Saltar al contenido
      </a>
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5 font-semibold" aria-label="MediSchool, inicio">
          <img src="/icon.svg" alt="" width={32} height={32} className="h-8 w-8" />
          <span className="text-lg tracking-tight">{SITE.name}</span>
        </Link>
        <nav aria-label="Principal" className="ml-6 hidden items-center gap-1 lg:flex">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="rounded-lg px-3 py-2 text-sm text-muted hover:bg-card-muted hover:text-fg">
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <SessionLink className="inline-flex h-10 items-center rounded-xl bg-primary-700 px-4 text-sm font-medium text-white shadow-sm hover:bg-primary-800 dark:bg-primary-500 dark:text-[#06201e] dark:hover:bg-primary-400" />
          <details className="relative lg:hidden">
            <summary className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-xl border border-border [&::-webkit-details-marker]:hidden" aria-label="Abrir menú">
              <Menu className="h-5 w-5" aria-hidden />
            </summary>
            <nav aria-label="Menú móvil" className="absolute right-0 mt-2 flex w-56 flex-col rounded-2xl border border-border bg-card p-2 shadow-lg">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="rounded-lg px-3 py-2.5 text-sm hover:bg-card-muted">
                  {n.label}
                </Link>
              ))}
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}

const FOOTER_LINKS = [
  {
    title: 'Producto',
    links: [
      { href: '/#funcionalidades', label: 'Funcionalidades' },
      { href: '/#roles', label: 'Roles y portales' },
      { href: '/#seguridad', label: 'Seguridad y cumplimiento' },
      { href: '/#integraciones', label: 'Integraciones' },
    ],
  },
  {
    title: 'Guías por rol',
    links: [
      { href: '/ayuda/rol-enfermeria', label: 'Enfermería' },
      { href: '/ayuda/rol-docente', label: 'Docentes' },
      { href: '/ayuda/rol-padres-y-acudientes', label: 'Padres y acudientes' },
      { href: '/ayuda/rol-administrador', label: 'Administradores' },
    ],
  },
  {
    title: 'Centro de ayuda',
    links: [
      { href: '/ayuda/introduccion', label: 'Introducción' },
      { href: '/ayuda/acceso-y-seguridad-de-la-cuenta', label: 'Acceso a la cuenta' },
      { href: '/ayuda/preguntas-frecuentes', label: 'Preguntas frecuentes' },
      { href: '/ayuda/consentimientos-y-privacidad', label: 'Privacidad de los datos' },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-card">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <Link href="/" className="flex items-center gap-2.5 font-semibold">
            <img src="/icon.svg" alt="" width={28} height={28} className="h-7 w-7" />
            <span>{SITE.name}</span>
          </Link>
          <p className="mt-3 max-w-xs text-sm text-muted">Sistema de Gestión de Enfermería Escolar: trazabilidad del aula a la portería, historia clínica segura y comunicación con las familias.</p>
        </div>
        {FOOTER_LINKS.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <p className="text-sm font-semibold">{col.title}</p>
            <ul className="mt-3 space-y-2">
              {col.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-sm text-muted hover:text-fg">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-border">
        <p className="mx-auto max-w-6xl px-4 py-5 text-xs text-muted sm:px-6">© 2026 {SITE.name}. Datos de salud tratados conforme a la Ley 1581 de 2012 y la Resolución 1995 de 1999.</p>
      </div>
    </footer>
  );
}
