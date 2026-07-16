import { z } from 'zod'

/**
 * SowyVid AudioPlan — the validated, renderer-neutral audio contract that gets
 * persisted with the project and rendered by BOTH the preview and the export.
 *
 * ## Why this exists instead of using SoundWeave's output directly
 *
 * SoundWeave owns audio *timing* and its `AudioMixPlan` is excellent at that,
 * but it cannot carry three things SowyVid needs (see docs/SOUNDWEAVE-INTEGRATION.md):
 *
 *   1. **Engine identity** — which engine/version produced this plan.
 *   2. **Source-video audio** — SoundWeave has no concept of it.
 *   3. **Missing-track state** — SoundWeave drops an unresolvable asset silently,
 *      and collapses to `null` if it was the only track. "Disabled", "nothing
 *      requested" and "the file is gone" are indistinguishable in its output.
 *      SowyVid must tell them apart to show the owner a real warning.
 *
 * So this is a superset: SoundWeave's decisions + what SoundWeave cannot know.
 *
 * ## Naming
 *
 * SoundWeave also has a type called `AudioPlan` — but that is its INPUT (what the
 * owner wants). Its OUTPUT is `AudioMixPlan`. THIS `AudioPlan` is SowyVid's
 * persisted contract. The adapter is the only place all three meet.
 *
 * Responsibilities stay separate:
 *   SoundWeave = when audio plays, how loud, fades/ducking
 *   SowyVid    = which assets exist, what is missing, source-audio policy
 *   Renderer   = turning this plan into sound
 */

export const AUDIO_PLAN_VERSION = 1 as const

export const AudioTrackRole = z.enum(['music', 'narration', 'effect'])
export type AudioTrackRole = z.infer<typeof AudioTrackRole>

/** Why a referenced track could not be used. Drives the owner-facing warning. */
export const MissingTrackReason = z.enum([
  /** No managed asset with that id (deleted, or never imported). */
  'not-found',
  /** The asset exists but failed validation. */
  'invalid',
  /** The asset exists but is not audio. */
  'not-audio',
  /** Referenced but the file is gone from managed storage. */
  'file-missing',
  /** Requested, but no asset was ever selected (e.g. narration on, none chosen). */
  'not-selected',
])
export type MissingTrackReason = z.infer<typeof MissingTrackReason>

export const AudioTrackSchema = z.object({
  role: AudioTrackRole,
  assetId: z.string().min(1),
  /**
   * Controlled `sowyvid-media://` URL. NEVER a filesystem path — the renderer
   * reaches managed audio only by stable ID, exactly like video and images.
   */
  url: z.string().min(1),
  /** Timeline frame where the track starts. */
  startFrame: z.number().int().nonnegative(),
  /** Exclusive timeline frame where the track ends. */
  endFrame: z.number().int().positive(),
  /** Head trim into the SOURCE file (not the timeline). */
  trimStartFrame: z.number().int().nonnegative(),
  volume: z.number().min(0).max(1),
  fadeInFrames: z.number().int().nonnegative(),
  fadeOutFrames: z.number().int().nonnegative(),
  /** Bounded repeat when the source is shorter than the track window. */
  loop: z.boolean(),
  /** Scene this track is synchronized to; null for timeline-wide tracks (music). */
  sceneId: z.string().nullable(),
})
export type AudioTrack = z.infer<typeof AudioTrackSchema>

export const MissingTrackSchema = z.object({
  role: AudioTrackRole,
  /** Null when the owner asked for a role but never chose an asset. */
  assetId: z.string().nullable(),
  reason: MissingTrackReason,
})
export type MissingTrack = z.infer<typeof MissingTrackSchema>

export const DuckSegmentSchema = z.object({
  fromFrame: z.number().int().nonnegative(),
  toFrame: z.number().int().positive(),
})

/** How audio embedded in imported video clips is treated. */
export const SourceAudioSchema = z.object({
  /** Source audio is OFF unless the owner explicitly turns it on. */
  enabled: z.boolean(),
  volume: z.number().min(0).max(1),
})

