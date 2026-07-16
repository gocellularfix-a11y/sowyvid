import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { engineAliases, sourceAliases } from './src/build/aliases'

/**
 * Standalone renderer config used for the Playwright smoke test and for
 * previewing the UI shell in a plain browser without booting Electron.
 * The full app runs through electron.vite.config.ts.
 */
export default defineConfig({
  root: 'src/app',
  resolve: {
    alias: {
      '@build': resolve('src/build'),
      ...sourceAliases(),
      ...engineAliases(),
    },
  },
  plugins: [react()],
  define: {
    // Mark browser-preview mode so the renderer can stub the Electron bridge.
    'import.meta.env.SOWYVID_BROWSER_PREVIEW': JSON.stringify('true'),
  },
  server: {
    port: 5273,
    strictPort: true,
  },
})
