import { defineConfig, devices } from '@playwright/test';

/**
 * E2E against the running stack (npm run dev): web :3100, API :4000, demo seed.
 * Uses the locally installed Google Chrome (no browser download).
 */
export default defineConfig({
  testDir: '.',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: '../playwright-report' }]],
  outputDir: '../test-results',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3100',
    channel: process.env.E2E_CHANNEL ?? 'chrome',
    locale: 'es-CO',
    timezoneId: 'America/Bogota',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    permissions: ['camera'],
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], channel: process.env.E2E_CHANNEL ?? 'chrome', viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'], channel: process.env.E2E_CHANNEL ?? 'chrome' }, grep: /@mobile/ },
  ],
});
