import { lstat, realpath, rm } from 'node:fs/promises'
import { resolve, sep } from 'node:path'

/**
 * Guarded recursive removal for the render cache.
 *
 * Refreshing a render work directory means deleting it, and a delete that
 * follows a junction or symlink is how a cache refresh turns into destroying the
 * owner's photos and videos. On Windows a directory junction is especially easy
 * to create by accident and looks like an ordinary folder.
 *
 * So removal is only ever performed when ALL of these hold:
 *   - the target resolves INSIDE the allowed cache root (after resolving links
 *     on both sides — a junction cannot smuggle the path elsewhere)
 *   - the target is a real directory, not a link
 *   - the target is not the root itself
 *
 * Node's `fs.rm({recursive:true})` unlinks symlinks rather than following them,
 * so nested links cannot escape either. The check below covers the top level,
 * which is the one `fs.rm` would otherwise resolve for us.
 */

export class UnsafeRemoveError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnsafeRemoveError'
  }
}

/** True when `child` is strictly inside `parent` (both already real paths). */
export function isStrictlyInside(child: string, parent: string): boolean {
  const c = resolve(child)
  const p = resolve(parent)
  if (c === p) return false
  return c.startsWith(p.endsWith(sep) ? p : p + sep)
}

/**
 * Remove `target` recursively, but only if it is a real directory strictly
 * inside `allowedRoot`. Missing target → no-op (removal is idempotent).
 *
 * @throws UnsafeRemoveError if the target is a link, escapes the root, or IS the root.
 */
export async function safeRemoveDir(target: string, allowedRoot: string): Promise<void> {
  const info = await lstat(target).catch(() => null)
  if (!info) return // already gone

  // Reject links BEFORE resolving: a junction pointing at user media must never
  // be traversed, even if its target would happen to sit inside the cache root.
  if (info.isSymbolicLink()) {
    throw new UnsafeRemoveError(`refusing to remove through a link: ${target}`)
  }
  if (!info.isDirectory()) {
    throw new UnsafeRemoveError(`refusing to recursively remove a non-directory: ${target}`)
  }

  // Resolve BOTH sides: the cache root itself may legitimately sit behind a
  // link (e.g. a redirected user profile), and a plain string compare would
  // then wrongly reject — or wrongly accept — the target.
  const realTarget = await realpath(target)
  const realRoot = await realpath(allowedRoot).catch(() => null)
  if (!realRoot) {
    throw new UnsafeRemoveError(`cache root does not exist: ${allowedRoot}`)
  }
  if (!isStrictlyInside(realTarget, realRoot)) {
    throw new UnsafeRemoveError(
      `refusing to remove outside the render cache: ${realTarget} is not inside ${realRoot}`,
    )
  }

  await rm(realTarget, { recursive: true, force: true })
}
