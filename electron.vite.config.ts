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
        // `@remotion/bundler` is a DEV dependency loaded via dynamic import on
        // the development render path only; externalizeDepsPlugin externalizes
        // production deps, so without this Rollup would inline webpack (and
        // fail on its eval/CJS shims). The packaged app never loads it — it
        // renders from the prebuilt bundle in resources.
        external: ['@remotion/bundler'],
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
