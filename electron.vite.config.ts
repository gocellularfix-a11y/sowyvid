import { resolve } from 'node:path'
import { engineAliases, sourceAliases } from './src/build/aliases'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

const alias = {
  '@build': resolve('src/build'),
  ...sourceAliases(),
  ...engineAliases(),
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias },
    build: {
      outDir: 'out/main',
      lib: { entry: resolve('src/electron/main.ts') },
      rollupOptions: {
        output: { format: 'es', entryFileNames: 'index.js' },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias },
    build: {
      outDir: 'out/preload',
      lib: { entry: resolve('src/electron/preload.ts') },
      rollupOptions: {
        // Preload must be CommonJS (sandbox); emit a stable .cjs filename.
        output: { format: 'cjs', entryFileNames: 'index.cjs' },
      },
    },
  },
  renderer: {
    root: 'src/app',
    resolve: { alias },
    plugins: [react()],
    build: {
      outDir: 'out/renderer',
      rollupOptions: {
        input: resolve('src/app/index.html'),
      },
    },
    server: {
      // Deterministic dev port so Playwright can attach.
      port: 5273,
      strictPort: true,
    },
  },
})
