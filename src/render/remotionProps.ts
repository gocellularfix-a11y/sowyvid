import type { VisualPlan } from '@features/visual/visualPlan'
import type { MediaAsset } from '@shared/domain/media'
import {
  computeVideoPlayback,
  SOURCE_AUDIO_OFF,
  type SourceAudioPolicy,
  type VideoPlayback,
} from './videoPlayback'

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
  /** The asset itself: the real video source for videos, the image for images. */
  url: string
  /** Video poster still — loading underlay and decode-failure fallback. Null if none. */
  posterUrl: string | null
  missing: boolean
  /** Live-playback window; null for images/logos and for missing assets. */
  playback: VideoPlayback | null
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

export interface CompositionPropsOptions {
  /**
   * Source-video audio policy. Omitted → OFF. Only SoundWeave's AudioPlan should
   * ever turn this on, so no imported clip can start making noise by accident.
   */
  sourceAudio?: SourceAudioPolicy
}

export function visualPlanToCompositionProps(
  plan: VisualPlan,
  projectId: string,
  media: readonly MediaAsset[],
  options: CompositionPropsOptions = {},
): CommercialCompositionProps {
  const byId = new Map(media.map((m) => [m.id, m]))
  const sourceAudio = options.sourceAudio ?? SOURCE_AUDIO_OFF

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
      const missing = !asset || !asset.valid
      const isVideo = !missing && kind === 'video'

      // Videos resolve to their REAL source and play live. The poster is kept as
      // the loading underlay / decode-failure fallback — never as the content.
      // Missing assets keep a URL that 404s, so the composition draws its safe
      // placeholder instead of failing.
      return {
        assetId: m.assetId,
        kind,
        url: mediaUrlById(projectId, m.assetId, 'original'),
        posterUrl:
          isVideo && asset.posterRelPath ? mediaUrlById(projectId, m.assetId, 'poster') : null,
        missing,
        playback: isVideo
          ? computeVideoPlayback({
              asset,
              sceneDurationInFrames: scene.durationInFrames,
              fps: plan.fps,
              shotBehavior: scene.shotBehavior,
              sourceAudio,
            })
          : null,
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
