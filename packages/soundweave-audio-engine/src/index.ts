import { z } from 'zod'

export const AUDIO_DEFAULTS = {
  musicVolume: 0.5,
  voiceVolume: 1,
  clipVolume: 1,
  masterVolume: 1,
  musicFadeInSec: 1,
  musicFadeOutSec: 1.5,
  duckAmount: 0.6,
  duckRampSec: 0.3,
  maxNarrationOverhangSec: 1.5,
} as const

export const VoiceSegmentSchema = z.object({
  sceneId: z.string().min(1),
  assetId: z.string().min(1),
  durationMs: z.number().finite().positive().optional(),
  scriptHash: z.string().optional(),
})
export type VoiceSegment = z.infer<typeof VoiceSegmentSchema>

export const MusicPlanSchema = z.object({
  enabled: z.boolean().default(true),
  assetId: z.string().min(1).optional(),
  volume: z.number().finite().min(0).max(1).optional(),
  fadeInSec: z.number().finite().min(0).max(30).optional(),
  fadeOutSec: z.number().finite().min(0).max(30).optional(),
  loop: z.boolean().optional(),
  startOffsetSec: z.number().finite().min(0).max(3600).optional(),
})

export const VoicePlanSchema = z.object({
  enabled: z.boolean().default(true),
  mode: z.enum(['generated', 'imported']),
  assetId: z.string().min(1).optional(),
  segments: z.array(VoiceSegmentSchema).default([]),
  volume: z.number().finite().min(0).max(1).optional(),
  duckAmount: z.number().finite().min(0).max(1).optional(),
})

export const ExtraClipPlanSchema = z.object({
  assetId: z.string().min(1),
  startSec: z.number().finite().min(0),
  volume: z.number().finite().min(0).max(1).optional(),
  fadeInSec: z.number().finite().min(0).max(30).optional(),
  fadeOutSec: z.number().finite().min(0).max(30).optional(),
})

export const AudioPlanSchema = z.object({
  audioEnabled: z.boolean().default(true),
  masterVolume: z.number().finite().min(0).max(1).optional(),
  duckMusicUnderVoice: z.boolean().default(true),
  music: MusicPlanSchema.optional(),
  voice: VoicePlanSchema.optional(),
  clips: z.array(ExtraClipPlanSchema).default([]),
})
export type AudioPlan = z.infer<typeof AudioPlanSchema>
export type AudioPlanInput = z.input<typeof AudioPlanSchema>

export const AudioSceneWindowSchema = z.object({
  id: z.string().min(1),
  durationSeconds: z.number().finite().positive(),
})
export type AudioSceneWindow = z.infer<typeof AudioSceneWindowSchema>

export const ResolvedAudioAssetSchema = z.object({
  file: z.string().min(1),
  kind: z.literal('audio'),
  durationMs: z.number().finite().positive().optional(),
})
export type ResolvedAudioAsset = z.infer<typeof ResolvedAudioAssetSchema>
export type AudioAssetResolver = (assetId: string) => ResolvedAudioAsset | null | undefined

export interface MusicMix {
  file: string
  volume: number
  fadeInFrames: number
  fadeOutFrames: number
  loop: boolean
  trimStartFrames: number
}
export interface NarrationClipMix {
  file: string
  fromFrame: number
  durationFrames: number | null
  volume: number
  sceneId: string
}
export interface ExtraClipMix {
  file: string
  fromFrame: number
  durationFrames: number | null
  volume: number
  fadeInFrames: number
  fadeOutFrames: number
}
export interface DuckSegment { fromFrame: number; toFrame: number }
export interface AudioMixPlan {
  version: 1
  fps: number
  totalFrames: number
  masterVolume: number
  music: MusicMix | null
  narration: NarrationClipMix[]
  clips: ExtraClipMix[]
  duckAmount: number
  duckSegments: DuckSegment[]
  duckRampFrames: number
}

export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v)
const clampN = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v))
export const sceneFrames = (durationSeconds: number, fps: number): number => Math.max(1, Math.round(durationSeconds * fps))

