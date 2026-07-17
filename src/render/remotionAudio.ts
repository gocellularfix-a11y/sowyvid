import { musicVolumeAt, type AudioMixPlan } from '@jorge-engines/soundweave-audio'
import type { AudioPlan, AudioTrack, AudioTrackRole } from '@features/audio/audioPlan'

/**
 * SowyVid Remotion audio adapter: AudioPlan → composition audio props.
 *
 * This is the ONLY place Remotion-facing audio shapes are produced. It contains
 * **no audio-planning rules**: SoundWeave decided every start/volume/fade/duck,
 * and the per-frame music envelope is still computed BY THE ENGINE (see
 * `musicVolumeAtFrame`) rather than re-implemented here. Re-deriving fade or
 * duck math in the renderer is exactly how preview and export drift apart.
 *
 * Props stay **JSON-serializable** — `@remotion/renderer` passes inputProps
 * through JSON, so no functions may live in them. The frame-dependent envelope
 * is therefore an exported *function of the props*, not a prop.
 */

export interface CompositionAudioTrack {
  role: AudioTrackRole
  /** Controlled `sowyvid-media://` URL — never a filesystem path. */
  url: string
  startFrame: number
  durationInFrames: number
  /** Head trim into the source file. */
  trimStartFrame: number
  loop: boolean
  volume: number
  /**
   * Fade lengths live ON the track, not in any side-channel: these props are
   * JSON-serialized when handed to `@remotion/renderer`, so anything not on the
   * object simply does not exist at render time. A fade stored anywhere else
   * would silently vanish from the export while still working in preview.
   */
  fadeInFrames: number
  fadeOutFrames: number
}

/** A track the owner asked for that could not be resolved. */
export interface AudioWarning {
  role: AudioTrackRole
  reason: string
  /** Owner-facing Spanish message. */
  message: string
}

export type CompositionAudio = {
  fps: number
  totalDurationInFrames: number
  masterVolume: number
  music: CompositionAudioTrack | null
  narration: CompositionAudioTrack[]
  effects: CompositionAudioTrack[]
  ducking: {
    enabled: boolean
    amount: number
    rampFrames: number
    segments: Array<{ fromFrame: number; toFrame: number }>
  }
  sourceAudio: { enabled: boolean; volume: number }
  warnings: AudioWarning[]
  /** True when this composition will produce no sound at all. */
  silent: boolean
}

/** Preview-time playback controls. These modulate the plan; they never re-plan. */
export interface AudioMixControls {
  /** 0..1 applied on top of the plan's master volume. Default 1. */
  masterVolume?: number
  /** Override the planned music volume. Null/undefined → keep the plan's. */
  musicVolume?: number | null
  /** Default true. Off removes narration (and therefore ducking). */
  narrationEnabled?: boolean
  /** Override the plan's source-audio policy. Null/undefined → keep the plan's. */
  sourceAudioEnabled?: boolean | null
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v)

const MISSING_MESSAGES: Record<string, string> = {
  'not-found': 'No se encontró el archivo de audio seleccionado.',
  invalid: 'El archivo de audio no es válido.',
  'not-audio': 'El archivo seleccionado no es audio.',
  'file-missing': 'El archivo de audio ya no está en el almacenamiento.',
  'not-selected': 'No se ha seleccionado un archivo.',
}

const ROLE_LABEL: Record<AudioTrackRole, string> = {
  music: 'Música',
  narration: 'Narración',
  effect: 'Efecto',
}

function toCompositionTrack(track: AudioTrack, volume: number): CompositionAudioTrack {
  return {
    role: track.role,
    url: track.url,
    startFrame: track.startFrame,
    durationInFrames: Math.max(1, track.endFrame - track.startFrame),
    trimStartFrame: track.trimStartFrame,
    loop: track.loop,
    volume: clamp01(volume),
    fadeInFrames: track.fadeInFrames,
    fadeOutFrames: track.fadeOutFrames,
  }
}

