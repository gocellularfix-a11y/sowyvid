import initSqlJs, { type Database as SqlJsDb } from 'sql.js'
import type { Database, Row, SqlParam } from './port'

/**
 * Creates a Database backed by sql.js (real SQLite compiled to WebAssembly).
 * Pure in-memory; persistence is handled by the caller via `export()` +
 * atomic write. `wasmPath` points at the staged sql-wasm.wasm.
 */
export async function createSqlJsDatabase(opts: {
  wasmPath: string
  initialBytes?: Uint8Array
}): Promise<Database> {
  const SQL = await initSqlJs({ locateFile: () => opts.wasmPath })
  const db: SqlJsDb = opts.initialBytes
    ? new SQL.Database(opts.initialBytes)
    : new SQL.Database()

  // Enforce referential integrity for our schema.
  db.run('PRAGMA foreign_keys = ON;')

  const all = <T = Row>(sql: string, params: SqlParam[] = []): T[] => {
    const stmt = db.prepare(sql)
    try {
      stmt.bind(params)
      const rows: T[] = []
      while (stmt.step()) {
        rows.push(stmt.getAsObject() as unknown as T)
      }
      return rows
    } finally {
      stmt.free()
    }
  }

  return {
    exec(sql: string): void {
      db.exec(sql)
    },
    run(sql: string, params: SqlParam[] = []): void {
      db.run(sql, params)
    },
    get<T = Row>(sql: string, params: SqlParam[] = []): T | undefined {
      return all<T>(sql, params)[0]
    },
    all,
    transaction<T>(fn: () => T): T {
      db.run('BEGIN')
      try {
        const result = fn()
        db.run('COMMIT')
        return result
      } catch (e) {
        db.run('ROLLBACK')
        throw e
      }
    },
    export(): Uint8Array {
      return db.export()
    },
    close(): void {
      db.close()
    },
  }
}
