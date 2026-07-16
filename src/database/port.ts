/**
 * The Database port. The rest of SowyVid depends only on this interface, never
 * on sql.js directly — so swapping in a native driver (e.g. better-sqlite3)
 * later is an adapter change, not an app change. See docs/DATABASE.md.
 */
export type SqlParam = string | number | null | Uint8Array
export type Row = Record<string, SqlParam>

export interface Database {
  /** Execute one or more statements with no bound params (e.g. migrations). */
  exec(sql: string): void
  /** Run a single parameterized statement. */
  run(sql: string, params?: SqlParam[]): void
  /** Return the first matching row, or undefined. */
  get<T = Row>(sql: string, params?: SqlParam[]): T | undefined
  /** Return all matching rows. */
  all<T = Row>(sql: string, params?: SqlParam[]): T[]
  /** Run fn inside BEGIN/COMMIT; ROLLBACK on throw. Returns fn's result. */
  transaction<T>(fn: () => T): T
  /** Serialize the whole database to bytes (for persistence). */
  export(): Uint8Array
  close(): void
}

/** A Database that also persists atomically to disk. Created in the main process. */
export interface PersistentDatabase extends Database {
  persist(): Promise<void>
}
