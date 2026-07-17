import { app } from 'electron'
import { join, resolve } from 'node:path'
import { mkdirSync } from 'node:fs'
import { getAppPaths } from './paths'
import type { BundleCacheOptions } from '@features/render/bundleCache.node'

/**
 * Where rendering lives on disk, for both run modes.
 *
 * - The bundle CACHE and render TEMP are under userData — physically isolated
 *   from managed project media (`<userData>/projects/<id>/media`), so no cache
 *   refresh can ever reach an owner's files.
 * - `projectRoot` is where the Remotion entry + composition sources resolve
 *   from. In development that is the repository; in a packaged app the repo
 *   does not exist, so a PREBUILT bundle ships in resources instead
 *   (docs/WINDOWS-PACKAGED-VALIDATION.md) and `prebuiltDir` points at it.
 */
export interface RenderEnvironment {
  cache: BundleCacheOptions
  tempRoot: string
  /**
   * Headless browser for @remotion/renderer. Null in development (Remotion
   * resolves its own download under node_modules/.remotion); in a packaged app
   * that directory does not exist, so the browser ships in resources.
   */
  browserExecutable: string | null
  /**
   * Directory holding Remotion's native compositor binaries. Null in
   * development (Remotion resolves its platform package from node_modules); in
   * a packaged app the package sits inside app.asar, and binaries cannot spawn
   * from an archive — this points at the asar-UNPACKED copy.
   */
  binariesDirectory: string | null
}

export function getRenderEnvironment(): RenderEnvironment {
  const paths = getAppPaths()
  const cacheRoot = join(paths.userData, 'render-cache')
  const tempRoot = join(paths.userData, 'render-temp')
  mkdirSync(cacheRoot, { recursive: true })
  mkdirSync(tempRoot, { recursive: true })

  if (app.isPackaged) {
    // Packaged: the render bundle was prebuilt at package time and shipped in
    // resources. There is no source tree and no webpack at runtime.
    return {
      cache: {
        projectRoot: process.resourcesPath,
        cacheRoot,
        prebuilt: { dir: join(process.resourcesPath, 'render-bundle') },
      },
      tempRoot,
      browserExecutable: join(
        process.resourcesPath,
        'chrome-headless-shell',
        'chrome-headless-shell.exe',
      ),
      binariesDirectory: join(
        process.resourcesPath,
        'app.asar.unpacked',
        'node_modules',
        '@remotion',
        'compositor-win32-x64-msvc',
      ),
    }
  }

  // Development: out/main/index.js → repo root two levels up.
  const repoRoot = resolve(import.meta.dirname, '..', '..')
  return {
    cache: { projectRoot: repoRoot, cacheRoot },
    tempRoot,
    browserExecutable: null,
    binariesDirectory: null,
  }
}
