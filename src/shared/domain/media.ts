import { z } from 'zod'

export const MediaKind = z.enum(['image', 'video', 'audio', 'logo'])
export type MediaKind = z.infer<typeof MediaKind>

export const MediaOrientation = z.enum(['portrait', 'landscape', 'square'])
export type MediaOrientation = z.infer<typeof MediaOrientation>

/** Lifecycle of the deeper media-analysis pass (probing + thumbnail/poster). */
export const AnalysisStatus = z.enum(['pending', 'processing', 'ready', 'failed'])
export type AnalysisStatus = z.infer<typeof AnalysisStatus>

/**
 * A media asset that has been imported into managed project storage. `relPath`
 * is relative to the project's media folder so projects stay portable — we never
 * persist an absolute development path into project data.
 */
export const MediaAsset = z.object({
  id: z.string(),
  kind: MediaKind,
  /** Path relative to <project>/media, e.g. "media/img_ab12.jpg". */
  relPath: z.string(),
  originalName: z.string(),
  mimeType: z.string(),
  /** Content hash (sha256) for duplicate detection. */
  hash: z.string(),
  bytes: z.number().int().nonnegative(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  orientation: MediaOrientation.nullable(),
  /** Seconds; null for images/logos or until analysis runs. */
  durationSec: z.number().nonnegative().nullable(),
  /** Frames per second (video), set by analysis when detectable. */
  fps: z.number().positive().nullable().default(null),
  hasAudio: z.boolean(),
  /** Relative path to a generated image thumbnail, if any. */
  thumbRelPath: z.string().nullable(),
  /** Relative path to a generated video poster frame, if any. */
  posterRelPath: z.string().nullable().default(null),
  /** Deeper analysis lifecycle (defaults keep pre-analysis records loadable). */
  analysisStatus: AnalysisStatus.default('pending'),
  /** Safe, owner-hideable diagnostic reason when analysis fails. */
  analysisError: z.string().nullable().default(null),
  /** True once basic validation succeeded. */
  valid: z.boolean(),
  importedAt: z.string().datetime(),
})
export type MediaAsset = z.infer<typeof MediaAsset>

/** A quality/relevance score assigned by deterministic media analysis. */
export const MediaScore = z.object({
  mediaId: z.string(),
  /** 0..1 — resolution/orientation fit for the target aspect ratio. */
  fit: z.number().min(0).max(1),
  /** 0..1 — overall usability (resolution, not corrupt, right kind). */
  quality: z.number().min(0).max(1),
  /** Higher = earlier/hero placement. */
  priority: z.number(),
})
export type MediaScore = z.infer<typeof MediaScore>
