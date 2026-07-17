import {
  TEXT_ROLES,
  MIN_WIDTH,
  MAX_WIDTH,
  MIN_SCALE,
  MAX_SCALE,
  type TextRole,
  type TextAlignment,
  type TextLayout,
  type TextLayoutOverride,
} from '@shared/domain/textLayout'

export {
  TEXT_ROLES,
  MIN_WIDTH,
  MAX_WIDTH,
  MIN_SCALE,
  MAX_SCALE,
  type TextRole,
  type TextAlignment,
  type TextLayout,
  type TextLayoutOverride,
}

/**
 * Pure text-layout LOGIC over the canonical domain model
 * (`@shared/domain/textLayout`): automatic layout, safe areas, clamping,
 * snapping, resolution (auto + overrides), and the copy/reset editors. Shared
 * by the preview and the export so both agree exactly.
 */

/** Platform-safe content margins (fractions of each dimension) per format. */
export function safeArea(aspectRatio: string): { top: number; bottom: number; left: number; right: number } {
  switch (aspectRatio) {
    case '9:16':
      // Vertical reels keep the UI clear of the top status and bottom caption/CTA.
      return { top: 0.1, bottom: 0.16, left: 0.06, right: 0.06 }
    case '16:9':
      return { top: 0.08, bottom: 0.08, left: 0.05, right: 0.05 }
    case '1:1':
    case '4:5':
    default:
      return { top: 0.08, bottom: 0.1, left: 0.07, right: 0.07 }
  }
}

const VERTICAL_ANCHOR: Record<string, number> = { 'flex-start': 0.26, center: 0.5, 'flex-end': 0.74 }
/** Vertical stacking offsets (fraction of height) so elements don't overlap. */
const ROLE_STACK: Record<TextRole, number> = {
  subtitle: -0.11,
  headline: 0,
  offer: 0.12,
  cta: 0.12,
  'business-name': 0.24,
}

export interface AutoLayoutInput {
  justifyContent: 'flex-start' | 'center' | 'flex-end'
  textAlign: TextAlignment
  maxWidth: number
  translateYPercent: number
  /** Canvas width in px, to normalize maxWidth. */
  canvasWidth: number
}

/**
 * The deterministic automatic layout for a role, derived from the scene's
 * textFrame. Identical inputs → identical layout, so preview and export agree
 * and a project without overrides is unchanged.
 */
export function autoTextLayout(role: TextRole, input: AutoLayoutInput): TextLayout {
  const anchorY = VERTICAL_ANCHOR[input.justifyContent] ?? 0.5
  const y = clamp01(anchorY + input.translateYPercent / 100 * 0.12 + ROLE_STACK[role])
  const width = clamp(input.maxWidth / Math.max(1, input.canvasWidth), MIN_WIDTH, MAX_WIDTH)
  return { x: 0.5, y, width, scale: 1, alignment: input.textAlign }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}
export function clamp01(v: number): number {
  return clamp(v, 0, 1)
}

/**
 * Keep a layout's CENTER inside the safe area (with a little slack so a wide
 * block is not shoved around), and never let the block become unreachable. The
 * center always stays on-canvas.
 */
export function clampToSafe(layout: TextLayout, aspectRatio: string): TextLayout {
  const s = safeArea(aspectRatio)
  return {
    ...layout,
    x: clamp(layout.x, s.left, 1 - s.right),
    y: clamp(layout.y, s.top, 1 - s.bottom),
  }
}

/** True when any edge of the block sits outside the platform-safe area. */
export function isUnsafe(layout: TextLayout, aspectRatio: string): boolean {
  const s = safeArea(aspectRatio)
  const halfW = layout.width / 2
  const left = layout.x - halfW
  const right = layout.x + halfW
  return left < s.left - 0.001 || right > 1 - s.right + 0.001 || layout.y < s.top - 0.001 || layout.y > 1 - s.bottom + 0.001
}

export interface SnapResult {
  layout: TextLayout
  /** Guides that became active, so the editor can draw them. */
  guides: { vertical: number[]; horizontal: number[] }
}

/** Snap threshold in normalized units (gentle). */
export const SNAP_THRESHOLD = 0.02

/**
 * Gently snap a dragged layout to: the horizontal/vertical center, the safe-area
 * edges, and the X of any nearby sibling element (alignment). Snapping is soft
 * and can be disabled by the caller (modifier key) by passing `enabled: false`.
 */
