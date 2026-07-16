import type { MediaAsset } from '@shared/domain/media'

/**
 * Live managed-video playback rules — pure, renderer-neutral, and deliberately
 * free of React/Remotion imports so every boundary below is unit-testable
 * without mounting a composition.
 *
 * A scene asks for `sceneDurationInFrames`. The source clip rarely matches:
 *
 *   longer  → trim to the scene (never read past the requested window)
 *   shorter → an INTENTIONAL, plan-defined fallback (loop or freeze) so the
 *             scene is never left blank or black
 *
 * Source-video audio is OFF unless a caller explicitly enables it (SoundWeave's
 * AudioPlan owns that decision). Silence is the default so no clip can start
 * making noise by accident.
 */

/** What to do when the source clip runs out before the scene does. */
export type ShortClipBehavior = 'loop' | 'freeze'

export interface SourceAudioPolicy {
  /** Source audio plays ONLY when this is explicitly true. */
  enabled: boolean
  /** 0..1, applied only when `enabled` and the asset actually has an audio track. */
  volume: number
}

/** The safe default: managed video is silent until something opts in. */
export const SOURCE_AUDIO_OFF: SourceAudioPolicy = { enabled: false, volume: 0 }

export interface VideoPlayback {
  /** First source frame shown. Always a valid position inside the source. */
  trimStartFrame: number
  /** Exclusive end of the source window actually consumed. */
  trimEndFrame: number
  /** Frames of real video available to the scene (trimEnd - trimStart). */
  playableFrames: number
  /** Frames the scene needs to fill. */
  sceneDurationInFrames: number
  /** Total source length in composition frames; null when analysis gave us no duration. */
  sourceDurationInFrames: number | null
  /** True when real video runs out before the scene ends → `behavior` covers the rest. */
  shorterThanScene: boolean
  /** Plan-defined fallback for the uncovered tail. */
  behavior: ShortClipBehavior
  /** Bounded loop count. 1 unless `behavior` is 'loop' and the clip is short. */
  loopTimes: number
  /** True unless source audio was explicitly enabled AND the asset has audio. */
  muted: boolean
  /** 0 when muted. */
  volume: number
}

/**
 * Northstar's shot intent decides how a short clip fills its scene.
 *
 * `rapid_montage` is the one behavior whose whole point is repeated, cut-driven
 * motion, so restarting the clip reads as intentional. Every other shot is a
 * considered hold/push/pull where a jump back to frame 0 would look like a
 * glitch — those freeze on their final frame instead. Freeze is the default for
 * unknown behaviors: a still is always safe, a surprise loop is not.
 */
export function shortClipBehaviorFor(shotBehavior: string): ShortClipBehavior {
  return shotBehavior === 'rapid_montage' ? 'loop' : 'freeze'
}

/** Source length in COMPOSITION frames (Remotion trims in composition frames). */
export function sourceDurationInFrames(asset: MediaAsset, fps: number): number | null {
  if (asset.durationSec === null || !Number.isFinite(asset.durationSec)) return null
  if (asset.durationSec <= 0) return null
  // Floor: never claim a frame the source may not contain.
  return Math.max(1, Math.floor(asset.durationSec * fps))
}

export interface ComputeVideoPlaybackInput {
  asset: MediaAsset
  sceneDurationInFrames: number
  fps: number
  /** Northstar shot intent for the scene (drives the short-clip fallback). */
  shotBehavior: string
  /** Defaults to OFF. */
  sourceAudio?: SourceAudioPolicy
  /** Desired head trim; clamped to a real source position. Defaults to 0. */
  sourceStartFrame?: number
}

/**
 * Resolve one clip against one scene. Total function: every input — unknown
 * duration, absurd start offset, zero-length scene — yields a playable window.
 */
export function computeVideoPlayback(input: ComputeVideoPlaybackInput): VideoPlayback {
  const { asset, fps, shotBehavior } = input
  const sceneDurationInFrames = Math.max(1, Math.trunc(input.sceneDurationInFrames))
  const policy = input.sourceAudio ?? SOURCE_AUDIO_OFF
  const source = sourceDurationInFrames(asset, fps)
  const behavior = shortClipBehaviorFor(shotBehavior)

  // Source audio is silent unless explicitly enabled AND the track exists.
  const audible = policy.enabled && asset.hasAudio
  const muted = !audible
  const volume = audible ? Math.min(1, Math.max(0, policy.volume)) : 0

  // Unknown duration (analysis pending/failed): don't guess a length. Ask for the
  // scene window and let the element show what it has; the poster covers gaps.
  if (source === null) {
    const trimStartFrame = Math.max(0, Math.trunc(input.sourceStartFrame ?? 0))
    return {
      trimStartFrame,
      trimEndFrame: trimStartFrame + sceneDurationInFrames,
      playableFrames: sceneDurationInFrames,
      sceneDurationInFrames,
      sourceDurationInFrames: null,
      shorterThanScene: false,
      behavior,
      loopTimes: 1,
      muted,
      volume,
    }
  }

  // Clamp the head trim to a frame that actually exists, so playback can never
  // start past the end of the source.
  const trimStartFrame = Math.min(Math.max(0, Math.trunc(input.sourceStartFrame ?? 0)), source - 1)
  const available = source - trimStartFrame

  if (available >= sceneDurationInFrames) {
    // Long clip → trim to exactly the scene window.
    return {
      trimStartFrame,
      trimEndFrame: trimStartFrame + sceneDurationInFrames,
      playableFrames: sceneDurationInFrames,
      sceneDurationInFrames,
      sourceDurationInFrames: source,
      shorterThanScene: false,
      behavior,
      loopTimes: 1,
      muted,
      volume,
    }
  }

  // Short clip → consume all remaining source; `behavior` covers the tail.
  // Bounded loop: enough passes to reach the scene end, never unbounded.
  const loopTimes = behavior === 'loop' ? Math.max(1, Math.ceil(sceneDurationInFrames / available)) : 1

  return {
    trimStartFrame,
    trimEndFrame: source,
    playableFrames: available,
    sceneDurationInFrames,
    sourceDurationInFrames: source,
    shorterThanScene: true,
    behavior,
    loopTimes,
    muted,
    volume,
  }
}
