import type { VisualPlan, VisualScene } from '@features/visual/visualPlan'
import type { MediaAsset } from '@shared/domain/media'
import type { TextLayoutOverride, TextRole, TextAlignment } from '@shared/domain/textLayout'
import { resolveSceneTextLayouts, type SceneTextInput } from '@features/visual/textLayout'
import {
  computeVideoPlayback,
  SOURCE_AUDIO_OFF,
  type SourceAudioPolicy,
  type VideoPlayback,
} from './videoPlayback'
import type { CompositionAudio } from './remotionAudio'

/** A text element positioned by the CANONICAL layout — identical in preview and export. */
export interface CompositionTextElement {
  role: TextRole
  text: string
  /** Normalized center + size (0..1 of the canvas). Never pixels. */
  x: number
  y: number
  width: number
  scale: number
  alignment: TextAlignment
  custom: boolean
}

/** The scene copy → editable roles a scene actually renders. */
export function sceneTextInput(scene: VisualScene, canvasWidth: number): SceneTextInput {
  const texts: SceneTextInput['texts'] = {}
  if (scene.copy.kicker) texts.subtitle = scene.copy.kicker
  if (scene.copy.headline) texts.headline = scene.copy.headline
  if (scene.copy.body) texts.offer = scene.copy.body
  return {
    sceneId: scene.id,
    texts,
    frame: {
      justifyContent: scene.textFrame.justifyContent,
      textAlign: scene.textFrame.textAlign,
      maxWidth: scene.textFrame.maxWidth,
      translateYPercent: scene.textFrame.translateYPercent,
      canvasWidth,
    },
  }
}

/** Resolve a scene's text elements (auto + overrides) for the composition. */
export function compositionTextElements(
  scene: VisualScene,
  overrides: readonly TextLayoutOverride[],
  aspectRatio: string,
  canvasWidth: number,
): CompositionTextElement[] {
  return resolveSceneTextLayouts(sceneTextInput(scene, canvasWidth), overrides, aspectRatio).map((el) => ({
    role: el.role,
    text: el.text,
    x: el.layout.x,
    y: el.layout.y,
    width: el.layout.width,
    scale: el.layout.scale,
    alignment: el.layout.alignment,
    custom: el.custom,
  }))
}

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
  /** Canonical text placement — the SAME values drive preview and export. */
  textElements: CompositionTextElement[]
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
  /**
   * The soundtrack, from `audioPlanToCompositionAudio`. Null → a silent
   * composition (which is a valid, explicit state — not a failure).
   * Everything here must stay JSON-serializable: `@remotion/renderer` passes
   * inputProps through JSON.
   */
  audio: CompositionAudio | null
}

export interface CompositionPropsOptions {
  /**
   * The soundtrack. Its `sourceAudio` policy ALSO governs whether imported video
   * clips play their own audio — one decision, one source of truth, so the
   * picture and the mix can never disagree about whether source audio is on.
   */
  audio?: CompositionAudio | null
  /**
   * Source-video audio policy for when there is no AudioPlan yet. Ignored when
   * `audio` is supplied (the plan wins). Omitted → OFF.
   */
  sourceAudio?: SourceAudioPolicy
  /** Custom text placements; absent/empty → every element uses automatic layout. */
  textLayouts?: readonly TextLayoutOverride[]
}

export function visualPlanToCompositionProps(
  plan: VisualPlan,
  projectId: string,
  media: readonly MediaAsset[],
  options: CompositionPropsOptions = {},
): CommercialCompositionProps {
  const byId = new Map(media.map((m) => [m.id, m]))
  const audio = options.audio ?? null
  // The AudioPlan is authoritative when present.
  const sourceAudio: SourceAudioPolicy = audio
    ? { enabled: audio.sourceAudio.enabled, volume: audio.sourceAudio.volume }
    : (options.sourceAudio ?? SOURCE_AUDIO_OFF)

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
    media: (() => {
      // Source-audio policy is per SCENE, not per element: when a scene shows
      // more than one clip, only the FIRST video that actually carries audio
      // may sound — everything else stays muted, so clips can never overlap
      // audibly by accident. (Scenes are sequential, so across scenes at most
      // one clip is audible at any frame.)
      let sceneAudioClaimed = false
      return scene.media.map((m) => {
        const asset = byId.get(m.assetId)
        const kind = asset?.kind ?? 'image'
        const missing = !asset || !asset.valid
        const isVideo = !missing && kind === 'video'
        const claimsAudio = isVideo && sourceAudio.enabled && asset.hasAudio && !sceneAudioClaimed
        if (claimsAudio) sceneAudioClaimed = true

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
                sourceAudio: claimsAudio ? sourceAudio : SOURCE_AUDIO_OFF,
              })
            : null,
        }
      })
    })(),
    copy: scene.copy,
    textFrame: scene.textFrame,
    textElements: compositionTextElements(scene, options.textLayouts ?? [], plan.aspectRatio, plan.width),
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
    audio,
  }
}
