import {
  resolveAudioMix,
  type AudioPlanInput as SoundWeaveInput,
  type AudioSceneWindow,
  type AudioMixPlan,
  type ResolvedAudioAsset,
} from '@jorge-engines/soundweave-audio'
import type { VisualPlan } from '@features/visual/visualPlan'
import type { AudioConfig } from '@shared/domain/project'
import type { MediaAsset } from '@shared/domain/media'
import {
  AudioPlanSchema,
  AUDIO_PLAN_VERSION,
  type AudioPlan,
  type AudioTrack,
  type MissingTrack,
} from './audioPlan'

/**
 * Project audio preferences + scene timing + managed audio metadata
 *   → SoundWeave (decides ALL audio timing)
 *   → validated SowyVid AudioPlan
 *
 * No Remotion/React here, and no audio-timing rules of our own: this adapter
 * resolves and validates ASSETS (which SoundWeave cannot do) and translates
 * shapes. Every "when/how loud" decision belongs to the engine.
 *
 * See docs/SOUNDWEAVE-INTEGRATION.md for the audited engine contract.
 */

const AUDIO_ENGINE_NAME = '@jorge-engines/soundweave-audio'
const AUDIO_ENGINE_VERSION = '1.0.0'

/** Canonical controlled media URL (mirrors src/render/remotionProps.ts). */
function mediaUrlById(projectId: string, mediaId: string): string {
  return `sowyvid-media://asset/${projectId}/${mediaId}/original`
}

export interface BuildAudioPlanInput {
  projectId: string
  audio: AudioConfig
  visualPlan: VisualPlan
  media: readonly MediaAsset[]
}

/** An asset reference checked against managed storage. */
type Resolution =
  | { ok: true; asset: MediaAsset }
  | { ok: false; reason: MissingTrack['reason'] }

/**
 * Why SowyVid resolves instead of letting the engine's resolver decide: the
 * engine's resolver can only answer "found / not found", so every distinct
 * failure would collapse into silence with no diagnostic.
 */
function resolveAudioAsset(media: readonly MediaAsset[], assetId: string | null): Resolution {
  if (!assetId) return { ok: false, reason: 'not-selected' }
  const asset = media.find((m) => m.id === assetId)
  if (!asset) return { ok: false, reason: 'not-found' }
  if (asset.kind !== 'audio') return { ok: false, reason: 'not-audio' }
  if (!asset.valid) return { ok: false, reason: 'invalid' }
  return { ok: true, asset }
}

/**
 * Scene windows for SoundWeave, derived from the VisualPlan's frame counts.
 *
 * Deliberately converts FROM frames (`durationInFrames / fps`) rather than
 * reusing the original `durationSec`. SoundWeave recomputes
 * `round(seconds × fps)`, so feeding it seconds derived from the authoritative
 * frame count round-trips exactly and picture/sound cannot drift apart by a
 * rounding error. Verified: an 81 + 84 frame plan yields totalFrames = 165.
 */
export function sceneWindowsFrom(plan: VisualPlan): AudioSceneWindow[] {
  return plan.scenes.map((s) => ({ id: s.id, durationSeconds: s.durationInFrames / plan.fps }))
}

/** SoundWeave mix track → SowyVid AudioTrack. */
function toTrack(
  role: AudioTrack['role'],
  assetId: string,
  url: string,
  args: {
    fromFrame: number
    durationFrames: number | null
    volume: number
    fadeInFrames?: number
    fadeOutFrames?: number
    loop?: boolean
    trimStartFrame?: number
    sceneId?: string | null
    totalFrames: number
  },
): AudioTrack {
  // A null durationFrames means "unknown length" — run to the end of the video.
  // Clamp regardless: no track may outlive the picture.
  const end = Math.min(
    args.totalFrames,
    args.durationFrames === null ? args.totalFrames : args.fromFrame + args.durationFrames,
  )
  return {
    role,
    assetId,
    url,
    startFrame: args.fromFrame,
    endFrame: Math.max(args.fromFrame + 1, end),
    trimStartFrame: args.trimStartFrame ?? 0,
    volume: args.volume,
    fadeInFrames: args.fadeInFrames ?? 0,
    fadeOutFrames: args.fadeOutFrames ?? 0,
    loop: args.loop ?? false,
    sceneId: args.sceneId ?? null,
  }
}

/**
 * Build a validated AudioPlan. Total function: a project with no music, a
 * deleted track, or audio switched off all yield a VALID plan — a silent one
 * with the reason recorded — never a throw and never a lie.
 */
