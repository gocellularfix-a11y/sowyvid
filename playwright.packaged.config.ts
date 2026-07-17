import { defineConfig } from '@playwright/test'

/**
 * Packaged-Windows validation suite. Launches the REAL packaged executable
 * (`release/win-unpacked/SowyVid.exe`) — never Electron from node_modules —
 * with an isolated user-data directory, and produces/validates a real MP4.
 * Requires `npm run package:win` first (the npm script chains it).
 */
export default defineConfig({
  testDir: './e2e-packaged',
  timeout: 900_000,
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  reporter: [['list']],
})
