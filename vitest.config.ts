import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve('src/shared'),
      '@app': resolve('src/app'),
      '@electron': resolve('src/electron'),
      '@features': resolve('src/features'),
      '@database': resolve('src/database'),
      '@render': resolve('src/render'),
      '@config': resolve('src/config'),
      '@jorge-engines/northstar-creative/remotion': resolve(
        'packages/northstar-creative-engine/src/adapters/remotion.ts',
      ),
      '@jorge-engines/northstar-creative': resolve(
        'packages/northstar-creative-engine/src/index.ts',
      ),
      '@jorge-engines/mediavault': resolve('packages/mediavault-engine/src/index.ts'),
      '@jorge-engines/framelogic-visual': resolve('packages/framelogic-visual-engine/src/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: [
      'src/**/*.{test,spec}.ts',
      'packages/northstar-creative-engine/tests/**/*.test.ts',
      'packages/mediavault-engine/tests/**/*.test.ts',
      'packages/framelogic-visual-engine/tests/**/*.test.ts',
    ],
    exclude: ['node_modules', 'out', 'dist', 'e2e'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: [
        'packages/northstar-creative-engine/src/**',
        'src/database/**',
        'src/shared/**',
        'src/features/**',
      ],
    },
  },
})
