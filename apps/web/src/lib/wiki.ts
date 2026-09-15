import fs from 'node:fs';
import path from 'node:path';
import { Marked, type Tokens } from 'marked';

/**
 * Help center ("wiki") content: Markdown files in apps/web/content/ayuda with a
 * small front matter block. Rendered on the server at build time (static pages).
 */
export const WIKI_CATEGORIES = [
  { key: 'primeros-pasos', title: 'Primeros pasos', description: 'Acceso, instalación en el celular, notificaciones, navegación y conceptos básicos.' },
  { key: 'roles', title: 'Guías por rol', description: 'Qué puede hacer cada persona en MediSchool y cómo hacerlo en su día a día.' },
  { key: 'modulos', title: 'Módulos paso a paso', description: 'Instrucciones detalladas de cada funcionalidad, con capturas y buenas prácticas.' },
  { key: 'administracion', title: 'Administración, seguridad y cumplimiento', description: 'Configuración del colegio, usuarios, integraciones, privacidad, auditoría y respaldos.' },
] as const;
export type WikiCategory = (typeof WIKI_CATEGORIES)[number]['key'];

export interface WikiHeading {
  id: string;
  text: string;
  level: 2 | 3;
}

export interface WikiMeta {
  slug: string;
  title: string;
  description: string;
  category: WikiCategory;
  roles: string[];
  keywords: string[];
  order: number;
  updated: string;
}

export interface WikiArticle extends WikiMeta {
  html: string;
  headings: WikiHeading[];
  readingMinutes: number;
}

export interface WikiSearchEntry {
  slug: string;
  title: string;
  description: string;
  category: string;
  headings: string[];
  keywords: string[];
}

const CONTENT_DIR = path.join(process.cwd(), 'content', 'ayuda');
const cacheEnabled = process.env.NODE_ENV === 'production';
let cache: WikiArticle[] | null = null;

export function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function parseFile(file: string): { meta: WikiMeta; body: string } {
  const raw = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new Error(`El artículo ${path.basename(file)} no tiene encabezado (front matter).`);
  const data: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const i = line.indexOf(':');
    if (i > 0) data[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^"(.*)"$/, '$1');
  }
  const category = data.category as WikiCategory;
  if (!WIKI_CATEGORIES.some((c) => c.key === category)) throw new Error(`Categoría inválida en ${path.basename(file)}: ${data.category}`);
  const list = (v?: string) => (v ? v.split(',').map((x) => x.trim()).filter(Boolean) : []);
  return {
    meta: {
      slug: path.basename(file, '.md'),
      title: data.title,
      description: data.description,
      category,
      roles: list(data.roles),
      keywords: list(data.keywords),
      order: Number(data.order ?? 100),
      updated: data.updated ?? '2026-09-15',
    },
    body: match[2],
  };
}

