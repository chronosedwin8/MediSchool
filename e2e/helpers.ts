import { type Browser, expect, type Page } from '@playwright/test';

export const PASSWORD = process.env.SEED_PASSWORD ?? 'MediSchool2026!';

export async function login(browser: Browser, email: string, options: { viewport?: { width: number; height: number } } = {}) {
  const context = await browser.newContext({ locale: 'es-CO', timezoneId: 'America/Bogota', viewport: options.viewport ?? { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 });
  return page;
}

/** Calls the API with the page session (cookies) — used for test setup only. */
export async function apiCall<T>(page: Page, method: 'GET' | 'POST', path: string, body?: unknown, idem = false): Promise<T> {
  const res = await page.request.fetch(`/api/v1${path}`, {
    method,
    data: body,
    headers: { 'X-Requested-With': 'sgee', ...(idem ? { 'Idempotency-Key': `e2e-${Date.now()}-${Math.random().toString(36).slice(2)}` } : {}) },
  });
  expect(res.ok(), `${method} ${path} → ${res.status()} ${await res.text()}`).toBeTruthy();
  return (await res.json()) as T;
}

export function fieldByLabel(page: Page, label: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const text = page.locator('label').filter({ hasText: new RegExp(`^\\s*${escaped}\\s*\\*?\\s*$`) });
  return page.locator('div.flex.flex-col.gap-1\\.5', { has: text }).locator('input, textarea, select').first();
}
