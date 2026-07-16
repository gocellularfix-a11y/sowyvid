import { z } from 'zod'
import type { RenderPreset } from './presets'

/**
 * Owner-facing export presets (§5). Pure and renderer-safe — the UI reads the
 * catalog, but the RENDERER NEVER SENDS DIMENSIONS: it sends only a preset id,
 * and the main process derives the real output size from this table plus the
 * plan. That keeps arbitrary numbers out of the IPC payload.
 *
 * A preset never re-crops: the exported frame is exactly what FrameLogic laid
 * out. A preset whose aspect ratio differs from the plan's is therefore not
 * renderable for that plan — offering it anyway would silently move text out of
 * the text-safe frames the plan guaranteed. The UI shows those presets disabled
 * with the reason, and the plan's own ratio is selected by default.
 */

export const ExportPresetId = z.enum(['vertical', 'square', 'horizontal', 'original'])
export type ExportPresetId = z.infer<typeof ExportPresetId>

export interface ExportPresetInfo {
  id: ExportPresetId
  /** Owner-facing Spanish label. */
  label: string
  /** e.g. "1080 × 1920". Null for 'original' (depends on the plan). */
  sizeLabel: string | null
  /** Plan aspect ratio this preset requires; null = always matches. */
  requiresAspect: string | null
  /** Long-edge resolution handed to the render job. */
  resolution: RenderPreset['resolution']
  /** Render-job preset id (existing catalog in presets.ts). */
  renderPresetId: RenderPreset['id']
}

export const EXPORT_PRESETS: ExportPresetInfo[] = [
  {
    id: 'vertical',
    label: 'Vertical 9:16',
    sizeLabel: '1080 × 1920',
    requiresAspect: '9:16',
    resolution: 1920,
    renderPresetId: 'instagram-reel',
  },
  {
    id: 'square',
    label: 'Cuadrado 1:1',
    sizeLabel: '1080 × 1080',
    requiresAspect: '1:1',
    resolution: 1080,
    renderPresetId: 'instagram-feed',
  },
  {
    id: 'horizontal',
    label: 'Horizontal 16:9',
    sizeLabel: '1920 × 1080',
    requiresAspect: '16:9',
    resolution: 1920,
    renderPresetId: 'youtube',
  },
  {
    id: 'original',
    label: 'Como se diseñó',
    sizeLabel: null,
    requiresAspect: null,
    resolution: 1920,
    renderPresetId: 'original',
  },
]

export function presetInfo(id: ExportPresetId): ExportPresetInfo {
  return EXPORT_PRESETS.find((p) => p.id === id)!
}

/** Can this preset render this plan without re-cropping? */
export function presetIsRenderable(id: ExportPresetId, planAspectRatio: string): boolean {
  const info = presetInfo(id)
  return info.requiresAspect === null || info.requiresAspect === planAspectRatio
}

/** The preset selected by default: the plan's own aspect ratio (§5). */
export function defaultPresetFor(planAspectRatio: string): ExportPresetId {
  const match = EXPORT_PRESETS.find((p) => p.requiresAspect === planAspectRatio)
  return match?.id ?? 'original'
}

/** Render-job preset for an export preset. Callers must gate on renderability. */
export function toRenderPreset(id: ExportPresetId): RenderPreset {
  const info = presetInfo(id)
  return { id: info.renderPresetId, resolution: info.resolution }
}
