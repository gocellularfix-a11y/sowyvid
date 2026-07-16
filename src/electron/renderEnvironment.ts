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
    }
  }

  // Development: out/main/index.js → repo root two levels up.
  const repoRoot = resolve(import.meta.dirname, '..', '..')
  return {
    cache: { projectRoot: repoRoot, cacheRoot },
    tempRoot,
  }
}
