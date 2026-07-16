/**
 * A serializable Result type used across the IPC boundary.
 *
 * IPC handlers never throw across the bridge — they return a Result so the
 * renderer can translate failures into friendly, actionable messages (see the
 * Owner Experience requirements) instead of surfacing raw stack traces.
 */
export type Ok<T> = { ok: true; value: T }
export type Err = { ok: false; error: AppError }

export type Result<T> = Ok<T> | Err

/** A structured, user-translatable error. `code` is stable; `message` is dev-facing. */
export interface AppError {
  code: AppErrorCode
  /** Developer-facing detail. Never shown verbatim to owners. */
  message: string
  /** Optional structured context for logs. */
  details?: Record<string, unknown>
}

export type AppErrorCode =
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'IO'
  | 'DATABASE'
  | 'RENDER'
  | 'MEDIA'
  | 'PHONE_IMPORT'
  | 'AI'
  | 'UNSUPPORTED'
  /** The export gate is closed; `message` carries the owner-facing Spanish blocker. */
  | 'NOT_READY'
  /** A render is already active for this project. */
  | 'BUSY'
  | 'INTERNAL'

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value }
}

export function err(code: AppErrorCode, message: string, details?: Record<string, unknown>): Err {
  return { ok: false, error: { code, message, ...(details ? { details } : {}) } }
}

export function isOk<T>(r: Result<T>): r is Ok<T> {
  return r.ok
}
