import { defineConfig } from '@playwright/test'

/**
 * Dedicated config for the REAL Electron integration test. Unlike the browser
 * smoke config, this launches the actual built Electron app (main + preload +
 * IPC + Northstar + SQLite) — so there is no web server and no baseURL.
 * Requires `npm run build` first (the script chains it).
 */
export default defineConfig({
  testDir: './e2e-electron',
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  reporter: [['list']],
})
