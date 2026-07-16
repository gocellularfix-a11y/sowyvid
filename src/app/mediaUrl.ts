import type { MediaAsset } from '@shared/domain/media'
import type { MediaVariant } from '@features/media/managedPath'

/**
 * Builds a controlled media URL. The renderer only ever references stable media
 * IDs — the main-process protocol handler resolves them to managed files. No raw
 * filesystem path is ever handed to the renderer.
 */
export function mediaUrl(projectId: string, asset: MediaAsset, variant: MediaVariant): string {
  return `sowyvid-media://asset/${projectId}/${asset.id}/${variant}`
}

/** Best image source for a Step-2 tile: thumbnail → poster → original image. */
export function tileImageUrl(projectId: string, asset: MediaAsset): string | null {
  if (!asset.valid) return null
  if (asset.thumbRelPath) return mediaUrl(projectId, asset, 'thumb')
  if (asset.posterRelPath) return mediaUrl(projectId, asset, 'poster')
  if (asset.kind === 'image' || asset.kind === 'logo') return mediaUrl(projectId, asset, 'original')
  return null // audio / video without a poster → placeholder tile
}
