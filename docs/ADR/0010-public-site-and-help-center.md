# ADR-0010 — Sitio público con SEO y centro de ayuda en Markdown

**Contexto.** Los colegios interesados deben conocer el producto sin iniciar sesión, y cada rol necesita documentación detallada y actualizable. La raíz `/` redirigía al panel del usuario.

**Decisión.**
1. `/` es una **página pública renderizada en el servidor** (sin llamadas a la API en el HTML): una sola `h1`, metadatos por página, canonical, Open Graph y Twitter con imagen generada (`opengraph-image.tsx`), y JSON-LD (`SoftwareApplication`, `Organization`, `WebSite` con `SearchAction`, `FAQPage` con el mismo contenido visible). Un componente cliente mínimo cambia *Iniciar sesión* por *Ir a mi panel* si hay sesión.
2. El antiguo redireccionamiento por rol vive en `/panel`, que es el `start_url` de la PWA.
3. **Centro de ayuda** en `/ayuda`: artículos Markdown con encabezado (título, descripción, categoría, roles, palabras clave, orden, fecha) en `apps/web/content/ayuda`, renderizados con `marked` en el servidor y generados estáticamente (`generateStaticParams`, `dynamicParams = false`). Incluye tabla de contenidos, migas de pan, artículos relacionados, anterior/siguiente, búsqueda cliente sin tildes y JSON-LD `TechArticle` + `BreadcrumbList`.
4. `sitemap.ts` incluye la portada, la ayuda y cada artículo con su fecha; `robots.ts` y el encabezado `X-Robots-Tag: noindex, nofollow` excluyen la aplicación autenticada y la API.
5. Las **capturas** se generan con Playwright (`scripts/capture-screenshots.mjs`) solo sobre el colegio sintético y bloqueando las fotos, para no publicar datos reales de menores. Las imágenes llevan dimensiones fijas (sin saltos de diseño) y carga diferida.

**Alternativas descartadas.** MDX (más dependencias y compilación), un CMS externo (datos fuera de la instalación) y documentación en PDF (no indexable ni enlazable).

**Consecuencias.** Editar la ayuda es modificar un archivo Markdown y volver a construir la web. La prueba `e2e/public-site.spec.ts` verifica metadatos, búsqueda, que todos los artículos del sitemap respondan y que no haya enlaces internos rotos.
