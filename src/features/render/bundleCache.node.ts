import { readFile, readdir, writeFile, mkdir, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, resolve, relative } from 'node:path'
import { bundle } from '@remotion/bundler'
import {
  computeBundleFingerprint,
  decideCache,
  fingerprintDirName,
  BUNDLE_STAMP_FILE,
  BUNDLE_STAMP_VERSION,
  type BundleStamp,
  type CacheDecision,
  type FingerprintFile,
} from './bundleFingerprint'
import { safeRemoveDir } from './safeRemove.node'
import { allAliases } from '@build/aliases'

/**
 * The render bundle cache. See docs/RENDER-BUNDLE-CACHE.md.
 *
 * Bundling is slow, so the result is cached — but the cache is keyed by a
 * CONTENT fingerprint of everything that can change what the bundle renders,
 * never by "the directory exists". A stale bundle is how a render silently
 * produces picture with a phantom silent audio track.
 */

/**
 * Source trees whose contents end up inside the render bundle. Anything the
 * composition can reach at runtime belongs here — miss one, and a change to it
 * will NOT invalidate the cache.
 */
const FINGERPRINT_ROOTS = [
  'src/render',
  'src/features/audio',
  'packages/soundweave-audio-engine/src',
] as const

/** Packages whose version changes what the bundler emits or how it runs. */
const FINGERPRINT_DEPS = ['remotion', '@remotion/bundler', '@remotion/renderer', 'react'] as const

const SOURCE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|css)$/
/** Tests never reach the bundle; including them would churn the cache for nothing. */
const IGNORED = /\.(test|spec)\.(ts|tsx)$/

async function collectFiles(root: string, dir: string, out: FingerprintFile[]): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      await collectFiles(root, full, out)
    } else if (entry.isFile() && SOURCE_EXT.test(entry.name) && !IGNORED.test(entry.name)) {
      out.push({ path: relative(root, full), content: await readFile(full) })
    }
  }
}

export interface BundleCacheOptions {
  /** Repo root (dev) or resource root (packaged) — where FINGERPRINT_ROOTS live. */
  projectRoot: string
  /** Where bundles are cached. MUST be isolated from project media. */
  cacheRoot: string
}

/** Fingerprint of the composition code currently on disk. */
export async function currentBundleFingerprint(options: BundleCacheOptions): Promise<string> {
  const files: FingerprintFile[] = []
  for (const rel of FINGERPRINT_ROOTS) {
    const dir = resolve(options.projectRoot, rel)
    if (existsSync(dir)) await collectFiles(options.projectRoot, dir, files)
  }

  const pkgRaw = await readFile(resolve(options.projectRoot, 'package.json'), 'utf8')
  const pkg = JSON.parse(pkgRaw) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> }
  const all = { ...pkg.devDependencies, ...pkg.dependencies }
  const dependencyVersions: Record<string, string> = {}
  for (const dep of FINGERPRINT_DEPS) dependencyVersions[dep] = all[dep] ?? 'absent'

  return computeBundleFingerprint({ files, dependencyVersions })
}

async function readStamp(bundleDir: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(join(bundleDir, BUNDLE_STAMP_FILE), 'utf8'))
  } catch {
    return null
  }
}

/** A bundle directory is only usable if Remotion actually emitted an entry point. */
async function bundleLooksBuilt(bundleDir: string): Promise<boolean> {
  const info = await stat(join(bundleDir, 'index.html')).catch(() => null)
  return Boolean(info?.isFile())
}

export interface EnsureBundleResult {
  /** Absolute path to the serve directory to hand to the renderer. */
  serveUrl: string
  fingerprint: string
  decision: CacheDecision
  /** True when a bundle was actually compiled (not reused). */
  built: boolean
}

/**
 * Return a serve directory guaranteed to match the code running right now,
 * building or refreshing it when it does not.
 *
 * This is the ONE path production rendering uses. Tests drive this same
 * function — a test that bundles into a fresh directory of its own would prove
 * nothing about the cache, which is exactly how a stale-cache bug survives a
 * green test suite.
 */
export async function ensureRenderBundle(
  options: BundleCacheOptions,
  hooks: { onProgress?: (percent: number) => void } = {},
): Promise<EnsureBundleResult> {
  const fingerprint = await currentBundleFingerprint(options)
  const bundleDir = join(options.cacheRoot, fingerprintDirName(fingerprint))

  await mkdir(options.cacheRoot, { recursive: true })

  const exists = existsSync(bundleDir) && (await bundleLooksBuilt(bundleDir))
  const decision = decideCache(await readStamp(bundleDir), fingerprint, exists)

  if (decision.kind === 'reuse') {
    return { serveUrl: bundleDir, fingerprint, decision, built: false }
  }

  // Wrong or unverifiable → remove it. Guarded: never deletes through a link and
  // never outside the cache root.
  await safeRemoveDir(bundleDir, options.cacheRoot)

  const serveUrl = await bundle({
    entryPoint: resolve(options.projectRoot, 'src/render/remotionEntry.ts'),
    outDir: bundleDir,
    onProgress: (p) => hooks.onProgress?.(p),
    // Remotion's webpack knows nothing about our path aliases. Without this the
    // bundle cannot resolve the vendored engines, and export fails while every
    // other bundler is perfectly happy — so the map is shared, not re-typed.
    webpackOverride: (config) => ({
      ...config,
      resolve: {
        ...config.resolve,
        alias: { ...config.resolve?.alias, ...allAliases(options.projectRoot) },
      },
    }),
  })

  // Stamp only AFTER a successful build, so a crashed build can never be
  // mistaken for a valid cache: an unstamped directory is always rebuilt.
  const stamp: BundleStamp = {
    fingerprint,
    stampVersion: BUNDLE_STAMP_VERSION,
    builtAt: new Date().toISOString(),
  }
  await writeFile(join(bundleDir, BUNDLE_STAMP_FILE), JSON.stringify(stamp, null, 2), 'utf8')

  return { serveUrl, fingerprint, decision, built: true }
}
