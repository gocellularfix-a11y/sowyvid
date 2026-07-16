import { resolve, sep } from 'node:path'
import type { MediaAsset } from '@shared/domain/media'

/** Which managed file a media URL refers to. */
export type MediaVariant = 'original' | 'poster' | 'thumb'

/** A media id must be `media_<64 hex>` — nothing else may be resolved. */
export function isValidMediaId(id: string): boolean {
  return /^media_[a-f0-9]{64}$/.test(id)
}

/**
 * Resolve a managed media variant to an absolute path, or null if it does not
 * exist / escapes the project's media directory. PURE path logic (no fs) so it
 * is fully testable. The controlled protocol and renderer only ever reference
 * stable media IDs; this is the single translation point.
 */
export function resolveManagedMediaPath(
  projectDir: string,
  asset: MediaAsset,
  variant: MediaVariant,
): string | null {
  if (!isValidMediaId(asset.id)) return null
  const rel =
    variant === 'poster' ? asset.posterRelPath : variant === 'thumb' ? asset.thumbRelPath : asset.relPath
  if (!rel) return null

  const mediaRoot = resolve(projectDir, 'media')
  const abs = resolve(projectDir, rel)
  // Must stay strictly within <project>/media — blocks any `..` traversal.
  if (abs !== mediaRoot && !abs.startsWith(mediaRoot + sep)) return null
  return abs
}
