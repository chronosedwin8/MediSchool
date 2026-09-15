import type { MetadataRoute } from 'next';
import { absoluteUrl, SITE } from '@/lib/site';

/** Public pages are indexable; the authenticated application and the API are not. */
export const PRIVATE_SECTIONS = ['panel', 'login', 'registro', 'cambiar-clave', 'confirmar-salida', 'enfermeria', 'docente', 'porteria', 'familia', 'estudiantes', 'estudiante', 'mensajes', 'perfil', 'salud-publica', 'estadisticas', 'admin'];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: ['/', '/ayuda'], disallow: ['/api/', ...PRIVATE_SECTIONS.map((s) => `/${s}`)] }],
    sitemap: absoluteUrl('/sitemap.xml'),
    host: SITE.url,
  };
}
