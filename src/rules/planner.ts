import type { Project, CommercialBrief } from '@shared/domain/project'
import type { Template, SceneSlot } from '@shared/domain/template'
import type { EnergyLevel, AspectRatio } from '@shared/domain/enums'
import {
  ScenePlan,
  type Scene,
  type TextLayer,
  type MediaMotion,
  type TextRole,
} from '@shared/domain/scenePlan'
import { ENGINE_VERSION, FPS, resolveDimensions } from './dimensions'
import { scoreMedia } from './mediaScoring'
import { hashInputs } from './hash'
import { textForRole, emphasisForRole } from './text'

const TRANSITION_FRAMES: Record<EnergyLevel, number> = {
  calm: 15,
  balanced: 10,
  energetic: 6,
}

interface IncludedSlot {
  slot: SceneSlot
  mediaId: string | null
}

/**
 * The deterministic commercial engine. Given a project + template, it produces a
 * fully-resolved ScenePlan with NO AI and NO randomness. Identical inputs +
 * templateVersion + ENGINE_VERSION always yield an identical plan.
 * See docs/COMMERCIAL-RULE-ENGINE.md.
 */
export function generateScenePlan(project: Project, template: Template): ScenePlan {
  const aspectRatio = pickAspectRatio(project.video.aspectRatio, template)
  const { width, height } = resolveDimensions(aspectRatio, project.render.resolution)
  const brief = project.brief
  const energy = project.video.energy

  // Deterministically ordered media queue (best-fit first).
  const scored = scoreMedia(project.media, aspectRatio)
  const mediaQueue = scored.map((s) => s.mediaId)

  const included = selectSlots(template.sceneStructure, brief, mediaQueue, template)
  const durations = distributeDurations(
    included.map((e) => e.slot),
    project.video.targetDurationSec,
  )

  const scenes: Scene[] = included.map((entry, i) => {
    const durationFrames = Math.max(1, Math.round((durations[i] ?? 1) * FPS))
    const layers = buildLayers(entry.slot, brief, template)
    return {
      id: `scene_${i}`,
      index: i,
      type: entry.slot.type,
      durationFrames,
      mediaId: entry.mediaId,
      mediaMotion: motionFor(entry, i, energy),
      transitionIn: i === 0 ? 'fade' : entry.slot.transitionIn,
      transitionFrames: i === 0 ? TRANSITION_FRAMES[energy] : TRANSITION_FRAMES[energy],
      textLayers: layers,
      background: entry.mediaId
        ? 'media'
        : project.brand.colors.length > 0
          ? 'brand-gradient'
          : 'dark',
    }
  })

  const totalFrames = scenes.reduce((sum, s) => sum + s.durationFrames, 0)

  const normalized = {
    engineVersion: ENGINE_VERSION,
    templateId: template.id,
    templateVersion: template.version,
    aspectRatio,
    resolution: project.render.resolution,
    energy,
    targetDurationSec: project.video.targetDurationSec,
    brief,
    brandColors: project.brand.colors,
    mediaOrder: mediaQueue,
  }

  return ScenePlan.parse({
    engineVersion: ENGINE_VERSION,
    templateId: template.id,
    templateVersion: template.version,
    aspectRatio,
    width,
    height,
    fps: FPS,
    motionProfile: template.motionProfile,
    totalFrames,
    scenes,
    inputsHash: hashInputs(normalized),
  })
}

function pickAspectRatio(requested: AspectRatio, template: Template): AspectRatio {
  if (template.supportedAspectRatios.includes(requested)) return requested
  // Fallback: first supported ratio (templates always list at least one).
  return template.supportedAspectRatios[0] as AspectRatio
}

function selectSlots(
  structure: SceneSlot[],
  brief: CommercialBrief,
  mediaQueue: string[],
  template: Template,
): IncludedSlot[] {
  const queue = [...mediaQueue]
  const included: IncludedSlot[] = []
  for (const slot of structure) {
    if (slot.requiresMedia) {
      const next = queue.shift()
      if (next) {
        included.push({ slot, mediaId: next })
      } else if (!slot.optional) {
        // Required structural slot with no media → keep as branded text scene.
        included.push({ slot, mediaId: null })
      }
      // optional media slot with no media → skipped (fallback behavior)
    } else {
      const hasText = slot.textRoles.some((r) => textForRole(r, brief, template.textLimits) !== null)
      if (slot.optional && !hasText) continue
      included.push({ slot, mediaId: null })
    }
  }
  // Guarantee a valid commercial: never return zero scenes.
  if (included.length === 0 && structure.length > 0) {
    included.push({ slot: structure[0] as SceneSlot, mediaId: mediaQueue[0] ?? null })
  }
  return included
}

function buildLayers(slot: SceneSlot, brief: CommercialBrief, template: Template): TextLayer[] {
  const layers: TextLayer[] = []
  const anchors = anchorPlan(slot.textRoles)
  slot.textRoles.forEach((role, idx) => {
    const text = textForRole(role, brief, template.textLimits)
    if (text === null) return
    layers.push({
      role,
      text,
      anchor: anchors[idx] ?? 'center',
      emphasis: emphasisForRole(role),
    })
  })
  return layers
}

/** Distribute anchors so multiple layers don't overlap (top→center→bottom). */
function anchorPlan(roles: TextRole[]): Array<'top' | 'center' | 'bottom'> {
  if (roles.length <= 1) return ['center']
  if (roles.length === 2) return ['center', 'bottom']
  return roles.map((_, i) => (i === 0 ? 'top' : i === roles.length - 1 ? 'bottom' : 'center'))
}

function motionFor(entry: IncludedSlot, index: number, energy: EnergyLevel): MediaMotion {
  if (!entry.mediaId) return 'none'
  const preferred = entry.slot.preferredMotion
  // Alternate ken-burns direction by scene parity for non-repetitive motion.
  if (preferred === 'ken-burns-in' && index % 2 === 1) return 'ken-burns-out'
  // Calm energy softens strong pans into gentle ken-burns.
  if (energy === 'calm' && (preferred === 'pan-left' || preferred === 'pan-right')) {
    return 'ken-burns-in'
  }
  return preferred
}

/**
 * Distribute per-scene durations to approximate the target total, clamped to
 * each slot's [min,max]. Deterministic; total is close to (not forced exactly)
 * the target so per-scene bounds are always respected.
 */
export function distributeDurations(slots: SceneSlot[], targetSec: number): number[] {
  if (slots.length === 0) return []
  const base = slots.map((s) => (s.minDurationSec + s.maxDurationSec) / 2)
  const baseSum = base.reduce((a, b) => a + b, 0)
  const scale = baseSum > 0 ? targetSec / baseSum : 1
  return slots.map((s, i) => {
    const scaled = (base[i] ?? 0) * scale
    return Number(Math.min(s.maxDurationSec, Math.max(s.minDurationSec, scaled)).toFixed(3))
  })
}
