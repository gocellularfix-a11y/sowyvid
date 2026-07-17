import { resolve, sep } from 'node:path'
import { isValidMusicTrackId, type MusicTrack } from '@shared/domain/music'

export { musicUrl } from './musicUrl'

/**
 * Single translation point from a stable music-track id/relPath to an absolute
 * file in the managed music vault. PURE (no fs) so it is fully testable, and
 * guarded so a crafted relPath can never escape the vault — the controlled
 * protocol and the render server both resolve music through here.
 */
export function resolveMusicVaultPath(vaultRoot: string, track: Pick<MusicTrack, 'id' | 'relPath'>): string | null {
  if (!isValidMusicTrackId(track.id)) return null
  if (!track.relPath) return null
  const filesRoot = resolve(vaultRoot, 'files')
  const abs = resolve(vaultRoot, track.relPath)
  // Managed music lives strictly under <vault>/files — blocks any `..` traversal.
  if (abs !== filesRoot && !abs.startsWith(filesRoot + sep)) return null
  return abs
}
