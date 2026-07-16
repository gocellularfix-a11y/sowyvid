import { resolve } from 'node:path'

/**
 * The ONE alias map.
 *
 * These aliases are needed by five different bundlers/typecheckers:
 *   1. electron.vite.config.ts   — the real app
 *   2. vite.renderer.config.ts   — browser preview + its Playwright suite
 *   3. vitest.config.ts          — unit tests
 *   4. @remotion/bundler         — the PRODUCTION RENDER bundle (webpack)
 *   5. tsconfig.base.json        — typechecking (JSON, so it must be kept in sync by hand)
 *
 * Adding an engine and updating only some of them fails in ways that are easy to
 * miss: a missing renderer alias still typechecks and still passes unit tests
 * while the browser preview is dead, and a missing BUNDLER alias fails only at
 * export time. Everything that can share this map does.
 *
 * `tsconfig.base.json` is the one exception — JSON cannot import — so its
 * `paths` block must mirror `engineAliases` manually.
 */

/** Vendored Jorge Engine Vault packages, consumed as source via alias. */
export function engineAliases(root: string = process.cwd()): Record<string, string> {
  const at = (p: string): string => resolve(root, p)
  return {
    // Longest specifier first: prefix-matching resolvers would otherwise let
    // '@jorge-engines/northstar-creative' shadow its '/remotion' subpath.
    '@jorge-engines/northstar-creative/remotion': at(
      'packages/northstar-creative-engine/src/adapters/remotion.ts',
    ),
    '@jorge-engines/northstar-creative': at('packages/northstar-creative-engine/src/index.ts'),
    '@jorge-engines/mediavault': at('packages/mediavault-engine/src/index.ts'),
    '@jorge-engines/framelogic-visual': at('packages/framelogic-visual-engine/src/index.ts'),
    '@jorge-engines/soundweave-audio': at('packages/soundweave-audio-engine/src/index.ts'),
  }
}

/** Internal source aliases (`@shared`, `@features`, …). */
export function sourceAliases(root: string = process.cwd()): Record<string, string> {
  const at = (p: string): string => resolve(root, p)
  return {
    '@shared': at('src/shared'),
    '@app': at('src/app'),
    '@features': at('src/features'),
    '@database': at('src/database'),
    '@render': at('src/render'),
    '@config': at('src/config'),
  }
}

/** Every alias the render bundle needs to resolve the composition. */
export function allAliases(root: string = process.cwd()): Record<string, string> {
  return { ...sourceAliases(root), ...engineAliases(root) }
}
