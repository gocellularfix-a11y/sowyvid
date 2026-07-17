import type { MediaAsset } from '@shared/domain/media'

/**
 * Owner-facing identity line for a media tile, derived from ANALYZED content —
 * never from the filename alone. The extension proposed a kind at import; the
 * ffprobe pass confirmed (or refuted) it, and this label reports that verdict:
 *
 *   Video · 18 s · Con audio
 *   Video · 18 s · Sin audio
 *   Música · MP3 · 24 s
 *   Imagen · Vertical
 *
 * Pure and isomorphic so the browser preview and unit tests can use it.
 */

const ORIENTATION_LABEL: Record<NonNullable<MediaAsset['orientation']>, string> = {
  portrait: 'Vertical',
  landscape: 'Horizontal',
  square: 'Cuadrada',
}

function formatOf(asset: MediaAsset): string | null {
  const dot = asset.relPath.lastIndexOf('.')
  if (dot < 0) return null
  const ext = asset.relPath.slice(dot + 1).toUpperCase()
  return ext.length > 0 && ext.length <= 5 ? ext : null
}

function secondsOf(asset: MediaAsset): string | null {
  if (asset.durationSec === null || !Number.isFinite(asset.durationSec)) return null
  return `${Math.max(1, Math.round(asset.durationSec))} s`
}

/** One line describing what the file IS, from its analyzed content. */
export function mediaTileLabel(asset: MediaAsset): string {
  if (!asset.valid) return 'Archivo no disponible'
  if (asset.analysisStatus === 'failed') return 'Archivo no válido'

  const parts: string[] = []
  switch (asset.kind) {
    case 'video': {
      parts.push('Video')
      const secs = secondsOf(asset)
      if (secs) parts.push(secs)
      // Only a COMPLETED analysis may claim the audio verdict — before that we
      // genuinely do not know, and "Sin audio" would be a guess.
      if (asset.analysisStatus === 'ready') {
        parts.push(asset.hasAudio ? 'Con audio' : 'Sin audio')
      } else {
        parts.push('analizando…')
      }
      break
    }
    case 'audio': {
      parts.push('Música')
      const fmt = formatOf(asset)
      if (fmt) parts.push(fmt)
      const secs = secondsOf(asset)
      if (secs) parts.push(secs)
      break
    }
    case 'logo':
      parts.push('Logo')
      break
    default: {
      parts.push('Imagen')
      if (asset.orientation) parts.push(ORIENTATION_LABEL[asset.orientation])
      break
    }
  }
  return parts.join(' · ')
}

/** True when this video asset was analyzed and confirmed to carry NO audio. */
export function videoHasNoSound(asset: MediaAsset): boolean {
  return asset.kind === 'video' && asset.analysisStatus === 'ready' && !asset.hasAudio
}

/** Videos whose ANALYZED content contains an audio stream (usable as source audio). */
export function videosWithAudio(media: readonly MediaAsset[]): MediaAsset[] {
  return media.filter(
    (m) => m.kind === 'video' && m.valid && m.analysisStatus === 'ready' && m.hasAudio,
  )
}
