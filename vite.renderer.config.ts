import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Standalone renderer config used for the Playwright smoke test and for
 * previewing the UI shell in a plain browser without booting Electron.
 * The full app runs through electron.vite.config.ts.
 */
export default defineConfig({
  root: 'src/app',
  resolve: {
    alias: {
      '@shared': resolve('src/shared'),
      '@app': resolve('src/app'),
      '@features': resolve('src/features'),
      '@render': resolve('src/render'),
      '@config': resolve('src/config'),
      '@jorge-engines/northstar-creative/remotion': resolve(
        'packages/northstar-creative-engine/src/adapters/remotion.ts',
      ),
      '@jorge-engines/northstar-creative': resolve(
        'packages/northstar-creative-engine/src/index.ts',
      ),
      '@jorge-engines/framelogic-visual': resolve(
        'packages/framelogic-visual-engine/src/index.ts',
      ),
      '@jorge-engines/soundweave-audio': resolve(
        'packages/soundweave-audio-engine/src/index.ts',
      ),
      // NOTE: engine aliases must be added in FOUR places — here, electron.vite.config.ts,
      // vitest.config.ts and tsconfig.base.json. Missing this one still typechecks
      // and still passes unit tests; only the browser preview breaks.
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
