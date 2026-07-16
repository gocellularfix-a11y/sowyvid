import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { createSqlJsDatabase } from './sqljs'
import { runMigrations } from './migrations'
import { atomicWriteFile } from './atomicWrite'
import type { PersistentDatabase } from './port'

/** Locate the staged sql.js WebAssembly binary across dev and packaged layouts. */
export function resolveWasmPath(): string {
  const require = createRequire(import.meta.url)
  try {
    return require.resolve('sql.js/dist/sql-wasm.wasm')
  } catch {
    /* fall through to filesystem candidates below */
  }
  const candidates = [
    join(process.cwd(), 'node_modules/sql.js/dist/sql-wasm.wasm'),
    join(process.cwd(), 'resources/sql-wasm.wasm'),
    join(import.meta.dirname, '../resources/sql-wasm.wasm'),
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  throw new Error('Could not locate sql-wasm.wasm')
}

/**
 * Open (or create) the SowyVid database at `dbFilePath`, run migrations, and
 * return a PersistentDatabase whose `persist()` writes the whole DB atomically.
 */
export async function openPersistentDatabase(dbFilePath: string): Promise<PersistentDatabase> {
  const wasmPath = resolveWasmPath()
  const initialBytes = existsSync(dbFilePath)
    ? new Uint8Array(await readFile(dbFilePath))
    : undefined

  const db = await createSqlJsDatabase({ wasmPath, initialBytes })
  runMigrations(db)

  const persistent: PersistentDatabase = {
    exec: db.exec,
    run: db.run,
    get: db.get,
    all: db.all,
    transaction: db.transaction,
    export: db.export,
    close: db.close,
    async persist(): Promise<void> {
      await atomicWriteFile(dbFilePath, db.export())
    },
  }

  // Persist immediately so a fresh install has a valid on-disk schema.
  if (!initialBytes) await persistent.persist()
  return persistent
}

export { ProjectRepository } from './projectRepository'
export type { ExportRecord } from '@shared/domain/exportRecord'
export type { Database, PersistentDatabase } from './port'
export { runMigrations, currentSchemaVersion, MIGRATIONS } from './migrations'
export { createSqlJsDatabase } from './sqljs'
