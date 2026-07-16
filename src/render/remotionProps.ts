import type { VisualPlan } from '@features/visual/visualPlan'
import type { MediaAsset } from '@shared/domain/media'

// Canonical controlled media URL (mirrors src/app/mediaUrl.ts + mediaProtocol.ts).
function mediaUrlById(projectId: string, mediaId: string, variant: 'original' | 'poster' | 'thumb'): string {
  return `sowyvid-media://asset/${projectId}/${mediaId}/${variant}`
}

/**
 * SowyVid Remotion adapter: VisualPlan → composition input props. This is the
 * ONLY place Remotion-facing shapes are produced; FrameLogic and the VisualPlan
 * stay renderer-neutral. Media is referenced by controlled `sowyvid-media://`
 * URLs (stable IDs), never raw paths; missing/invalid media is flagged so the
 * composition can draw a safe placeholder instead of failing.
 */

export interface CompositionMedia {
  assetId: string
  kind: MediaAsset['kind']
  url: string
  missing: boolean
}

export interface CompositionScene {
  id: string
  from: number
  durationInFrames: number
  role: string
  background: VisualPlan['scenes'][number]['background']
  transitionIn: string
  transitionFrames: number
  placement: VisualPlan['scenes'][number]['placement']
  focal: VisualPlan['scenes'][number]['focal']
  mediaFit: VisualPlan['scenes'][number]['mediaFit']
  media: CompositionMedia[]
  copy: VisualPlan['scenes'][number]['copy']
  textFrame: VisualPlan['scenes'][number]['textFrame']
  emphasis: string
}

// A `type` (not `interface`) so it satisfies Remotion's `Record<string, unknown>`
// props constraint.
export type CommercialCompositionProps = {
  width: number
  height: number
  fps: number
  durationInFrames: number
  brandColors: string[]
  palette: VisualPlan['artDirection']['palette']
  motion: VisualPlan['motion']
  scenes: CompositionScene[]
}

export function visualPlanToCompositionProps(
  plan: VisualPlan,
  projectId: string,
  media: readonly MediaAsset[],
): CommercialCompositionProps {
  const byId = new Map(media.map((m) => [m.id, m]))

  const scenes: CompositionScene[] = plan.scenes.map((scene) => ({
    id: scene.id,
    from: scene.startFrame,
    durationInFrames: scene.durationInFrames,
    role: scene.role,
    background: scene.background,
    transitionIn: scene.transitionIn,
    transitionFrames: scene.transitionFrames,
    placement: scene.placement,
    focal: scene.focal,
    mediaFit: scene.mediaFit,
    media: scene.media.map((m) => {
      const asset = byId.get(m.assetId)
      const kind = asset?.kind ?? 'image'
      const variant = kind === 'video' ? 'poster' : 'original'
      const missing = !asset || !asset.valid
      return {
        assetId: m.assetId,
        kind,
        // Videos: prefer the poster for the preview still; the player can swap to
        // the video source. Missing assets get a URL that resolves to 404 → the
        // composition renders a placeholder instead.
        url: mediaUrlById(projectId, m.assetId, missing ? 'original' : variant),
        missing,
      }
    }),
    copy: scene.copy,
    textFrame: scene.textFrame,
    emphasis: scene.emphasis,
  }))

  return {
    width: plan.width,
    height: plan.height,
    fps: plan.fps,
    durationInFrames: plan.totalDurationInFrames,
    brandColors: plan.brandColors,
    palette: plan.artDirection.palette,
    motion: plan.motion,
    scenes,
  }
}
