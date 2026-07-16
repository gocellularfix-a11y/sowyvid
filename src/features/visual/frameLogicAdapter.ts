import { createVisualDirectionPlan } from '@jorge-engines/framelogic-visual'
import type { CommercialRenderPlan } from '@jorge-engines/northstar-creative'
import type { BrandPreferences } from '@shared/domain/project'
import type { MediaAsset } from '@shared/domain/media'
import { VisualPlanSchema, VISUAL_PLAN_VERSION, type VisualPlan, type VisualScene } from './visualPlan'

const VISUAL_ENGINE_NAME = '@jorge-engines/framelogic-visual'
const VISUAL_ENGINE_VERSION = '1.0.0'

/** Map FrameLogic art-direction names to a coarse tone hint. */
const TONE_BY_ART: Record<string, string> = {
  'premium-dark': 'premium',
  'urgent-sale': 'bold',
  'clean-modern': 'clean',
  'retail-energy': 'bold',
  'social-reel': 'bold',
}

const RATIO_BY_INTENT: Record<string, string> = {
  vertical_social: '9:16',
  story: '9:16',
  portrait_video: '4:5',
  square_social: '1:1',
  landscape_video: '16:9',
  generic: '16:9',
}

function framesFor(sec: number, fps: number): number {
  return Math.max(1, Math.round(sec * fps))
}

function compositionBiasFor(role: string): 'hero' | 'editorial' | 'balanced' {
  if (role === 'hook' || role === 'cta' || role === 'intro') return 'hero'
  if (role === 'problem' || role === 'proof' || role === 'testimonial') return 'editorial'
  return 'balanced'
}
function verticalAnchorFor(role: string): 'top' | 'center' | 'bottom' {
  if (role === 'cta' || role === 'hook') return 'bottom'
  return 'center'
}
function emphasisFor(role: string): string {
  if (role === 'cta') return 'cta'
  if (role === 'offer' || role === 'announcement') return 'offer'
  if (role === 'hook') return 'hook'
  if (role === 'proof' || role === 'testimonial') return 'proof'
  return 'none'
}

export interface BuildVisualPlanInput {
  renderPlan: CommercialRenderPlan
  brand: BrandPreferences
  media: readonly MediaAsset[]
  /** Optional industry hint (project category) for art/grade selection. */
  industry?: string
}

/**
 * ProjectRenderPlan → FrameLogic → validated VisualPlan. FrameLogic produces
 * renderer-neutral visual direction; this adapter merges it with Northstar's
 * timeline/copy/media into SowyVid's VisualPlan. No Remotion here.
 */
export function buildVisualPlan(input: BuildVisualPlanInput): VisualPlan {
  const { renderPlan, brand, media, industry } = input
  const fps = renderPlan.platform.fps
  const width = renderPlan.platform.width
  const height = renderPlan.platform.height
  const artName = renderPlan.creativeDirection.artDirection.replace(/_/g, '-')
  const tone = TONE_BY_ART[artName]
  const seed = renderPlan.conceptId

  const kindById = new Map(media.map((m) => [m.id, m.kind]))
  const hasBrandColors = brand.colors.length > 0

  const flScenes = renderPlan.scenes.map((s) => {
    const anyVideo = s.media.some((m) => kindById.get(m.assetId) === 'video')
    return {
      role: s.role,
      hasMedia: s.media.length > 0,
      kind: (anyVideo ? 'video' : 'image') as 'image' | 'video',
      caption: s.copy.headline,
    }
  })

  const flTextFrames = renderPlan.scenes.map((s) => {
    const bias = compositionBiasFor(s.role)
    return {
      role: s.role,
      compositionBias: bias,
      verticalAnchor: verticalAnchorFor(s.role),
      safeZone: bias,
      alignment: 'center' as const,
      width,
      height,
      contentWidth: 0.8,
    }
  })

  const fd = createVisualDirectionPlan({
    art: { name: artName, ...(industry ? { industry } : {}) },
    ...(tone ? { tone } : {}),
    seed,
    scenes: flScenes,
    textFrames: flTextFrames,
  })

  let cursor = 0
  const scenes: VisualScene[] = renderPlan.scenes.map((s, i) => {
    const durationInFrames = framesFor(s.durationSec, fps)
    const startFrame = cursor
    cursor += durationInFrames
    const layout = fd.scenes[i] ?? null
    const textFrame = fd.textFrames[i]!
    const crop = layout?.crop ?? null
    return {
      id: s.id,
      order: i,
      role: s.role,
      beatPurpose: s.beatPurpose,
      startFrame,
      durationInFrames,
      transitionIn: s.transitionIn,
      transitionFrames: fd.motion.transitionFrames,
      media: s.media.map((m) => ({ slotRole: m.slotRole, assetId: m.assetId })),
      mediaFit: 'cover',
      placement: layout?.placement ?? null,
      crop,
      focal: crop ?? 'center',
      shotBehavior: s.shotBehavior,
      motion: s.motion,
      grade: layout?.grade ?? null,
      textFrame,
      copy: s.copy,
      emphasis: emphasisFor(s.role),
      background: s.media.length > 0 ? 'media' : hasBrandColors ? 'brand-gradient' : 'dark',
    }
  })

  const plan: VisualPlan = {
    version: VISUAL_PLAN_VERSION,
    visualEngineName: VISUAL_ENGINE_NAME,
    visualEngineVersion: VISUAL_ENGINE_VERSION,
    visualProfileVersion: fd.version,
    projectId: renderPlan.projectId,
    conceptId: renderPlan.conceptId,
    aspectRatio: RATIO_BY_INTENT[renderPlan.platform.intent] ?? '9:16',
    width,
    height,
    fps,
    totalDurationInFrames: cursor,
    artDirection: fd.artDirection,
    motion: fd.motion,
    brandColors: brand.colors,
    scenes,
  }

  return VisualPlanSchema.parse(plan)
}
