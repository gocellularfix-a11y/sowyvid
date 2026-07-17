import { useState, type CSSProperties } from 'react'
import {
  AbsoluteFill,
  Audio,
  Img,
  Loop,
  Freeze,
  OffthreadVideo,
  Sequence,
  useCurrentFrame,
  interpolate,
} from 'remotion'
import type { CommercialCompositionProps, CompositionMedia, CompositionScene } from '../remotionProps'
import { musicVolumeAtFrame, type CompositionAudio } from '../remotionAudio'

/**
 * The SowyVid commercial composition. Renders a VisualPlan (via composition
 * props) with imported media, text layers, motion, and transitions. Media is
 * loaded through the controlled `sowyvid-media://` protocol; missing media draws
 * a safe placeholder rather than failing.
 *
 * This same component backs BOTH the <Player> preview and the production render,
 * so what the owner previews is what they export.
 *
 * Videos play live via <OffthreadVideo>. All trim/loop/freeze/mute decisions are
 * precomputed in `../videoPlayback` — this file only applies them, which keeps
 * the rules unit-testable without mounting Remotion.
 */

const DARK = '#0a0a0f'

function sceneBackground(scene: CompositionScene, colors: string[]): string {
  if (scene.background === 'brand-gradient') {
    const a = colors[0] ?? '#7c5cff'
    const b = colors[1] ?? DARK
    return `linear-gradient(160deg, ${a} 0%, ${b} 100%)`
  }
  if (scene.background === 'brand-solid') return colors[0] ?? '#7c5cff'
  return `radial-gradient(120% 90% at 50% 30%, #16161f 0%, ${DARK} 70%)`
}

/**
 * Safe placeholder for a scene whose media is missing/invalid. Deliberately
 * silent and text-free: it must be harmless if it ever reaches an exported
 * commercial, so it degrades to brand-toned depth rather than announcing an
 * error to the owner's audience.
 */
function MissingMediaPlaceholder({ colors }: { colors: string[] }): JSX.Element {
  const a = colors[0] ?? '#7c5cff'
  return (
    <AbsoluteFill
      data-testid="missing-media-placeholder"
      style={{
        background: `radial-gradient(120% 90% at 50% 35%, ${a}22 0%, ${DARK} 70%)`,
      }}
    />
  )
}

/**
 * Live managed-video layer.
 *
 * Poster (when present) sits underneath as the loading fallback, so the scene is
 * never blank while the clip buffers, and becomes the visible frame if the video
 * fails to decode. If decode fails with no poster, we fall back to the safe
 * placeholder instead of showing a broken element.
 */
function VideoLayer({
  media,
  fit,
  objectPosition,
  colors,
}: {
  media: CompositionMedia
  fit: CSSProperties['objectFit']
  objectPosition: string
  colors: string[]
}): JSX.Element {
  const [failed, setFailed] = useState(false)
  const playback = media.playback

  const fill: CSSProperties = {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: fit,
    objectPosition,
  }

  if (!playback) return <MissingMediaPlaceholder colors={colors} />

  if (failed) {
    return media.posterUrl ? (
      <Img src={media.posterUrl} style={fill} />
    ) : (
      <MissingMediaPlaceholder colors={colors} />
    )
  }

  const video = (
    <OffthreadVideo
      src={media.url}
      trimBefore={playback.trimStartFrame}
      trimAfter={playback.trimEndFrame}
      muted={playback.muted}
      volume={playback.muted ? 0 : playback.volume}
      onError={() => setFailed(true)}
      pauseWhenBuffering
      style={fill}
    />
  )

  // Only short clips need a tail strategy; long clips are already trimmed to the
  // scene window and simply play through.
  const body =
    !playback.shorterThanScene ? (
      video
    ) : playback.behavior === 'loop' ? (
      <Loop durationInFrames={playback.playableFrames} times={playback.loopTimes} layout="none">
        {video}
      </Loop>
    ) : (
      // Play normally, then hold the last real frame for the rest of the scene.
      // `active` as a predicate means the element is never remounted at the seam.
      <Freeze
        frame={Math.max(0, playback.playableFrames - 1)}
        active={(f) => f >= playback.playableFrames}
      >
        {video}
      </Freeze>
    )

  return (
    <>
      {media.posterUrl ? <Img src={media.posterUrl} style={fill} /> : null}
      {body}
    </>
  )
}

