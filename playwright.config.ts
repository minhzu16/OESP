import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests against a running stack (API + worker + web) seeded with `pnpm db:seed`.
 * Locally: `pnpm dev` in another terminal, then `pnpm test:e2e`.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
