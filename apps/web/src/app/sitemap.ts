import type { MetadataRoute } from 'next';
import { getArticles } from '@/lib/wiki';
import { absoluteUrl } from '@/lib/site';

export default function sitemap(): MetadataRoute.Sitemap {
  const articles = getArticles();
  const latest = articles.reduce((max, a) => (a.updated > max ? a.updated : max), '2026-09-15');
  return [
    { url: absoluteUrl('/'), lastModified: new Date(latest), changeFrequency: 'weekly', priority: 1 },
    { url: absoluteUrl('/ayuda'), lastModified: new Date(latest), changeFrequency: 'weekly', priority: 0.9 },
    ...articles.map((a) => ({ url: absoluteUrl(`/ayuda/${a.slug}`), lastModified: new Date(a.updated), changeFrequency: 'monthly' as const, priority: a.category === 'roles' ? 0.8 : 0.7 })),
  ];
}
