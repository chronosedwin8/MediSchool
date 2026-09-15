import { expect, test } from '@playwright/test';

test.describe('Sitio público y centro de ayuda (SEO)', () => {
  test('la página de inicio es indexable y describe el producto', async ({ page, request }) => {
    const res = await page.goto('/');
    expect(res?.status()).toBe(200);
    await expect(page).toHaveTitle(/software de enfermería escolar/i);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /historia clínica/);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/$|3100$/);
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', /MediSchool/);
    const ld = await page.locator('script[type="application/ld+json"]').first().textContent();
    const types = (JSON.parse(ld ?? '[]') as { '@type': string }[]).map((x) => x['@type']);
    expect(types).toEqual(expect.arrayContaining(['SoftwareApplication', 'Organization', 'WebSite', 'FAQPage']));
    await expect(page.getByRole('heading', { name: 'Todo lo que la enfermería de un colegio necesita' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Iniciar sesión' }).first()).toBeVisible();

    const robots = await (await request.get('/robots.txt')).text();
    expect(robots).toContain('Disallow: /enfermeria');
    expect(robots).toContain('Sitemap:');
    const sitemap = await (await request.get('/sitemap.xml')).text();
    expect(sitemap).toContain('/ayuda/rol-enfermeria');
    expect((await request.get('/opengraph-image')).headers()['content-type']).toContain('image/png');
    expect((await request.get('/enfermeria')).headers()['x-robots-tag']).toContain('noindex');
  });

  test('el centro de ayuda permite buscar y leer una guía por rol', async ({ page }) => {
    await page.goto('/ayuda');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('¿Cómo podemos ayudarle con MediSchool?');
    await page.getByLabel('Buscar en el centro de ayuda').fill('portería documento');
    await page.getByRole('link', { name: /Guía para portería/ }).first().click();
    await expect(page).toHaveURL(/\/ayuda\/rol-porteria$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Guía para portería');
    await expect(page.getByRole('navigation', { name: 'Ruta de navegación' })).toContainText('Centro de ayuda');
    await expect(page.locator('.wiki-prose img').first()).toHaveAttribute('alt', /.+/);
    const ld = await page.locator('script[type="application/ld+json"]').first().textContent();
    expect(ld).toContain('TechArticle');
    await expect(page.getByRole('heading', { name: 'Artículos relacionados' })).toBeVisible();
  });

  test('todos los artículos del sitemap cargan sin enlaces internos rotos', async ({ request }) => {
    const sitemap = await (await request.get('/sitemap.xml')).text();
    const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
    expect(urls.length).toBeGreaterThan(30);
    const internal = new Set<string>();
    for (const u of urls) {
      const res = await request.get(u);
      expect(res.status(), u).toBe(200);
      const html = await res.text();
      for (const m of html.matchAll(/href="(\/(?:ayuda[^"#]*|))(?:#[^"]*)?"/g)) internal.add(m[1] || '/');
      for (const m of html.matchAll(/src="(\/ayuda\/capturas\/[^"]+)"/g)) internal.add(m[1]);
    }
    for (const link of internal) expect((await request.get(link)).status(), link).toBe(200);
  });
});
