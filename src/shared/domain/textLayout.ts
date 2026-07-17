import { z } from 'zod'

/**
 * Canonical text-layout DOMAIN types — the persisted contract for where a
 * scene's text sits. Positions are NORMALIZED (0..1 of the canvas), never
 * pixels, so a layout is valid at any resolution and the owner never types
 * coordinates. Only CUSTOMIZED elements are stored; everything else uses the
 * deterministic automatic layout (see `@features/visual/textLayout`).
 *
 * Overrides are keyed by (sceneId, role, aspectRatio): a 9:16 customization does
 * NOT bleed into 1:1 or 16:9 (§8, option A — independent per format).
 */

/** The editable text elements. Map to the copy a scene actually renders. */
export const TEXT_ROLES = ['subtitle', 'headline', 'offer', 'cta', 'business-name'] as const
export const TextRole = z.enum(TEXT_ROLES)
export type TextRole = z.infer<typeof TextRole>

export const TextAlignment = z.enum(['left', 'center', 'right'])
export type TextAlignment = z.infer<typeof TextAlignment>

/** Hard bounds so a persisted layout can never be absurd or fully offscreen. */
export const MIN_WIDTH = 0.1
export const MAX_WIDTH = 0.96
export const MIN_SCALE = 0.5
export const MAX_SCALE = 2.5

const norm01 = z.number().min(0).max(1)

/** The placement of one text element. */
export const TextLayout = z.object({
  x: norm01, // center X, 0..1
  y: norm01, // center Y, 0..1
  width: z.number().min(MIN_WIDTH).max(MAX_WIDTH),
  scale: z.number().min(MIN_SCALE).max(MAX_SCALE),
  alignment: TextAlignment,
})
export type TextLayout = z.infer<typeof TextLayout>

/** A persisted per-scene, per-format override for one text element. */
export const TextLayoutOverride = TextLayout.extend({
  sceneId: z.string().min(1),
  role: TextRole,
  /** '9:16' | '1:1' | '16:9' — overrides are isolated per aspect ratio. */
  aspectRatio: z.string().min(1),
  locked: z.boolean().default(false),
})
export type TextLayoutOverride = z.infer<typeof TextLayoutOverride>
