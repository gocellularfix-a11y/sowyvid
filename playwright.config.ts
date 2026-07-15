import { defineConfig } from '@playwright/test'

/**
 * SowyVid Playwright config.
 *
 * The renderer is a standard web app served by Vite, so the smoke test drives
 * the renderer UI in a normal browser context against the Vite dev server.
 * Full Electron end-to-end (main + preload) is driven separately via
 * Playwright's _electron API in e2e/electron.spec.ts once packaged.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:5273',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    command: 'npm run dev:renderer-only',
    url: 'http://localhost:5273',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
