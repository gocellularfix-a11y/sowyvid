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
      '@rules': resolve('src/rules'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
    exclude: ['node_modules', 'out', 'dist', 'e2e'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/rules/**', 'src/database/**', 'src/shared/**', 'src/features/**'],
    },
  },
})
