/** Public site configuration (server-side: reads non-public environment variables). */
export const SITE = {
  name: 'MediSchool',
  title: 'MediSchool: software de enfermería escolar para colegios',
  description:
    'Enfermería escolar en un solo lugar: historia clínica, pases del aula a portería, medicación segura, portal para familias y estadísticas. Integrado con Phidias.',
  url: (process.env.PUBLIC_SITE_URL ?? process.env.PUBLIC_WEB_URL ?? 'http://localhost:3100').replace(/\/$/, ''),
  locale: 'es_CO',
  language: 'es-CO',
  contactEmail: process.env.NEXT_PUBLIC_CONTACT_EMAIL || null,
  keywords: [
    'software de enfermería escolar',
    'historia clínica escolar',
    'enfermería para colegios',
    'gestión de enfermería',
    'pases a enfermería',
    'administración de medicamentos en colegios',
    'portal de padres salud',
    'salud escolar Colombia',
    'Ley 1581 datos de salud',
    'integración Phidias',
  ],
} as const;

export const absoluteUrl = (path = '/') => `${SITE.url}${path.startsWith('/') ? path : `/${path}`}`;

/** Serializes JSON-LD safely for a <script type="application/ld+json"> tag. */
export const jsonLd = (data: unknown) => JSON.stringify(data).replace(/</g, '\\u003c');