export function snapLayout(
  layout: TextLayout,
  aspectRatio: string,
  siblingXs: number[] = [],
  enabled = true,
): SnapResult {
  if (!enabled) return { layout, guides: { vertical: [], horizontal: [] } }
  const s = safeArea(aspectRatio)
  const vertical: number[] = []
  const horizontal: number[] = []

  let x = layout.x
  const xTargets = [0.5, s.left + layout.width / 2, 1 - s.right - layout.width / 2, ...siblingXs]
  for (const t of xTargets) {
    if (Math.abs(x - t) <= SNAP_THRESHOLD) {
      x = t
      vertical.push(t)
      break
    }
  }

  let y = layout.y
  const yTargets = [0.5, s.top, 1 - s.bottom]
  for (const t of yTargets) {
    if (Math.abs(y - t) <= SNAP_THRESHOLD) {
      y = t
      horizontal.push(t)
      break
    }
  }

  return { layout: { ...layout, x, y }, guides: { vertical, horizontal } }
}

/** A resolved text element ready for rendering (auto or overridden). */
export interface ResolvedTextElement {
  role: TextRole
  text: string
  layout: TextLayout
  /** True when this element carries a custom override (vs automatic). */
  custom: boolean
  locked: boolean
}

/** The copy pieces a scene renders, mapped to editable roles (in stack order). */
export interface SceneTextInput {
  sceneId: string
  /** role → text; only non-empty entries become editable elements. */
  texts: Partial<Record<TextRole, string>>
  frame: AutoLayoutInput
}

function findOverride(
  overrides: readonly TextLayoutOverride[],
  sceneId: string,
  role: TextRole,
  aspectRatio: string,
): TextLayoutOverride | undefined {
  return overrides.find((o) => o.sceneId === sceneId && o.role === role && o.aspectRatio === aspectRatio)
}

/**
 * Resolve every editable text element of a scene for a given aspect ratio:
 * automatic layout merged with any custom override. This is the SHARED helper
 * the preview and the export both call — there is no second implementation.
 */
export function resolveSceneTextLayouts(
  scene: SceneTextInput,
  overrides: readonly TextLayoutOverride[],
  aspectRatio: string,
): ResolvedTextElement[] {
  const out: ResolvedTextElement[] = []
  for (const role of TEXT_ROLES) {
    const text = scene.texts[role]
    if (!text) continue
    const override = findOverride(overrides, scene.sceneId, role, aspectRatio)
    const layout = override
      ? clampToSafe({ x: override.x, y: override.y, width: override.width, scale: override.scale, alignment: override.alignment }, aspectRatio)
      : clampToSafe(autoTextLayout(role, scene.frame), aspectRatio)
    out.push({ role, text, layout, custom: Boolean(override), locked: override?.locked ?? false })
  }
  return out
}

/** Upsert one element's override (clamped + safe). Returns a new array. */
export function upsertOverride(
  overrides: readonly TextLayoutOverride[],
  key: { sceneId: string; role: TextRole; aspectRatio: string },
  layout: TextLayout,
  locked = false,
): TextLayoutOverride[] {
  const safe = clampToSafe(
    {
      x: clamp01(layout.x),
      y: clamp01(layout.y),
      width: clamp(layout.width, MIN_WIDTH, MAX_WIDTH),
      scale: clamp(layout.scale, MIN_SCALE, MAX_SCALE),
      alignment: layout.alignment,
    },
    key.aspectRatio,
  )
  const next = overrides.filter((o) => !(o.sceneId === key.sceneId && o.role === key.role && o.aspectRatio === key.aspectRatio))
  next.push({ ...key, ...safe, locked })
  return next
}

/** Remove one element's override → it returns to automatic. */
export function resetElement(
  overrides: readonly TextLayoutOverride[],
  key: { sceneId: string; role: TextRole; aspectRatio: string },
): TextLayoutOverride[] {
  return overrides.filter((o) => !(o.sceneId === key.sceneId && o.role === key.role && o.aspectRatio === key.aspectRatio))
}

/** Remove every override for one scene+format → the whole scene's text resets. */
export function resetScene(
  overrides: readonly TextLayoutOverride[],
  sceneId: string,
  aspectRatio: string,
): TextLayoutOverride[] {
  return overrides.filter((o) => !(o.sceneId === sceneId && o.aspectRatio === aspectRatio))
}

/**
 * Copy one element's placement (position/width/scale/alignment — NOT its text)
 * to the same role in the target scenes, for the same aspect ratio.
 */
export function copyLayoutToScenes(
  overrides: readonly TextLayoutOverride[],
  source: { sceneId: string; role: TextRole; aspectRatio: string },
  sourceLayout: TextLayout,
  targetSceneIds: readonly string[],
): TextLayoutOverride[] {
  let next = [...overrides]
  for (const sceneId of targetSceneIds) {
    if (sceneId === source.sceneId) continue
    next = upsertOverride(next, { sceneId, role: source.role, aspectRatio: source.aspectRatio }, sourceLayout)
  }
  return next
}
