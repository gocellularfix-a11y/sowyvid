import { existsSync, mkdirSync, copyFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { resolveManagedMediaPath } from '@features/media/managedPath'
import { analyzeMusicFile } from '@features/media/analysis.node'
import { getAppPaths, projectDir } from '../paths'
import type { HandlerContext } from './registerHandlers'

/** Paths the migration needs, injected so it is testable without Electron. */
export interface LegacyMusicPaths {
  vaultRoot: string
  projectDirOf: (projectId: string) => string
}

/**
 * One-time, idempotent migration of PROJECT-SCOPED music into the global Music
 * Center catalog. Before the Music Center, a commercial's music was a project
 * media asset (`audio.musicId`); those projects must keep working AND their
 * tracks must appear in the shared library.
 *
 * Safety contract (§1 / §12):
 *   - deduplicate by content hash — identical bytes become ONE catalog track,
 *     copied into the vault at most once (never five copies for five projects);
 *   - preserve the existing selection — set `audio.musicTrackId`, KEEP the legacy
 *     `audio.musicId`, so nothing is silently rewritten and old projects stay
 *     renderable either way;
 *   - never touch owner files outside managed storage — it only reads the
 *     project's managed media and writes into the managed music vault;
 *   - never throw — a per-project problem is skipped, not fatal.
 *
 * Idempotent: a project that already has `musicTrackId` is skipped, so it runs
 * safely on every startup.
 */
export async function migrateLegacyProjectMusic(
  ctx: HandlerContext,
  paths: LegacyMusicPaths = { vaultRoot: getAppPaths().music, projectDirOf: projectDir },
): Promise<number> {
  const { vaultRoot, projectDirOf } = paths
  let migrated = 0

  for (const project of ctx.repo.list()) {
    try {
      if (project.audio.musicTrackId) continue // already on the global catalog
      const legacyId = project.audio.musicId
      if (!legacyId) continue

      const asset = project.media.find((m) => m.id === legacyId && m.kind === 'audio')
      if (!asset || !asset.valid || !asset.hash) continue

      const src = resolveManagedMediaPath(projectDirOf(project.id), asset, 'original')
      if (!src || !existsSync(src)) continue

      const hash = asset.hash
      const trackId = `music_${hash}`
      let track = ctx.musicRepo.get(trackId) ?? ctx.musicRepo.getByHash(hash)

      if (!track) {
        const ext = asset.relPath.split('.').pop()?.toLowerCase() ?? 'mp3'
        const relPath = `files/${hash}.${ext}`
        const dest = join(vaultRoot, relPath)
        if (!existsSync(dest)) {
          mkdirSync(dirname(dest), { recursive: true })
          copyFileSync(src, dest) // dedup by hash: copied at most once
        }
        const analysis = await analyzeMusicFile(dest)
        const stem = asset.originalName.replace(/\.[^.]+$/, '')
        track = ctx.musicRepo.save({
          id: trackId,
          relPath,
          originalName: asset.originalName,
          title: stem,
          source: 'imported',
          durationSec: asset.durationSec ?? analysis.durationSec,
          container: analysis.container,
          codec: analysis.codec,
          sampleRate: analysis.sampleRate,
          channels: analysis.channels,
          bytes: asset.bytes,
          hash,
          createdAt: asset.importedAt,
          updatedAt: new Date().toISOString(),
        })
      }

      // Preserve the selection; keep the legacy id (do not discard/rewrite).
      ctx.repo.save({ ...project, audio: { ...project.audio, musicTrackId: track.id } })
      migrated += 1
    } catch {
      // A single project's problem must never block the others or startup.
    }
  }

  if (migrated > 0) await ctx.db.persist()
  return migrated
}
