import { Project } from '../domain/project'
import type { MediaAsset } from '../domain/media'

/**
 * Development fixture for a Go Cellular promotion. FOR TESTING/DEMO ONLY — the
 * app is not hardcoded around Go Cellular. Media entries reference local
 * placeholder assets generated for development (no copyrighted brand assets).
 * Timestamps are fixed so the fixture is deterministic.
 */
const FIXED_TS = '2026-01-01T12:00:00.000Z'

function img(id: string, name: string, w: number, h: number): MediaAsset {
  return {
    id,
    kind: 'image',
    relPath: `media/${id}.jpg`,
    originalName: name,
    mimeType: 'image/jpeg',
    hash: `hash_${id}`,
    bytes: 850_000,
    width: w,
    height: h,
    orientation: w > h ? 'landscape' : w < h ? 'portrait' : 'square',
    durationSec: null,
    fps: null,
    hasAudio: false,
    container: null,
    videoCodec: null,
    audioCodec: null,
    audioSampleRate: null,
    audioChannels: null,
    thumbRelPath: `thumbnails/${id}.jpg`,
    posterRelPath: null,
    audioMeta: null,
    analysisStatus: 'ready',
    analysisError: null,
    valid: true,
    importedAt: FIXED_TS,
  }
}

/**
 * A managed video asset. `durationSec`/`hasAudio` are what the live-playback
 * rules key off, so tests can build long/short/silent/noisy clips explicitly.
 */
export function vid(
  id: string,
  name: string,
  opts: {
    durationSec: number | null
    hasAudio?: boolean
    width?: number
    height?: number
    fps?: number | null
    poster?: boolean
    valid?: boolean
    analysisStatus?: MediaAsset['analysisStatus']
  },
): MediaAsset {
  const w = opts.width ?? 1080
  const h = opts.height ?? 1920
  return {
    id,
    kind: 'video',
    relPath: `media/${id}.mp4`,
    originalName: name,
    mimeType: 'video/mp4',
    hash: `hash_${id}`,
    bytes: 4_200_000,
    width: w,
    height: h,
    orientation: w > h ? 'landscape' : w < h ? 'portrait' : 'square',
    durationSec: opts.durationSec,
    fps: opts.fps === undefined ? 30 : opts.fps,
    hasAudio: opts.hasAudio ?? false,
    container: null,
    videoCodec: null,
    audioCodec: null,
    audioSampleRate: null,
    audioChannels: null,
    thumbRelPath: `thumbnails/${id}.jpg`,
    posterRelPath: opts.poster === false ? null : `posters/${id}.jpg`,
    audioMeta: null,
    analysisStatus: opts.analysisStatus ?? 'ready',
    analysisError: null,
    valid: opts.valid ?? true,
    importedAt: FIXED_TS,
  }
}

/** A managed audio asset (music or narration). */
export function aud(
  id: string,
  name: string,
  opts: {
    durationSec: number | null
    mimeType?: string
    valid?: boolean
    analysisStatus?: MediaAsset['analysisStatus']
    audioMeta?: MediaAsset['audioMeta']
  },
): MediaAsset {
  return {
    id,
    kind: 'audio',
    relPath: `media/${id}.mp3`,
    originalName: name,
    mimeType: opts.mimeType ?? 'audio/mpeg',
    hash: `hash_${id}`,
    bytes: 1_800_000,
    width: null,
    height: null,
    orientation: null,
    durationSec: opts.durationSec,
    fps: null,
    hasAudio: true,
    container: null,
    videoCodec: null,
    audioCodec: null,
    audioSampleRate: null,
    audioChannels: null,
    thumbRelPath: null,
    posterRelPath: null,
    audioMeta: opts.audioMeta ?? null,
    analysisStatus: opts.analysisStatus ?? 'ready',
    analysisError: null,
    valid: opts.valid ?? true,
    importedAt: FIXED_TS,
  }
}

export const GO_CELLULAR_MEDIA: MediaAsset[] = [
  img('gc_store', 'tienda.jpg', 1080, 1920),
  img('gc_phone1', 'iphone_certificado.jpg', 1080, 1920),
  img('gc_phone2', 'samsung_oferta.jpg', 1080, 1350),
  img('gc_counter', 'mostrador.jpg', 1920, 1080),
]

