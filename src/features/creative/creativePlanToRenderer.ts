import type { CommercialRenderPlan } from '@jorge-engines/northstar-creative'
import { adaptRenderPlan } from '@jorge-engines/northstar-creative'
import { remotionAdapter } from '@jorge-engines/northstar-creative/remotion'

/**
 * CreativePlanToRendererAdapter.
 *
 * Maps the engine's renderer-neutral `CommercialRenderPlan` into a SowyVid
 * renderer plan: frame-accurate scene ranges (via the engine's Remotion frame
 * adapter) plus resolution of engine media IDs into managed asset references.
 *
 * The engine core never imports Remotion; this app-side adapter is the only
 * place that bridges the neutral plan toward the future SowyVid renderer. The
 * actual Remotion renderer is NOT built in this sprint — only this contract.
 */

export interface ResolvedMediaRef {
  slotRole: string
  assetId: string
  /** Managed asset reference (relative path / URL), or null if unresolved. */
  resolvedRef: string | null
}

export interface SowyvidRendererScene {
  id: string
  from: number
  durationInFrames: number
  role: string
  beatPurpose: string
  transitionIn: string
  shotBehavior: string
  motion: string
  copy: { kicker: string; headline: string; body: string; caption: string; spokenText: string }
  media: ResolvedMediaRef[]
  fallbackQuery: string
}

export interface SowyvidRendererPlan {
  rendererId: 'sowyvid-renderer-plan-v1'
  projectId: string
  conceptId: string
  family: string
  variantId: string
  width: number
  height: number
  fps: number
  durationInFrames: number
  scenes: SowyvidRendererScene[]
  creativeDirection: CommercialRenderPlan['creativeDirection']
  audioDirection: CommercialRenderPlan['audioDirection']
  warnings: string[]
}

/** Resolves an engine media ID to a managed asset reference, or null. */
export type AssetResolver = (assetId: string) => string | null

const noResolve: AssetResolver = () => null

export function creativePlanToRenderer(
  plan: CommercialRenderPlan,
  resolveAsset: AssetResolver = noResolve,
): SowyvidRendererPlan {
  const frames = adaptRenderPlan(plan, remotionAdapter)
  return {
    rendererId: 'sowyvid-renderer-plan-v1',
    projectId: plan.projectId,
    conceptId: plan.conceptId,
    family: plan.family,
    variantId: plan.variantId,
    width: frames.width,
    height: frames.height,
    fps: frames.fps,
    durationInFrames: frames.durationInFrames,
    scenes: frames.scenes.map((scene) => ({
      id: scene.id,
      from: scene.from,
      durationInFrames: scene.durationInFrames,
      role: scene.role,
      beatPurpose: scene.beatPurpose,
      transitionIn: scene.transitionIn,
      shotBehavior: scene.shotBehavior,
      motion: scene.motion,
      copy: scene.copy,
      media: scene.media.map((m) => ({
        slotRole: m.slotRole,
        assetId: m.assetId,
        resolvedRef: resolveAsset(m.assetId),
      })),
      fallbackQuery: scene.fallbackQuery,
    })),
    creativeDirection: frames.creativeDirection,
    audioDirection: frames.audioDirection,
    warnings: frames.warnings,
  }
}