function render(body: string) {
  const headings: WikiHeading[] = [];
  const used = new Map<string, number>();
  const marked = new Marked({ gfm: true });
  marked.use({
    renderer: {
      heading(this: { parser: { parseInline: (t: Tokens.Generic[]) => string } }, token: Tokens.Heading) {
        const inner = this.parser.parseInline(token.tokens);
        const plain = token.text.replace(/[*_`]/g, '');
        const base = slugify(plain) || 'seccion';
        const n = used.get(base) ?? 0;
        used.set(base, n + 1);
        const id = n ? `${base}-${n}` : base;
        const level = Math.min(Math.max(token.depth, 2), 4);
        if (level === 2 || level === 3) headings.push({ id, text: plain, level });
        return `<h${level} id="${id}"><a class="anchor" href="#${id}" aria-hidden="true" tabindex="-1">#</a>${inner}</h${level}>\n`;
      },
      image(token: Tokens.Image) {
        const mobile = /-movil\.(jpe?g|png|webp)$/i.test(token.href);
        const [w, h] = mobile ? [412, 915] : [1280, 800];
        const caption = token.title ? `<figcaption>${escapeHtml(token.title)}</figcaption>` : '';
        return `<figure class="${mobile ? 'shot shot-mobile' : 'shot'}"><img src="${escapeHtml(token.href)}" alt="${escapeHtml(token.text)}" width="${w}" height="${h}" loading="lazy" decoding="async" />${caption}</figure>`;
      },
      blockquote(this: { parser: { parse: (t: Tokens.Generic[]) => string } }, token: Tokens.Blockquote) {
        const inner = this.parser.parse(token.tokens);
        const kind = /^<p><strong>(Importante|Atención|Advertencia|Nunca)/.test(inner) ? 'warning' : /^<p><strong>(Consejo|Sugerencia|Truco)/.test(inner) ? 'tip' : 'note';
        return `<aside class="callout callout-${kind}">${inner}</aside>\n`;
      },
      link(this: { parser: { parseInline: (t: Tokens.Generic[]) => string } }, token: Tokens.Link) {
        const inner = this.parser.parseInline(token.tokens);
        const external = /^https?:\/\//.test(token.href);
        const title = token.title ? ` title="${escapeHtml(token.title)}"` : '';
        return `<a href="${escapeHtml(token.href)}"${title}${external ? ' rel="noopener noreferrer" target="_blank"' : ''}>${inner}</a>`;
      },
    },
  });
  const html = (marked.parse(body, { async: false }) as string).replace(/<table>/g, '<div class="table-wrap"><table>').replace(/<\/table>/g, '</table></div>');
  return { html, headings };
}

export function getArticles(): WikiArticle[] {
  if (cacheEnabled && cache) return cache;
  const categoryOrder = new Map(WIKI_CATEGORIES.map((c, i) => [c.key, i]));
  const articles = fs
    .readdirSync(CONTENT_DIR)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const { meta, body } = parseFile(path.join(CONTENT_DIR, f));
      const { html, headings } = render(body);
      const words = body.split(/\s+/).filter(Boolean).length;
      return { ...meta, html, headings, readingMinutes: Math.max(1, Math.round(words / 200)) };
    })
    .sort((a, b) => (categoryOrder.get(a.category)! - categoryOrder.get(b.category)!) || a.order - b.order || a.title.localeCompare(b.title, 'es'));
  if (cacheEnabled) cache = articles;
  return articles;
}

export function getArticle(slug: string) {
  return getArticles().find((a) => a.slug === slug) ?? null;
}

export function getNavigation() {
  const articles = getArticles();
  return WIKI_CATEGORIES.map((c) => ({ ...c, articles: articles.filter((a) => a.category === c.key).map((a) => ({ slug: a.slug, title: a.title })) }));
}

export function getSearchIndex(): WikiSearchEntry[] {
  const titles = new Map<string, string>(WIKI_CATEGORIES.map((c) => [c.key, c.title]));
  return getArticles().map((a) => ({ slug: a.slug, title: a.title, description: a.description, category: titles.get(a.category) ?? a.category, headings: a.headings.map((h) => h.text), keywords: a.keywords }));
}

export function getRelated(article: WikiArticle, limit = 4) {
  return getArticles()
    .filter((a) => a.slug !== article.slug)
    .map((a) => ({ a, score: (a.category === article.category ? 2 : 0) + a.roles.filter((r) => article.roles.includes(r)).length }))
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score || x.a.order - y.a.order)
    .slice(0, limit)
    .map((x) => x.a);
}

export function getSiblings(slug: string) {
  const all = getArticles();
  const i = all.findIndex((a) => a.slug === slug);
  return { prev: i > 0 ? all[i - 1] : null, next: i >= 0 && i < all.length - 1 ? all[i + 1] : null };
}

export const categoryTitle = (key: string) => WIKI_CATEGORIES.find((c) => c.key === key)?.title ?? key;