export function audioPlanToCompositionAudio(
  plan: AudioPlan,
  controls: AudioMixControls = {},
): CompositionAudio {
  const masterVolume = clamp01(plan.masterVolume * clamp01(controls.masterVolume ?? 1))
  const narrationEnabled = controls.narrationEnabled ?? true

  const music = plan.music
    ? toCompositionTrack(plan.music, controls.musicVolume ?? plan.music.volume)
    : null

  const narration = narrationEnabled
    ? plan.narration.map((t) => toCompositionTrack(t, t.volume))
    : []

  // Ducking only makes sense with music AND narration actually playing. Turning
  // narration off in the preview must also lift the duck, or the music would dip
  // under speech that is not there.
  const duckingEnabled = plan.ducking.enabled && Boolean(music) && narration.length > 0

  // The plan's volume is the OWNER'S setting — 0 must stay 0, never "default
  // to 1". A control override may toggle availability, not the loudness.
  const sourceEnabled = controls.sourceAudioEnabled ?? plan.sourceAudio.enabled
  const sourceAudio = {
    enabled: sourceEnabled,
    volume: sourceEnabled ? clamp01(plan.sourceAudio.volume) : 0,
  }

  const effects = plan.effects.map((t) => toCompositionTrack(t, t.volume))

  return {
    fps: plan.fps,
    totalDurationInFrames: plan.totalDurationInFrames,
    masterVolume,
    music,
    narration,
    effects,
    ducking: {
      enabled: duckingEnabled,
      amount: duckingEnabled ? plan.ducking.amount : 0,
      rampFrames: duckingEnabled ? plan.ducking.rampFrames : 0,
      segments: duckingEnabled ? plan.ducking.segments : [],
    },
    sourceAudio,
    warnings: plan.missingTracks.map((m) => ({
      role: m.role,
      reason: m.reason,
      message: `${ROLE_LABEL[m.role]}: ${MISSING_MESSAGES[m.reason] ?? 'No disponible.'}`,
    })),
    silent: !music && narration.length === 0 && effects.length === 0 && !sourceAudio.enabled,
  }
}

/**
 * Rebuild the shape SoundWeave's envelope function expects, so the engine — not
 * this file — remains the authority on music volume at a given frame.
 *
 * Only the fields `musicVolumeAt` reads are populated; narration/clips do not
 * affect the music envelope (ducking is already reduced to `duckSegments`).
 */
function toEngineMixPlan(audio: CompositionAudio): AudioMixPlan {
  return {
    version: 1,
    fps: audio.fps,
    totalFrames: audio.totalDurationInFrames,
    masterVolume: audio.masterVolume,
    music: audio.music
      ? {
          file: audio.music.url,
          volume: audio.music.volume,
          fadeInFrames: audio.music.fadeInFrames,
          fadeOutFrames: audio.music.fadeOutFrames,
          loop: audio.music.loop,
          trimStartFrames: audio.music.trimStartFrame,
        }
      : null,
    narration: [],
    clips: [],
    duckAmount: audio.ducking.amount,
    duckSegments: audio.ducking.segments,
    duckRampFrames: Math.max(1, audio.ducking.rampFrames),
  }
}

/**
 * Music volume at an absolute timeline frame — fades and ducking included.
 *
 * IMPORTANT: the caller must pass the CONTINUOUS timeline frame. When music
 * loops, Remotion resets `useCurrentFrame()` on each iteration, so the
 * `<Audio>` element must set `loopVolumeCurveBehavior="extend"`. With the
 * default (`"repeat"`) the fade-out would re-run on every loop and ducking
 * would be evaluated against the wrong frame.
 */
export function musicVolumeAtFrame(frame: number, audio: CompositionAudio): number {
  if (!audio.music) return 0
  return musicVolumeAt(frame, toEngineMixPlan(audio))
}