export function fnv1aHex(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

interface ScenePlacement { sceneId: string; startFrame: number; durationFrames: number }
function scenePlacements(scenes: AudioSceneWindow[], fps: number): ScenePlacement[] {
  const out: ScenePlacement[] = []
  let cursor = 0
  for (const scene of scenes) {
    const durationFrames = sceneFrames(scene.durationSeconds, fps)
    out.push({ sceneId: scene.id, startFrame: cursor, durationFrames })
    cursor += durationFrames
  }
  return out
}

export function placeNarration(
  scenesInput: AudioSceneWindow[],
  segmentsInput: VoiceSegment[],
  fps: number,
  resolve: AudioAssetResolver,
  volume: number,
  maxOverhangSec = AUDIO_DEFAULTS.maxNarrationOverhangSec,
): NarrationClipMix[] {
  const scenes = z.array(AudioSceneWindowSchema).parse(scenesInput)
  const segments = z.array(VoiceSegmentSchema).parse(segmentsInput)
  if (!Number.isFinite(fps) || fps <= 0) throw new Error('fps must be positive')
  const placements = scenePlacements(scenes, fps)
  const totalFrames = placements.reduce((n, p) => n + p.durationFrames, 0)
  const byScene = new Map(segments.map((segment) => [segment.sceneId, segment]))
  const narrated = placements.filter((placement) => {
    const segment = byScene.get(placement.sceneId)
    return segment ? Boolean(resolve(segment.assetId)) : false
  })
  const out: NarrationClipMix[] = []
  for (let i = 0; i < narrated.length; i++) {
    const placement = narrated[i]
    if (!placement) continue
    const segment = byScene.get(placement.sceneId)
    if (!segment) continue
    const asset = resolve(segment.assetId)
    if (!asset) continue
    const durationMs = segment.durationMs ?? asset.durationMs
    const sceneEnd = placement.startFrame + placement.durationFrames
    const nextNarrated = narrated[i + 1]
    const nextNarrationStart = nextNarrated?.startFrame ?? totalFrames
    const capFrame = Math.min(
      sceneEnd + Math.round(clampN(maxOverhangSec, 0, 10) * fps),
      nextNarrationStart,
      totalFrames,
    )
    const natural = durationMs ? Math.max(1, Math.round((durationMs / 1000) * fps)) : placement.durationFrames
    out.push({
      file: asset.file,
      fromFrame: placement.startFrame,
      durationFrames: Math.min(natural, Math.max(1, capFrame - placement.startFrame)),
      volume: clamp01(volume),
      sceneId: placement.sceneId,
    })
  }
  return out
}

export function duckSegmentsFromNarration(narration: NarrationClipMix[], totalFrames: number): DuckSegment[] {
  const raw = narration
    .map((clip) => ({
      fromFrame: Math.max(0, clip.fromFrame),
      toFrame: Math.min(totalFrames, clip.fromFrame + (clip.durationFrames ?? totalFrames - clip.fromFrame)),
    }))
    .filter((segment) => segment.toFrame > segment.fromFrame)
    .sort((a, b) => a.fromFrame - b.fromFrame)
  const merged: DuckSegment[] = []
  for (const segment of raw) {
    const last = merged.at(-1)
    if (last && segment.fromFrame <= last.toFrame) last.toFrame = Math.max(last.toFrame, segment.toFrame)
    else merged.push({ ...segment })
  }
  return merged
}

export function resolveAudioMix(
  audioInput: AudioPlanInput | undefined | null,
  scenesInput: AudioSceneWindow[],
  fps: number,
  resolve: AudioAssetResolver,
): AudioMixPlan | null {
  if (!audioInput) return null
  const audio = AudioPlanSchema.parse(audioInput)
  const scenes = z.array(AudioSceneWindowSchema).min(1).parse(scenesInput)
  if (!audio.audioEnabled) return null
  if (!Number.isFinite(fps) || fps <= 0) throw new Error('fps must be positive')
  const totalFrames = scenes.reduce((n, scene) => n + sceneFrames(scene.durationSeconds, fps), 0)
  const masterVolume = clamp01(audio.masterVolume ?? AUDIO_DEFAULTS.masterVolume)
  let music: MusicMix | null = null
  if (audio.music?.enabled !== false && audio.music?.assetId) {
    const asset = resolve(audio.music.assetId)
    if (asset) {
      const half = Math.floor(totalFrames / 2)
      music = {
        file: asset.file,
        volume: clamp01(audio.music.volume ?? AUDIO_DEFAULTS.musicVolume),
        fadeInFrames: clampN(Math.round((audio.music.fadeInSec ?? AUDIO_DEFAULTS.musicFadeInSec) * fps), 0, half),
        fadeOutFrames: clampN(Math.round((audio.music.fadeOutSec ?? AUDIO_DEFAULTS.musicFadeOutSec) * fps), 0, half),
        loop: (audio.music.loop ?? true) && (!asset.durationMs || (asset.durationMs / 1000) * fps < totalFrames),
        trimStartFrames: clampN(Math.round((audio.music.startOffsetSec ?? 0) * fps), 0, 3600 * fps),
      }
    }
  }
  let narration: NarrationClipMix[] = []
  const voice = audio.voice
  if (voice && voice.enabled !== false) {
    const volume = clamp01(voice.volume ?? AUDIO_DEFAULTS.voiceVolume)
    if (voice?.mode === 'generated') narration = placeNarration(scenes, voice.segments, fps, resolve, volume)
    else if (voice?.mode === 'imported' && voice.assetId) {
      const asset = resolve(voice.assetId)
      if (asset) {
        const natural = asset.durationMs ? Math.max(1, Math.round((asset.durationMs / 1000) * fps)) : null
        narration = [{ file: asset.file, fromFrame: 0, durationFrames: natural === null ? null : Math.min(natural, totalFrames), volume, sceneId: scenes[0]!.id }]
      }
    }
  }
  const clips: ExtraClipMix[] = []
  for (const clip of audio.clips) {
    const asset = resolve(clip.assetId)
    if (!asset) continue
    const fromFrame = Math.round(clampN(clip.startSec, 0, 3600) * fps)
    if (fromFrame >= totalFrames) continue
    const remaining = totalFrames - fromFrame
    const natural = asset.durationMs ? Math.max(1, Math.round((asset.durationMs / 1000) * fps)) : null
    clips.push({
      file: asset.file,
      fromFrame,
      durationFrames: natural === null ? null : Math.min(natural, remaining),
      volume: clamp01(clip.volume ?? AUDIO_DEFAULTS.clipVolume),
      fadeInFrames: clampN(Math.round((clip.fadeInSec ?? 0) * fps), 0, remaining),
      fadeOutFrames: clampN(Math.round((clip.fadeOutSec ?? 0) * fps), 0, remaining),
    })
  }
  if (!music && narration.length === 0 && clips.length === 0) return null
  const duckOn = audio.duckMusicUnderVoice && Boolean(music) && narration.length > 0
  return {
    version: 1,
    fps,
    totalFrames,
    masterVolume,
    music,
    narration,
    clips,
    duckAmount: duckOn ? clamp01(voice?.duckAmount ?? AUDIO_DEFAULTS.duckAmount) : 0,
    duckSegments: duckOn ? duckSegmentsFromNarration(narration, totalFrames) : [],
    duckRampFrames: Math.max(1, Math.round(AUDIO_DEFAULTS.duckRampSec * fps)),
  }
}

export function duckWeightAt(frame: number, segments: DuckSegment[], rampFrames: number): number {
  const ramp = Math.max(1, rampFrames)
  let weight = 0
  for (const segment of segments) {
    let current = 0
    if (frame >= segment.fromFrame && frame < segment.toFrame) current = 1
    else if (frame >= segment.fromFrame - ramp && frame < segment.fromFrame) current = (frame - (segment.fromFrame - ramp)) / ramp
    else if (frame >= segment.toFrame && frame < segment.toFrame + ramp) current = 1 - (frame - segment.toFrame) / ramp
    weight = Math.max(weight, current)
  }
  return clamp01(weight)
}

export function musicVolumeAt(frame: number, plan: AudioMixPlan): number {
  if (!plan.music) return 0
  let volume = clamp01(plan.music.volume) * clamp01(plan.masterVolume)
  if (plan.music.fadeInFrames > 0 && frame < plan.music.fadeInFrames) volume *= clamp01(frame / plan.music.fadeInFrames)
  const remaining = plan.totalFrames - 1 - frame
  if (plan.music.fadeOutFrames > 0 && remaining < plan.music.fadeOutFrames) volume *= clamp01(Math.max(0, remaining) / plan.music.fadeOutFrames)
  if (plan.duckAmount > 0) volume *= 1 - clamp01(plan.duckAmount) * duckWeightAt(frame, plan.duckSegments, plan.duckRampFrames)
  return clamp01(volume)
}

export function clipVolumeAt(localFrame: number, clip: ExtraClipMix, masterVolume: number): number {
  let volume = clamp01(clip.volume) * clamp01(masterVolume)
  if (clip.fadeInFrames > 0 && localFrame < clip.fadeInFrames) volume *= clamp01(localFrame / clip.fadeInFrames)
  if (clip.durationFrames !== null && clip.fadeOutFrames > 0) {
    const remaining = clip.durationFrames - 1 - localFrame
    if (remaining < clip.fadeOutFrames) volume *= clamp01(Math.max(0, remaining) / clip.fadeOutFrames)
  }
  return clamp01(volume)
}

export type NarrationFitStatus = 'no_narration' | 'fits' | 'bounded_overhang' | 'too_long'
export interface NarrationSceneFit {
  sceneId: string
  status: NarrationFitStatus
  sceneSec: number
  narrationSec: number | null
  overhangSec: number
  allowedOverhangSec: number
}
export interface NarrationFitReport {
  scenes: NarrationSceneFit[]
  ok: boolean
  tooLongCount: number
  options: Array<'shorten_script' | 'extend_duration' | 'regenerate' | 'continue_without_voiceover'>
}

export function reconcileNarration(
  scenesInput: AudioSceneWindow[],
  segmentsInput: VoiceSegment[],
  fps: number,
  maxOverhangSec = AUDIO_DEFAULTS.maxNarrationOverhangSec,
): NarrationFitReport {
  const scenes = z.array(AudioSceneWindowSchema).parse(scenesInput)
  const segments = z.array(VoiceSegmentSchema).parse(segmentsInput)
  const placements = scenePlacements(scenes, fps)
  const totalFrames = placements.reduce((n, placement) => n + placement.durationFrames, 0)
  const byScene = new Map(segments.map((segment) => [segment.sceneId, segment]))
  const narrated = placements.filter((placement) => byScene.has(placement.sceneId))
  let tooLongCount = 0
  const fits = placements.map((placement): NarrationSceneFit => {
    const segment = byScene.get(placement.sceneId)
    const sceneSec = placement.durationFrames / fps
    if (!segment?.durationMs) return { sceneId: placement.sceneId, status: 'no_narration', sceneSec, narrationSec: null, overhangSec: 0, allowedOverhangSec: 0 }
    const index = narrated.findIndex((item) => item.sceneId === placement.sceneId)
    const nextNarrated = narrated[index + 1]
    const sceneEnd = placement.startFrame + placement.durationFrames
    const capFrame = Math.min(sceneEnd + Math.round(maxOverhangSec * fps), nextNarrated?.startFrame ?? totalFrames, totalFrames)
    const allowedOverhangSec = Math.max(0, (capFrame - sceneEnd) / fps)
    const narrationSec = segment.durationMs / 1000
    const overhangSec = Math.max(0, narrationSec - sceneSec)
    let status: NarrationFitStatus = 'fits'
    if (overhangSec > 1 / fps && overhangSec <= allowedOverhangSec + 1 / fps) status = 'bounded_overhang'
    else if (overhangSec > allowedOverhangSec + 1 / fps) { status = 'too_long'; tooLongCount += 1 }
    return { sceneId: placement.sceneId, status, sceneSec, narrationSec, overhangSec, allowedOverhangSec }
  })
  return {
    scenes: fits,
    ok: tooLongCount === 0,
    tooLongCount,
    options: tooLongCount > 0 ? ['shorten_script', 'extend_duration', 'regenerate', 'continue_without_voiceover'] : [],
  }
}
