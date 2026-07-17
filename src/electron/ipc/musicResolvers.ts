import { existsSync } from 'node:fs'
import type { MusicRepository } from '@database/index'
import type { ResolvedMusicTrack } from '@features/audio'
import { resolveMusicVaultPath } from '@features/music/musicPath'
import { getAppPaths } from '../paths'

/**
 * The two ways the catalog answers about a selected global track, kept in one
 * place so the compile handler (plan building) and the render handler (loopback
 * media server) resolve music identically.
 *
 * - `resolveMusicTrack(id)` → facts for the AudioPlan (duration + whether the
 *   managed file is actually present, so a deleted-file track shows as missing
 *   rather than a silent hole).
 * - `resolveMusicPath(id)` → absolute vault path for the render media server,
 *   guarded to stay inside the music vault.
 */
export function resolveMusicTrackFrom(musicRepo: MusicRepository): (trackId: string) => ResolvedMusicTrack | null {
  const vaultRoot = getAppPaths().music
  return (trackId) => {
    const track = musicRepo.get(trackId)
    if (!track) return null
    const abs = resolveMusicVaultPath(vaultRoot, track)
    return { id: track.id, durationSec: track.durationSec, valid: Boolean(abs && existsSync(abs)) }
  }
}

export function resolveMusicPathFrom(musicRepo: MusicRepository): (trackId: string) => string | null {
  const vaultRoot = getAppPaths().music
  return (trackId) => {
    const track = musicRepo.get(trackId)
    if (!track) return null
    return resolveMusicVaultPath(vaultRoot, track)
  }
}
