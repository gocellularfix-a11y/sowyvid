import { rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { buildPrebuiltRenderBundle } from '../src/features/render/bundleCache.node'

/**
 * Package-time step (run via vite-node, which honors the repo aliases):
 * compile the Remotion render bundle from the CURRENT sources and stamp it with
 * their fingerprint. electron-builder ships the result as
 * `resources/render-bundle`, and the packaged app renders by COPYING it into
 * its fingerprinted cache — no webpack, no repository, no node_modules
 * bundler at runtime. See docs/WINDOWS-PACKAGED-VALIDATION.md.
 *
 * Uses the same compiler and the same fingerprint function as the development
 * render path, so the shipped bundle cannot differ from what dev renders.
 */
const repoRoot = resolve(import.meta.dirname, '..')
const outDir = resolve(repoRoot, 'out', 'render-bundle')

await rm(outDir, { recursive: true, force: true })
const { fingerprint } = await buildPrebuiltRenderBundle(repoRoot, outDir)
// Build-time script: this output IS its deliverable.
// eslint-disable-next-line no-console
console.info(`[render-bundle] built ${outDir} (fingerprint ${fingerprint.slice(0, 16)}…)`)