export function buildAudioPlan(input: BuildAudioPlanInput): AudioPlan {
  const { projectId, audio, visualPlan, media } = input
  const fps = visualPlan.fps
  const totalFrames = visualPlan.totalDurationInFrames
  const missingTracks: MissingTrack[] = []

  // --- resolve assets ourselves, so failures are explicit ---
  const musicRes = audio.musicId ? resolveAudioAsset(media, audio.musicId) : null
  if (musicRes && !musicRes.ok) {
    missingTracks.push({ role: 'music', assetId: audio.musicId, reason: musicRes.reason })
  }

  // Narration exists only if the owner imported a voice track: SowyVid has no
  // TTS, so `narrationEnabled` alone cannot produce one.
  const narrationRes = audio.narrationEnabled
    ? resolveAudioAsset(media, audio.narrationMediaId)
    : null
  if (narrationRes && !narrationRes.ok) {
    missingTracks.push({ role: 'narration', assetId: audio.narrationMediaId, reason: narrationRes.reason })
  }

  const resolved = new Map<string, ResolvedAudioAsset>()
  const register = (asset: MediaAsset): void => {
    resolved.set(asset.id, {
      file: mediaUrlById(projectId, asset.id),
      kind: 'audio',
      // ffprobe-measured. The engine cannot measure audio itself, so a wrong
      // duration here would produce a wrong (if deterministic) plan.
      ...(asset.durationSec ? { durationMs: asset.durationSec * 1000 } : {}),
    })
  }
  if (musicRes?.ok) register(musicRes.asset)
  if (narrationRes?.ok) register(narrationRes.asset)

  // --- let SoundWeave decide the timing ---
  const engineInput: SoundWeaveInput = {
    audioEnabled: true,
    masterVolume: 1,
    duckMusicUnderVoice: true,
    ...(musicRes?.ok
      ? { music: { enabled: true, assetId: musicRes.asset.id, volume: audio.musicVolume, loop: true } }
      : {}),
    ...(narrationRes?.ok
      ? {
          voice: {
            enabled: true,
            mode: 'imported' as const,
            assetId: narrationRes.asset.id,
            volume: audio.narrationVolume,
          },
        }
      : {}),
    clips: [],
  }

  const mix: AudioMixPlan | null = resolveAudioMix(
    engineInput,
    sceneWindowsFrom(visualPlan),
    fps,
    (id) => resolved.get(id) ?? null,
  )

  const sourceAudio = {
    enabled: audio.useSourceAudio,
    volume: audio.useSourceAudio ? 1 : 0,
  }

  // The engine returns null when there is nothing to play. That is not an error —
  // it is a silent commercial, and `missingTracks` already says why if a track
  // was expected.
  if (!mix) {
    return AudioPlanSchema.parse({
      version: AUDIO_PLAN_VERSION,
      audioEngineName: AUDIO_ENGINE_NAME,
      audioEngineVersion: AUDIO_ENGINE_VERSION,
      projectId,
      fps,
      totalDurationInFrames: totalFrames,
      masterVolume: 1,
      music: null,
      narration: [],
      effects: [],
      sourceAudio,
      ducking: { enabled: false, amount: 0, rampFrames: 0, segments: [] },
      missingTracks,
      silent: !sourceAudio.enabled,
    } satisfies AudioPlan)
  }

  const music: AudioTrack | null =
    mix.music && musicRes?.ok
      ? toTrack('music', musicRes.asset.id, mix.music.file, {
          fromFrame: 0,
          durationFrames: totalFrames,
          volume: mix.music.volume,
          fadeInFrames: mix.music.fadeInFrames,
          fadeOutFrames: mix.music.fadeOutFrames,
          loop: mix.music.loop,
          trimStartFrame: mix.music.trimStartFrames,
          totalFrames,
        })
      : null

  const narration: AudioTrack[] =
    narrationRes?.ok
      ? mix.narration.map((n) =>
          toTrack('narration', narrationRes.asset.id, n.file, {
            fromFrame: n.fromFrame,
            durationFrames: n.durationFrames,
            volume: n.volume,
            sceneId: n.sceneId,
            totalFrames,
          }),
        )
      : []

  const duckingEnabled = Boolean(music) && narration.length > 0 && mix.duckAmount > 0

  const plan = {
    version: AUDIO_PLAN_VERSION,
    audioEngineName: AUDIO_ENGINE_NAME,
    audioEngineVersion: AUDIO_ENGINE_VERSION,
    projectId,
    fps,
    // The picture is authoritative; sound shares its timeline exactly.
    totalDurationInFrames: totalFrames,
    masterVolume: mix.masterVolume,
    music,
    narration,
    effects: [],
    sourceAudio,
    ducking: {
      enabled: duckingEnabled,
      amount: duckingEnabled ? mix.duckAmount : 0,
      rampFrames: duckingEnabled ? mix.duckRampFrames : 0,
      segments: duckingEnabled
        ? mix.duckSegments
            .map((s) => ({ fromFrame: s.fromFrame, toFrame: Math.min(s.toFrame, totalFrames) }))
            .filter((s) => s.toFrame > s.fromFrame)
        : [],
    },
    missingTracks,
    silent: !music && narration.length === 0 && !sourceAudio.enabled,
  } satisfies AudioPlan

  return AudioPlanSchema.parse(plan)
}
