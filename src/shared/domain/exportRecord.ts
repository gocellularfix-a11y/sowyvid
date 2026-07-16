import { z } from 'zod'

/**
 * A persisted MP4 export. One row per render attempt — including failures and
 * cancellations, so the owner's history tells the truth about what happened,
 * not just what succeeded.
 *
 * `outputPath` is an absolute path by design: it is the destination the owner
 * explicitly chose in the save dialog. This is the ONE place an absolute path
 * may be persisted — creative/visual/audio plans must never contain one.
 */
export const ExportStatus = z.enum(['rendering', 'completed', 'failed', 'canceled'])
export type ExportStatus = z.infer<typeof ExportStatus>

/**
 * Stable diagnostic codes shown to the owner instead of raw errors. The UI maps
 * these to calm Spanish copy; logs keep the underlying detail.
 */
export const ExportFailureCode = z.enum([
  /** The app was closed or crashed while this render was running. */
  'interrupted',
  /** The owner canceled. Not a failure, but recorded for completeness. */
  'canceled',
  /** The destination folder disappeared or could not be written. */
  'output-unavailable',
  /** A required media/audio asset no longer resolves. */
  'missing-media',
  /** ffmpeg/ffprobe/browser could not be located. */
  'tools-unavailable',
  /** The render itself failed (encode, composition, bundling). */
  'render-failed',
])
export type ExportFailureCode = z.infer<typeof ExportFailureCode>

export const ExportRecord = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  createdAt: z.string(),
  /** Null while rendering or when the app died mid-render. */
  completedAt: z.string().nullable(),
  status: ExportStatus,
  /** Preset id (e.g. "instagram-reel"). */
  preset: z.string(),
  width: z.number().int().nonnegative(),
  height: z.number().int().nonnegative(),
  fps: z.number().nonnegative(),
  durationSec: z.number().nonnegative(),
  /** Owner-chosen destination. Absolute on purpose — see file header. */
  outputPath: z.string(),
  bytes: z.number().int().nonnegative(),
  videoCodec: z.string().nullable(),
  audioCodec: z.string().nullable(),
  /** The render-bundle fingerprint this file was produced with. */
  fingerprint: z.string().nullable(),
  failureCode: ExportFailureCode.nullable(),
})
export type ExportRecord = z.infer<typeof ExportRecord>

/** An export plus what the filesystem says about it right now (never persisted). */
export interface ExportRecordWithFileState extends ExportRecord {
  /** False when the owner (or anything else) deleted the file after export. */
  fileExists: boolean
}
