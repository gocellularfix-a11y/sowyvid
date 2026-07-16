import { resolve } from 'node:path'
import { engineAliases, sourceAliases } from './src/build/aliases'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@build': resolve('src/build'),
      ...sourceAliases(),
      ...engineAliases(),
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
      'packages/soundweave-audio-engine/tests/**/*.test.ts',
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
