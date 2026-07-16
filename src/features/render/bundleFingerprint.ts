import { createHash } from 'node:crypto'

/**
 * Render-bundle fingerprinting.
 *
 * ## Why this exists
 *
 * A previous Remotion application shipped SILENT videos because production
 * reused a stale serve directory: the bundle on disk predated audio support, the
 * code said "directory exists → reuse it", and every render happily produced
 * picture with no sound. Nothing failed. Nothing warned.
 *
 * So SowyVid never asks "does the directory exist?". It asks "is the bundle on
 * disk built from EXACTLY the code I am running right now?" — and rebuilds when
 * the answer is no.
 *
 * The fingerprint is a content hash of every file that can change what the
 * bundle renders, plus the versions of the Remotion packages that compile and
 * run it. A stale cache is therefore not merely unlikely; it is unrepresentable:
 * changing any of those inputs changes the directory name.
 *
 * Pure — no filesystem access — so the rules are testable without building
 * anything. The caller supplies the file contents.
 */

/** One file that contributes to what the bundle renders. */
export interface FingerprintFile {
  /** Stable, OS-independent identifier (repo-relative, forward slashes). */
  path: string
  /** Raw file contents. */
  content: string | Buffer
}

export interface FingerprintInput {
  files: FingerprintFile[]
  /**
   * Versions of packages that affect the produced bundle (bundler/renderer/
   * remotion core). A Remotion upgrade must invalidate the cache even when not
   * one byte of our source changed.
   */
  dependencyVersions: Record<string, string>
}

/** Normalize so the same content fingerprints identically on Windows and POSIX. */
function normalizePath(p: string): string {
  return p.replace(/\\/g, '/')
}

/**
 * Content fingerprint of a render bundle's inputs.
 *
 * Deterministic and order-independent: files are sorted by path, so directory
 * traversal order can never change the result. Both the path and the content
 * are hashed, and each is length-prefixed, so renaming a file — or moving bytes
 * across a boundary between two files — still changes the fingerprint.
 */
export function computeBundleFingerprint(input: FingerprintInput): string {
  const hash = createHash('sha256')
  hash.update('sowyvid-render-bundle-v1\n')

  const files = [...input.files]
    .map((f) => ({ path: normalizePath(f.path), content: f.content }))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))

  hash.update(`files:${files.length}\n`)
  for (const file of files) {
    const content = Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content, 'utf8')
    // Length-prefix both parts so no concatenation of a path and content can
    // collide with a different split of the same bytes.
    hash.update(`${file.path.length}:${file.path}\n`)
    hash.update(`${content.byteLength}:`)
    hash.update(content)
    hash.update('\n')
  }

  const deps = Object.entries(input.dependencyVersions).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  hash.update(`deps:${deps.length}\n`)
  for (const [name, version] of deps) {
    hash.update(`${name}@${version}\n`)
  }

  return hash.digest('hex')
}

/** Short, filesystem-safe directory name for a fingerprint. */
export function fingerprintDirName(fingerprint: string): string {
  return `bundle-${fingerprint.slice(0, 16)}`
}

/** What a cached bundle records about itself, written after a successful build. */
export interface BundleStamp {
  fingerprint: string
  /** Bumped when the stamp's own meaning changes. */
  stampVersion: 1
  builtAt: string
}

export const BUNDLE_STAMP_VERSION = 1 as const
export const BUNDLE_STAMP_FILE = 'sowyvid-bundle.json'

export type CacheDecision =
  /** Bundle on disk matches the running code — use it. */
  | { kind: 'reuse' }
  /** No usable bundle — build one. */
  | { kind: 'build'; reason: 'missing' | 'no-stamp' | 'unreadable-stamp' | 'stale-version' }
  /** A bundle exists but is wrong — remove it, then build. */
  | { kind: 'rebuild'; reason: 'fingerprint-mismatch' }

/**
 * Decide what to do with a cached bundle. This is the one function that must
 * never say "reuse" out of optimism.
 *
 * @param stamp what the cached bundle claims (null when absent/unreadable)
 * @param current the fingerprint of the code running right now
 */
export function decideCache(
  stamp: unknown,
  current: string,
  bundleExists: boolean,
): CacheDecision {
  if (!bundleExists) return { kind: 'build', reason: 'missing' }
  if (stamp === null || stamp === undefined) return { kind: 'build', reason: 'no-stamp' }
  if (typeof stamp !== 'object') return { kind: 'build', reason: 'unreadable-stamp' }

  const s = stamp as Partial<BundleStamp>
  if (typeof s.fingerprint !== 'string' || s.fingerprint.length === 0) {
    return { kind: 'build', reason: 'unreadable-stamp' }
  }
  // An older stamp format cannot be trusted to mean what it says.
  if (s.stampVersion !== BUNDLE_STAMP_VERSION) return { kind: 'build', reason: 'stale-version' }
  if (s.fingerprint !== current) return { kind: 'rebuild', reason: 'fingerprint-mismatch' }
  return { kind: 'reuse' }
}
