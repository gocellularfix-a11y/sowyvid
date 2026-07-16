import type { MediaAsset as ProjectMedia } from '@shared/domain/media'
import type { MediaAsset as EngineMedia } from '@jorge-engines/northstar-creative'

/**
 * Maps a SowyVid managed media asset (persistence shape, path-based) into the
 * engine's abstract media-metadata contract (ID + semantic metadata, never a
 * filesystem path). The engine selects IDs; the app/renderer resolves IDs back
 * to managed files at the renderer boundary. Audio assets are excluded from
 * scene-placement metadata.
 */
export function toEngineMedia(items: readonly ProjectMedia[]): EngineMedia[] {
  return items
    .filter((m) => m.kind !== 'audio' && m.valid)
    .map((m): EngineMedia => ({
      id: m.id,
      kind: m.kind === 'logo' ? 'logo' : m.kind === 'video' ? 'video' : 'image',
      // SowyVid does not yet capture semantic roles/tags (media pipeline, Phase 6).
      // A logo declares its role; everything else is left to orientation/quality
      // scoring, which still fills photographic slots correctly.
      roles: m.kind === 'logo' ? ['logo'] : [],
      orientation: m.orientation ?? 'unknown',
      width: m.width ?? undefined,
      height: m.height ?? undefined,
      durationSec: m.durationSec ?? undefined,
      qualityScore: qualityScore(m),
      tags: [],
      hasAudio: m.hasAudio,
    }))
}

function qualityScore(m: ProjectMedia): number {
  if (m.width == null || m.height == null) return 0.5
  const minEdge = Math.min(m.width, m.height)
  return Number(Math.max(0.3, Math.min(1, minEdge / 1080)).toFixed(4))
}