export const AudioPlanSchema = z
  .object({
    version: z.literal(AUDIO_PLAN_VERSION),
    /** Which engine decided this plan's timing — persisted for reproducibility. */
    audioEngineName: z.string().min(1),
    audioEngineVersion: z.string().min(1),
    projectId: z.string().min(1),
    fps: z.number().int().positive(),
    /** Must equal the VisualPlan's total — picture and sound share one timeline. */
    totalDurationInFrames: z.number().int().positive(),
    masterVolume: z.number().min(0).max(1),
    music: AudioTrackSchema.nullable(),
    narration: z.array(AudioTrackSchema),
    effects: z.array(AudioTrackSchema),
    sourceAudio: SourceAudioSchema,
    ducking: z.object({
      enabled: z.boolean(),
      /** Fraction the music drops by under narration (0.6 → down to 40%). */
      amount: z.number().min(0).max(1),
      rampFrames: z.number().int().nonnegative(),
      segments: z.array(DuckSegmentSchema),
    }),
    /**
     * Tracks the owner asked for that could not be resolved. Non-empty means the
     * preview shows a warning — but the plan is still valid and still renders.
     */
    missingTracks: z.array(MissingTrackSchema),
    /**
     * True when this plan produces no audible track at all. Explicit, so a
     * silent commercial is always a recorded decision rather than an accident —
     * and so an export can refuse to call itself "with audio" when it is not.
     */
    silent: z.boolean(),
  })
  .superRefine((plan, ctx) => {
    const tracks: Array<[string, AudioTrack]> = [
      ...(plan.music ? ([['music', plan.music]] as Array<[string, AudioTrack]>) : []),
      ...plan.narration.map((t, i): [string, AudioTrack] => [`narration.${i}`, t]),
      ...plan.effects.map((t, i): [string, AudioTrack] => [`effects.${i}`, t]),
    ]

    for (const [path, track] of tracks) {
      if (track.endFrame <= track.startFrame) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [path],
          message: `endFrame (${track.endFrame}) must be after startFrame (${track.startFrame})`,
        })
      }
      // A track may never run past the picture.
      if (track.endFrame > plan.totalDurationInFrames) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [path],
          message: `endFrame (${track.endFrame}) must not exceed the timeline (${plan.totalDurationInFrames})`,
        })
      }
    }

    if (plan.music && plan.music.role !== 'music') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['music'], message: 'music track must have role "music"' })
    }
    for (const [i, t] of plan.narration.entries()) {
      if (t.role !== 'narration') {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['narration', i], message: 'must have role "narration"' })
      }
    }

    for (const [i, seg] of plan.ducking.segments.entries()) {
      if (seg.toFrame <= seg.fromFrame) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['ducking', 'segments', i], message: 'toFrame must be after fromFrame' })
      }
      if (seg.toFrame > plan.totalDurationInFrames) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['ducking', 'segments', i], message: 'duck segment must not exceed the timeline' })
      }
    }

    // Ducking without music or narration is meaningless and signals a bad build.
    if (plan.ducking.enabled && (!plan.music || plan.narration.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ducking', 'enabled'],
        message: 'ducking requires both music and narration',
      })
    }

    // `silent` must not lie in either direction.
    const hasTrack = Boolean(plan.music) || plan.narration.length > 0 || plan.effects.length > 0
    const audible = hasTrack || plan.sourceAudio.enabled
    if (plan.silent && audible) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['silent'], message: 'silent is true but the plan has audible tracks' })
    }
    if (!plan.silent && !audible) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['silent'], message: 'silent is false but the plan has no audible track' })
    }
  })
export type AudioPlan = z.infer<typeof AudioPlanSchema>

export function validateAudioPlan(candidate: unknown): { ok: boolean; errors: string[] } {
  const result = AudioPlanSchema.safeParse(candidate)
  return result.success
    ? { ok: true, errors: [] }
    : { ok: false, errors: result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`) }
}

/** True when this plan will actually produce sound in a render. */
export function planHasAudio(plan: AudioPlan): boolean {
  return !plan.silent
}
