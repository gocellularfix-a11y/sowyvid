import { MusicTrack, type MusicUsage } from '@shared/domain/music'
import type { Database } from './port'
import type { ProjectRepository } from './projectRepository'

/**
 * The global Music Center catalog store. Every value crossing the boundary is
 * Zod-validated (write before store, read re-parse) so a corrupt row surfaces
 * as a clear error rather than poisoning playback or a render.
 *
 * Usage counting reads the PROJECT store (a track is "used" when a commercial's
 * `audio.musicTrackId` points at it), so the two repositories are composed at
 * the call site rather than the catalog knowing about projects.
 */
interface MusicRow {
  id: string
  data: string
}

export class MusicRepository {
  constructor(private readonly db: Database) {}

  private now(): string {
    return new Date().toISOString()
  }

  private fromRow(row: MusicRow): MusicTrack {
    return MusicTrack.parse(JSON.parse(row.data))
  }

  /** Insert or fully replace a track (validates + bumps updatedAt). */
  save(input: unknown): MusicTrack {
    const incoming = MusicTrack.parse(input)
    const track: MusicTrack = { ...incoming, updatedAt: this.now() }
    this.db.run(
      `INSERT INTO music_tracks (id, hash, created_at, updated_at, data)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         hash = excluded.hash,
         updated_at = excluded.updated_at,
         data = excluded.data`,
      [track.id, track.hash, track.createdAt, track.updatedAt, JSON.stringify(track)],
    )
    return track
  }

  get(id: string): MusicTrack | undefined {
    const row = this.db.get<MusicRow>('SELECT data FROM music_tracks WHERE id = ?', [id])
    return row ? this.fromRow(row) : undefined
  }

  /** Content-hash dedup: the same bytes are one catalog track, never two. */
  getByHash(hash: string): MusicTrack | undefined {
    const row = this.db.get<MusicRow>('SELECT data FROM music_tracks WHERE hash = ? LIMIT 1', [hash])
    return row ? this.fromRow(row) : undefined
  }

  list(): MusicTrack[] {
    const rows = this.db.all<MusicRow>('SELECT data FROM music_tracks ORDER BY updated_at DESC')
    return rows.map((r) => this.fromRow(r))
  }

  delete(id: string): boolean {
    const existed = this.db.get('SELECT id FROM music_tracks WHERE id = ?', [id])
    this.db.run('DELETE FROM music_tracks WHERE id = ?', [id])
    return Boolean(existed)
  }
}

/**
 * Which commercials select a given track. Pure over a project list so it is
 * testable without a database. A commercial counts as a user when its
 * persisted `audio.musicTrackId` equals the track id.
 */
export function usagesForTrack(
  trackId: string,
  projects: ReadonlyArray<{ id: string; name: string; audio: { musicTrackId: string | null } }>,
): MusicUsage[] {
  return projects
    .filter((p) => p.audio.musicTrackId === trackId)
    .map((p) => ({ projectId: p.id, projectName: p.name }))
}

/** Convenience: usages resolved through the project repository. */
export function trackUsages(trackId: string, projectRepo: ProjectRepository): MusicUsage[] {
  return usagesForTrack(trackId, projectRepo.list())
}
