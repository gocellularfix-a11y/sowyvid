import { z } from 'zod'

/**
 * Export presets — platform, aspect ratio and resolution.
 *
 * Pure and renderer-neutral so the choices are testable without rendering.
 * The VisualPlan already fixes the commercial's aspect ratio (FrameLogic laid
 * the text out for it); a preset therefore only selects the OUTPUT SIZE along
 * that same ratio. Re-cropping here would silently move text out of the
 * text-safe frame the plan guaranteed.
 */

export const RenderPresetId = z.enum([
  'instagram-reel',
  'tiktok',
  'youtube-shorts',
  'instagram-feed',
  'youtube',
  'original',
])
export type RenderPresetId = z.infer<typeof RenderPresetId>

export const RenderPreset = z.object({
  id: RenderPresetId,
  /** Long-edge resolution in pixels. */
  resolution: z.union([z.literal(720), z.literal(1080), z.literal(1440), z.literal(1920)]),
})
export type RenderPreset = z.infer<typeof RenderPreset>

export interface PresetInfo {
  id: RenderPresetId
  label: string
  /** Owner-facing note; null when the preset imposes nothing. */
  note: string | null
  aspectRatio: string | null
}

/** Owner-facing catalog (Spanish UI). */
export const RENDER_PRESETS: PresetInfo[] = [
  { id: 'instagram-reel', label: 'Instagram Reel', note: 'Vertical 9:16', aspectRatio: '9:16' },
  { id: 'tiktok', label: 'TikTok', note: 'Vertical 9:16', aspectRatio: '9:16' },
  { id: 'youtube-shorts', label: 'YouTube Shorts', note: 'Vertical 9:16', aspectRatio: '9:16' },
  { id: 'instagram-feed', label: 'Instagram (feed)', note: 'Cuadrado 1:1', aspectRatio: '1:1' },
  { id: 'youtube', label: 'YouTube', note: 'Horizontal 16:9', aspectRatio: '16:9' },
  { id: 'original', label: 'Como se diseñó', note: null, aspectRatio: null },
]

/** H.264 requires even dimensions; odd ones fail to encode. */
function even(n: number): number {
  const rounded = Math.round(n)
  return rounded % 2 === 0 ? rounded : rounded + 1
}

export interface OutputSize {
  width: number
  height: number
}

/**
 * Output size for a preset, preserving the PLAN's aspect ratio.
 *
 * `resolution` is the long edge. The short edge follows from the plan's own
 * ratio, so the exported file matches what the owner previewed — a preset
 * changes how big the file is, never what is in the frame.
 */
export function resolutionFor(preset: RenderPreset, planWidth: number, planHeight: number): OutputSize {
  const long = Math.max(planWidth, planHeight)
  const short = Math.min(planWidth, planHeight)
  const ratio = short / long

  const targetLong = preset.resolution
  const targetShort = even(targetLong * ratio)

  return planHeight >= planWidth
    ? { width: targetShort, height: even(targetLong) } // portrait/square
    : { width: even(targetLong), height: targetShort } // landscape
}

/** Does this preset's expected ratio match the plan's? */
export function presetMatchesPlan(presetId: RenderPresetId, planAspectRatio: string): boolean {
  const info = RENDER_PRESETS.find((p) => p.id === presetId)
  if (!info || info.aspectRatio === null) return true
  return info.aspectRatio === planAspectRatio
}