function SceneView({
  scene,
  width,
  zoomStart,
  zoomEnd,
  colors,
}: {
  scene: CompositionScene
  width: number
  zoomStart: number
  zoomEnd: number
  colors: string[]
}): JSX.Element {
  const frame = useCurrentFrame()
  const opacity = interpolate(frame, [0, Math.max(1, scene.transitionFrames)], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const scale = interpolate(frame, [0, scene.durationInFrames], [zoomStart, zoomEnd], {
    extrapolateRight: 'clamp',
  })
  // One media layer per scene: the first resolvable asset. This is also what
  // keeps a scene from ever playing two source-audio tracks at once.
  const primary = scene.media.find((m) => !m.missing)
  // The scene wanted media but none of it resolved → safe placeholder.
  const expectsMedia = scene.media.length > 0
  const fit: CSSProperties['objectFit'] = scene.mediaFit === 'contain' ? 'contain' : 'cover'
  const objectPosition =
    scene.focal === 'top' ? 'center top' : scene.focal === 'bottom' ? 'center bottom' : 'center'

  return (
    <AbsoluteFill style={{ opacity, background: sceneBackground(scene, []) }}>
      {primary ? (
        <AbsoluteFill style={{ transform: `scale(${scale})` }}>
          {primary.kind === 'video' ? (
            <VideoLayer media={primary} fit={fit} objectPosition={objectPosition} colors={colors} />
          ) : (
            <Img
              src={primary.url}
              style={{ width: '100%', height: '100%', objectFit: fit, objectPosition }}
            />
          )}
          <AbsoluteFill style={{ background: 'linear-gradient(180deg, transparent 40%, rgba(0,0,0,0.65) 100%)' }} />
        </AbsoluteFill>
      ) : expectsMedia ? (
        <MissingMediaPlaceholder colors={colors} />
      ) : null}

      {/* Text is positioned by the CANONICAL layout (normalized center + width +
          scale + alignment). The same values back the editor overlay, so what the
          owner places is exactly what the export renders. */}
      {scene.textElements.map((el) => (
        <div key={el.role} style={textElementStyle(el, width, scene.emphasis === 'cta')}>
          {el.text}
        </div>
      ))}
    </AbsoluteFill>
  )
}

/** Base font size (px) for a role, before per-element scale. */
const ROLE_FONT_FACTOR: Record<TextElementRole, number> = {
  subtitle: 0.03,
  headline: 0.06,
  offer: 0.032,
  cta: 0.06,
  'business-name': 0.05,
}

interface TextElementRoleStyle {
  color: string
  fontWeight: number
  lineHeight: number
  textShadow?: string
}
const ROLE_STYLE: Record<TextElementRole, TextElementRoleStyle> = {
  subtitle: { color: '#c9b8ff', fontWeight: 600, lineHeight: 1.15 },
  headline: { color: '#fff', fontWeight: 800, lineHeight: 1.05, textShadow: '0 2px 24px rgba(0,0,0,0.5)' },
  offer: { color: '#eee', fontWeight: 500, lineHeight: 1.3 },
  cta: { color: '#fff', fontWeight: 800, lineHeight: 1.05, textShadow: '0 2px 24px rgba(0,0,0,0.5)' },
  'business-name': { color: '#fff', fontWeight: 700, lineHeight: 1.1 },
}

type TextElementRole = CommercialCompositionProps['scenes'][number]['textElements'][number]['role']

function textElementStyle(
  el: CommercialCompositionProps['scenes'][number]['textElements'][number],
  width: number,
  ctaEmphasis: boolean,
): CSSProperties {
  const role = el.role
  const base = ROLE_FONT_FACTOR[role] * (role === 'headline' && ctaEmphasis ? 1.15 : 1)
  const style = ROLE_STYLE[role]
  return {
    position: 'absolute',
    left: `${el.x * 100}%`,
    top: `${el.y * 100}%`,
    width: `${el.width * 100}%`,
    transform: 'translate(-50%, -50%)',
    textAlign: el.alignment,
    fontSize: Math.round(width * base * el.scale),
    color: style.color,
    fontWeight: style.fontWeight,
    lineHeight: style.lineHeight,
    ...(style.textShadow ? { textShadow: style.textShadow } : {}),
    // Wrapping is part of the canonical layout — same box width in both surfaces.
    overflowWrap: 'break-word',
    whiteSpace: 'pre-wrap',
  }
}

/**
 * The commercial's soundtrack. Every timing decision here came from SoundWeave
 * via the AudioPlan; this component only mounts elements.
 */
function CommercialAudio({ audio }: { audio: CompositionAudio }): JSX.Element | null {
  if (audio.silent) return null
  return (
    <>
      {audio.music ? (
        <Audio
          src={audio.music.url}
          trimBefore={audio.music.trimStartFrame}
          loop={audio.music.loop}
          // REQUIRED with loop: Remotion resets useCurrentFrame() on each loop
          // iteration, so the default ("repeat") would re-run the fade-out every
          // pass and evaluate ducking at the wrong frame. "extend" gives the
          // volume function the continuous timeline frame it expects.
          loopVolumeCurveBehavior="extend"
          volume={(f) => musicVolumeAtFrame(f, audio)}
        />
      ) : null}

      {audio.narration.map((track, i) => (
        <Sequence
          key={`narration-${i}`}
          from={track.startFrame}
          durationInFrames={track.durationInFrames}
          layout="none"
        >
          <Audio src={track.url} trimBefore={track.trimStartFrame} volume={track.volume * audio.masterVolume} />
        </Sequence>
      ))}

      {audio.effects.map((track, i) => (
        <Sequence
          key={`effect-${i}`}
          from={track.startFrame}
          durationInFrames={track.durationInFrames}
          layout="none"
        >
          <Audio src={track.url} trimBefore={track.trimStartFrame} volume={track.volume * audio.masterVolume} />
        </Sequence>
      ))}
    </>
  )
}

export function CommercialComposition(props: CommercialCompositionProps): JSX.Element {
  const { scenes, width, brandColors, motion, audio } = props
  return (
    <AbsoluteFill style={{ background: DARK, fontFamily: 'Inter, Segoe UI, sans-serif' }}>
      {audio ? <CommercialAudio audio={audio} /> : null}
      {scenes.map((scene) => (
        <Sequence key={scene.id} from={scene.from} durationInFrames={scene.durationInFrames}>
          <AbsoluteFill style={{ background: sceneBackground(scene, brandColors) }}>
            <SceneView
              scene={scene}
              width={width}
              zoomStart={motion.zoomStart}
              zoomEnd={motion.zoomEnd}
              colors={brandColors}
            />
          </AbsoluteFill>
        </Sequence>
      ))}
    </AbsoluteFill>
  )
}
