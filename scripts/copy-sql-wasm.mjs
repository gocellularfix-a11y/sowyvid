// Copies the sql.js WebAssembly binary out of node_modules into a stable
// location (resources/) so the Electron main process can load it at runtime
// without depending on node_modules layout in a packaged app.
//
// Runs on `postinstall`. Safe to run repeatedly. Never throws the install:
// if sql.js is not present yet (e.g. partial install) it warns and exits 0.
import { existsSync, mkdirSync, copyFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const source = resolve(root, 'node_modules/sql.js/dist/sql-wasm.wasm')
const destDir = resolve(root, 'resources')
const dest = resolve(destDir, 'sql-wasm.wasm')

try {
  if (!existsSync(source)) {
    console.warn('[copy-sql-wasm] sql.js wasm not found yet; skipping (run again after install).')
    process.exit(0)
  }
  if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true })
  copyFileSync(source, dest)
  console.warn('[copy-sql-wasm] staged sql-wasm.wasm -> resources/sql-wasm.wasm')
} catch (err) {
  console.warn('[copy-sql-wasm] non-fatal:', err?.message ?? err)
  process.exit(0)
}
