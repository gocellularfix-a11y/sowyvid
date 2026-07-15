import type { AspectRatio } from '@shared/domain/enums'
import type { MediaAsset, MediaScore, MediaOrientation } from '@shared/domain/media'

const TARGET_ORIENTATION: Record<AspectRatio, MediaOrientation> = {
  '9:16': 'portrait',
  '4:5': 'portrait',
  '1:1': 'square',
  '16:9': 'landscape',
}

/**
 * Deterministically score media for a target aspect ratio. Pure function: same
 * inputs → same scores, tie-broken by id so ordering is stable. Only images and
 * videos are scored for scene placement (logos/audio are excluded here).
 */
export function scoreMedia(media: MediaAsset[], aspectRatio: AspectRatio): MediaScore[] {
  const targetOrientation = TARGET_ORIENTATION[aspectRatio]
  return media
    .filter((m) => (m.kind === 'image' || m.kind === 'video') && m.valid)
    .map((m) => {
      const fit = orientationFit(m.orientation, targetOrientation)
      const quality = qualityScore(m)
      // Videos are slightly preferred as heroes; deterministic, no randomness.
      const kindBoost = m.kind === 'video' ? 0.1 : 0
      const priority = Number((fit * 0.6 + quality * 0.4 + kindBoost).toFixed(4))
      return { mediaId: m.id, fit, quality, priority }
    })
    .sort((a, b) => b.priority - a.priority || a.mediaId.localeCompare(b.mediaId))
}

function orientationFit(
  orientation: MediaOrientation | null,
  target: MediaOrientation,
): number {
  if (orientation === null) return 0.5
  if (orientation === target) return 1
  if (orientation === 'square' || target === 'square') return 0.75
  return 0.5 // portrait vs landscape mismatch — usable with cropping
}

function qualityScore(m: MediaAsset): number {
  if (m.width === null || m.height === null) return 0.6
  const minEdge = Math.min(m.width, m.height)
  // 1080+ short edge = full marks; scales down below that.
  return Number(Math.max(0.3, Math.min(1, minEdge / 1080)).toFixed(4))
}