export const goCellularProject: Project = Project.parse({
  id: 'fixture_go_cellular',
  name: 'Go Cellular — Teléfonos certificados',
  brief: {
    businessName: 'Go Cellular',
    category: 'phone-electronics',
    objective: 'phone-electronics',
    productOrService: 'Teléfonos certificados',
    offer: 'Calidad a precios accesibles',
    price: 'Desde $2,999',
    supportingDetails: 'Garantía incluida y prueba en tienda.',
    callToAction: 'Visita Go Cellular hoy',
  },
  brand: {
    colors: ['#7c5cff', '#0a0a0f'],
    logoMediaId: null,
  },
  video: {
    aspectRatio: '9:16',
    targetDurationSec: 20,
    energy: 'balanced',
  },
  audio: {
    musicId: null,
    narrationEnabled: false,
    useSourceAudio: false,
    musicVolume: 0.8,
    narrationVolume: 1,
  },
  render: {
    platform: 'instagram-reel',
    resolution: 1920,
  },
  targetPlatform: 'instagram-reel',
  templateId: null,
  creative: null,
  media: GO_CELLULAR_MEDIA,
  status: 'draft',
  createdAt: FIXED_TS,
  updatedAt: FIXED_TS,
})

/**
 * Same promotion, but the owner imported real clips.
 *
 *   gc_clip_long — 30s, HAS audio → longer than any scene, so it exercises
 *                  trimming AND the "muted unless explicitly enabled" rule
 *                  against a clip that genuinely COULD make noise.
 *   gc_clip_mute — 30s, no audio track → can never be unmuted.
 *
 * Both clips are long on purpose: Northstar chooses which assets land in which
 * scenes, so a fixture cannot reliably force a SHORT clip into a scene. Tests
 * that need the short-clip path shorten `durationSec` explicitly rather than
 * hoping the selector picks a short asset — otherwise those assertions pass
 * vacuously.
 */
export const GO_CELLULAR_VIDEO_MEDIA: MediaAsset[] = [
  vid('gc_clip_long', 'tienda_clip.mp4', { durationSec: 30, hasAudio: true }),
  vid('gc_clip_mute', 'producto_clip.mp4', { durationSec: 30, hasAudio: false }),
  img('gc_phone1', 'iphone_certificado.jpg', 1080, 1920),
  img('gc_phone2', 'samsung_oferta.jpg', 1080, 1350),
]

export const goCellularVideoProject: Project = Project.parse({
  ...goCellularProject,
  id: 'fixture_go_cellular_video',
  media: GO_CELLULAR_VIDEO_MEDIA,
})

/**
 * A pre-integration ("legacy") project JSON, exactly as an older SowyVid build
 * would have persisted it — including the retired `templateVersion` /
 * `ruleEngineVersion` keys and no `creative` field. Used to prove existing
 * projects still load after the Northstar integration (unknown keys are
 * stripped, `creative` defaults to null).
 */
export const legacyProjectRaw: unknown = {
  id: 'legacy_proj_1',
  name: 'Proyecto anterior',
  brief: {
    businessName: 'Negocio Local',
    category: 'local-service',
    objective: 'local-service',
    productOrService: 'Servicio a domicilio',
    offer: '',
    price: '',
    supportingDetails: '',
    callToAction: 'Llámanos hoy',
  },
  brand: { colors: [], logoMediaId: null },
  video: { aspectRatio: '9:16', targetDurationSec: 18, energy: 'balanced' },
  audio: {
    musicId: null,
    narrationEnabled: false,
    useSourceAudio: false,
    musicVolume: 0.8,
    narrationVolume: 1,
  },
  render: { platform: 'instagram-reel', resolution: 1920 },
  targetPlatform: 'instagram-reel',
  templateId: 'trust-quality',
  // Retired keys from the pre-Northstar engine — must be tolerated on load:
  templateVersion: 1,
  ruleEngineVersion: 1,
  media: [],
  status: 'draft',
  createdAt: FIXED_TS,
  updatedAt: FIXED_TS,
}
