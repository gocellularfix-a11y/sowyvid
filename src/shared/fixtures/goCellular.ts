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
    hasAudio: false,
    thumbRelPath: `thumbnails/${id}.jpg`,
    valid: true,
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
