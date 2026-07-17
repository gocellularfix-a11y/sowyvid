import { z } from 'zod'

/**
 * The global Music Center catalog. A **music track** is application-level, not
 * owned by any one commercial: the same track is referenced by many commercials
 * through its stable `id`, and its bytes live ONCE in the managed music vault
 * (`<userData>/music/files/<hash>.<ext>`), deduplicated by content hash.
 *
 * SowyVid never asserts that the owner holds rights to a song merely because it
 * was imported. `licenseStatus`/`commercialUseConfirmed` record what the OWNER
 * stated; empty/unknown means "not stated", never "cleared for use".
 */

/** Where a track came from — owner-selected provenance, never inferred. */
export const MusicSource = z.enum([
  /** Imported by owner. */
  'imported',
  /** Created manually in Suno (via the manual brief workflow). */
  'suno-manual',
  /** Licensed music the owner obtained elsewhere. */
  'licensed',
  /** Original production the owner made. */
  'original',
  /** Not stated. */
  'unknown',
])
export type MusicSource = z.infer<typeof MusicSource>

/** Owner-stated commercial-use standing. Honest by default: `unknown`. */
export const MusicLicenseStatus = z.enum([
  /** Confirmed for commercial use (owner attests). */
  'commercial-confirmed',
  /** Personal use only. */
  'personal-only',
  /** License needs review. */
  'needs-review',
  /** Not stated. */
  'unknown',
])
export type MusicLicenseStatus = z.infer<typeof MusicLicenseStatus>

/** Owner-stated vocal content. ffprobe cannot tell instrumental from vocal. */
export const VocalClass = z.enum(['instrumental', 'vocal', 'unknown'])
export type VocalClass = z.infer<typeof VocalClass>

/** Musical energy, owner-set (or seeded from a brief). */
export const MusicEnergy = z.enum(['calm', 'balanced', 'energetic', 'unknown'])
export type MusicEnergy = z.infer<typeof MusicEnergy>

export const MusicTrack = z.object({
  /** `music_<64 hex>` — the content hash IS the identity (dedup by hash). */
  id: z.string(),
  /** Path relative to the music vault, e.g. `files/<hash>.mp3`. Portable. */
  relPath: z.string(),
  originalName: z.string(),
  /** Owner-facing display title. Defaults to the filename stem on import. */
  title: z.string().default(''),
  creator: z.string().default(''),
  source: MusicSource.default('imported'),
  /** Where it came from, e.g. a Suno share link. Owner-entered, verbatim. */
  sourceUrl: z.string().default(''),
  durationSec: z.number().nonnegative().nullable().default(null),
  container: z.string().nullable().default(null),
  codec: z.string().nullable().default(null),
  sampleRate: z.number().int().positive().nullable().default(null),
  channels: z.number().int().positive().nullable().default(null),
  bytes: z.number().int().nonnegative(),
  /** sha256 of the file bytes (the id without the `music_` prefix). */
  hash: z.string(),
  moodTags: z.array(z.string()).default([]),
  energy: MusicEnergy.default('unknown'),
  vocal: VocalClass.default('unknown'),
  licenseStatus: MusicLicenseStatus.default('unknown'),
  /** Free text — what the owner knows. Never auto-filled. */
  licenseNotes: z.string().default(''),
  /** The owner explicitly attested commercial use. */
  commercialUseConfirmed: z.boolean().default(false),
  /** The exact deterministic brief used when this came from the Suno workflow. */
  sunoBrief: z.string().nullable().default(null),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
export type MusicTrack = z.infer<typeof MusicTrack>

/** Owner-editable metadata (progressive — none required before use). */
export const MusicMetaPatch = z.object({
  title: z.string().max(200).optional(),
  creator: z.string().max(200).optional(),
  source: MusicSource.optional(),
  sourceUrl: z.string().max(2000).optional(),
  moodTags: z.array(z.string().max(40)).max(20).optional(),
  energy: MusicEnergy.optional(),
  vocal: VocalClass.optional(),
  licenseStatus: MusicLicenseStatus.optional(),
  licenseNotes: z.string().max(2000).optional(),
  commercialUseConfirmed: z.boolean().optional(),
})
export type MusicMetaPatch = z.infer<typeof MusicMetaPatch>

/** A commercial that references a track — for usage lists and safety dialogs. */
export interface MusicUsage {
  projectId: string
  projectName: string
}

/** A catalog track plus live facts never persisted (file state, usage). */
export interface MusicTrackWithState extends MusicTrack {
  /** False when the managed file is gone from the vault. */
  fileExists: boolean
  /** Number of commercials currently selecting this track. */
  usageCount: number
  usages: MusicUsage[]
}

/** A music track id must be `music_<64 hex>` — nothing else resolves. */
export function isValidMusicTrackId(id: string): boolean {
  return /^music_[a-f0-9]{64}$/.test(id)
}
