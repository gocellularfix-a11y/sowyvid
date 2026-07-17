import { dialog, shell, BrowserWindow } from 'electron'
import { z } from 'zod'
import { existsSync, readFileSync } from 'node:fs'
import { IPC } from '@shared/ipc/channels'
import { ok, err } from '@shared/result'
import { MusicMetaPatch, type MusicTrack, type MusicTrackWithState } from '@shared/domain/music'
import type {
  MusicImportResult,
  MusicImportOutcome,
  MusicDeleteResult,
} from '@shared/ipc/api'
import { usagesForTrack } from '@database/index'
import { importMusicFile, removeMusicFile, MUSIC_EXTENSIONS } from '@features/music/musicVault.node'
import { resolveMusicVaultPath } from '@features/music/musicPath'
import { compileProjectConcept } from '@features/creative'
import { visualPlanForProject } from '@features/visual'
import { buildMusicBriefDetail, visualEnergyFrom, SUNO_CREATE_URL } from '@features/audio'
import { getAppPaths } from '../paths'
import { handle } from './registry'
import type { HandlerContext } from './registerHandlers'

/**
 * The global Music Center IPC. Every multi-commercial operation is owned and
 * validated HERE (never the renderer): the renderer sends ids + owner
 * decisions, the main process resolves the catalog, rebuilds nothing it should
 * not, and never deletes an owner's exported MP4 as a side effect.
 *
 * The manual Suno workflow writes a brief and opens the OFFICIAL site with
 * `shell.openExternal` — no unofficial API, no automation, no scraping.
 */

const musicDialogOptions: Electron.OpenDialogOptions = {
  title: 'Agregar música',
  properties: ['openFile', 'multiSelections'],
  filters: [{ name: 'Música (MP3, WAV)', extensions: [...MUSIC_EXTENSIONS] }],
}

/** E2E dialog-answer seam, symmetric with the media import seam. */
function seamMusicPaths(): string[] | null {
  const file = process.env.SOWYVID_E2E_IMPORT_PATHS_FILE
  if (file) {
    try {
      const raw = readFileSync(file, 'utf8').trim()
      const paths = raw.split(/[;\n]/).map((s) => s.trim()).filter(Boolean)
      return paths.length > 0 ? paths : null
    } catch {
      return null
    }
  }
  const list = process.env.SOWYVID_E2E_IMPORT_PATHS
  if (list) {
    const paths = list.split(';').filter(Boolean)
    return paths.length > 0 ? paths : null
  }
  return null
}

async function pickMusicPaths(explicit?: string[]): Promise<string[] | null> {
  if (explicit && explicit.length > 0) return explicit
  const seam = seamMusicPaths()
  if (seam) return seam
  const parent = BrowserWindow.getFocusedWindow()
  const picked = await (parent
    ? dialog.showOpenDialog(parent, musicDialogOptions)
    : dialog.showOpenDialog(musicDialogOptions))
  if (picked.canceled || picked.filePaths.length === 0) return null
  return picked.filePaths
}

export function registerMusicHandlers(ctx: HandlerContext): void {
  const vaultRoot = getAppPaths().music

  /** Decorate catalog tracks with live file state + usage. */
  const withState = (track: MusicTrack): MusicTrackWithState => {
    const abs = resolveMusicVaultPath(vaultRoot, track)
    const usages = usagesForTrack(track.id, ctx.repo.list())
    return {
      ...track,
      fileExists: Boolean(abs && existsSync(abs)),
      usageCount: usages.length,
      usages,
    }
  }

  /**
   * Import a batch into the global vault + catalog. Deduplicates by content
   * hash at BOTH layers: the vault reuses identical bytes, and the catalog
   * reuses an existing track for that hash (so five imports of one song are one
   * track with one physical file). `source`/`brief` seed brand-new tracks only.
   */
  const importBatch = async (
    paths: string[],
    seed: { source: MusicTrack['source']; sunoBrief?: string | null },
  ): Promise<MusicImportResult> => {
    const outcomes: MusicImportOutcome[] = []
    const tracks: MusicTrack[] = []
    for (const path of paths) {
      const outcome = await importMusicFile(vaultRoot, path)
      if (outcome.status === 'imported' || outcome.status === 'duplicate') {
        const trackId = `music_${outcome.hash}`
        let track = ctx.musicRepo.get(trackId) ?? ctx.musicRepo.getByHash(outcome.hash)
        if (!track) {
          const stem = outcome.originalName.replace(/\.[^.]+$/, '')
          const now = new Date().toISOString()
          track = ctx.musicRepo.save({
            id: trackId,
            relPath: outcome.relPath,
            originalName: outcome.originalName,
            title: stem,
            source: seed.source,
            sunoBrief: seed.sunoBrief ?? null,
            durationSec: outcome.analysis.durationSec,
            container: outcome.analysis.container,
            codec: outcome.analysis.codec,
            sampleRate: outcome.analysis.sampleRate,
            channels: outcome.analysis.channels,
            bytes: outcome.bytes,
            hash: outcome.hash,
            createdAt: now,
            updatedAt: now,
          })
        }
        tracks.push(track)
        outcomes.push({ status: outcome.status, originalName: outcome.originalName, trackId: track.id })
      } else {
        outcomes.push({
          status: outcome.status,
          originalName: outcome.originalName,
          detail: 'detail' in outcome ? outcome.detail : undefined,
        })
      }
    }
    if (tracks.length > 0) await ctx.db.persist()
    return { canceled: false, outcomes, tracks }
  }

  // ---- Catalog reads ----
  handle(IPC.MusicList, z.any(), () => ok(ctx.musicRepo.list().map(withState)))

  handle(IPC.MusicGet, z.object({ id: z.string() }), ({ id }) => {
    const track = ctx.musicRepo.get(id)
    return ok(track ? withState(track) : null)
  })

  // ---- Import ----
  handle(
    IPC.MusicImport,
    z.object({ paths: z.array(z.string()).optional() }).optional(),
    async (input) => {
      const chosen = await pickMusicPaths(input?.paths)
      if (!chosen) return ok<MusicImportResult>({ canceled: true, outcomes: [], tracks: [] })
      return ok(await importBatch(chosen, { source: 'imported' }))
    },
  )

  // ---- Metadata (progressive; nothing required before use) ----
  handle(
    IPC.MusicUpdateMeta,
    z.object({ id: z.string(), patch: MusicMetaPatch }),
    async ({ id, patch }) => {
      const track = ctx.musicRepo.get(id)
      if (!track) return err('NOT_FOUND', 'No encontramos esa música.')
      const saved = ctx.musicRepo.save({ ...track, ...patch })
      await ctx.db.persist()
      return ok(saved)
    },
  )

  // ---- Selection for the current commercial ----
  handle(
    IPC.MusicSelect,
    z.object({ projectId: z.string(), trackId: z.string().nullable() }),
    async ({ projectId, trackId }) => {
      const project = ctx.repo.get(projectId)
      if (!project) return err('NOT_FOUND', `Project not found: ${projectId}`)
      if (trackId && !ctx.musicRepo.get(trackId)) {
        return err('NOT_FOUND', 'Esa música ya no está en tu biblioteca.')
      }
      // Selecting a global track supersedes any legacy project-scoped music, so
      // clear musicId to keep a single source of truth for the export gate.
      const saved = ctx.repo.save({
        ...project,
        audio: { ...project.audio, musicTrackId: trackId, musicId: null },
      })
      await ctx.db.persist()
      return ok(saved)
    },
  )

  // ---- Deletion (unused only on this channel) ----
  handle(IPC.MusicDelete, z.object({ id: z.string() }), async ({ id }) => {
    const track = ctx.musicRepo.get(id)
    if (!track) return ok<MusicDeleteResult>({ deleted: true, blocked: false, usages: [] })
    const usages = usagesForTrack(id, ctx.repo.list())
    if (usages.length > 0) {
      return ok<MusicDeleteResult>({ deleted: false, blocked: true, usages })
    }
    const ext = track.relPath.split('.').pop()?.toLowerCase() ?? 'mp3'
    await removeMusicFile(vaultRoot, track.hash, ext)
    ctx.musicRepo.delete(id)
    await ctx.db.persist()
    return ok<MusicDeleteResult>({ deleted: true, blocked: false, usages: [] })
  })

  // ---- Owner-confirmed multi-project removal ----
  handle(
    IPC.MusicRemoveFromAll,
    z.object({ trackId: z.string(), deleteTrack: z.boolean() }),
    async ({ trackId, deleteTrack }) => {
      const track = ctx.musicRepo.get(trackId)
      if (!track) return ok<MusicDeleteResult>({ deleted: false, blocked: false, usages: [] })
      // Clear the selection from every commercial that uses it; each project's
      // export gate rebuilds from persisted state on next open/compile.
      for (const usage of usagesForTrack(trackId, ctx.repo.list())) {
        const project = ctx.repo.get(usage.projectId)
        if (!project) continue
        ctx.repo.save({ ...project, audio: { ...project.audio, musicTrackId: null } })
      }
      let deleted = false
      if (deleteTrack) {
        const ext = track.relPath.split('.').pop()?.toLowerCase() ?? 'mp3'
        await removeMusicFile(vaultRoot, track.hash, ext)
        ctx.musicRepo.delete(trackId)
        deleted = true
      }
      await ctx.db.persist()
      return ok<MusicDeleteResult>({ deleted, blocked: false, usages: [] })
    },
  )

  // ---- Owner-confirmed multi-project replacement ----
  handle(
    IPC.MusicReplaceEverywhere,
    z.object({ trackId: z.string(), newTrackId: z.string() }),
    async ({ trackId, newTrackId }) => {
      if (!ctx.musicRepo.get(newTrackId)) return err('NOT_FOUND', 'La música de reemplazo no existe.')
      let updated = 0
      for (const usage of usagesForTrack(trackId, ctx.repo.list())) {
        const project = ctx.repo.get(usage.projectId)
        if (!project) continue
        ctx.repo.save({ ...project, audio: { ...project.audio, musicTrackId: newTrackId } })
        updated += 1
      }
      if (updated > 0) await ctx.db.persist()
      return ok({ updated })
    },
  )

  // ---- Reveal managed file ----
  handle(IPC.MusicReveal, z.object({ id: z.string() }), ({ id }) => {
    const track = ctx.musicRepo.get(id)
    if (!track) return ok({ opened: false })
    const abs = resolveMusicVaultPath(vaultRoot, track)
    if (!abs || !existsSync(abs)) return ok({ opened: false })
    if (process.env.SOWYVID_E2E_SUPPRESS_OPEN === '1') return ok({ opened: true })
    shell.showItemInFolder(abs)
    return ok({ opened: true })
  })

  // ---- Deterministic Suno brief ----
  handle(
    IPC.MusicBrief,
    z.object({ projectId: z.string(), wantsVocals: z.boolean().optional() }),
    ({ projectId, wantsVocals }) => {
      const project = ctx.repo.get(projectId)
      if (!project) return err('NOT_FOUND', `Project not found: ${projectId}`)
      if (!project.creative) {
        return err('NOT_READY', 'Primero crea el comercial para generar un brief de música.')
      }
      const { renderPlan } = compileProjectConcept(project, project.creative.conceptId)
      const visualPlan = visualPlanForProject(project, renderPlan)
      // Deterministic: identical settings → identical brief.
      const detail = buildMusicBriefDetail({
        businessName: project.brief.businessName || project.name,
        industry: project.brief.category,
        productOrService: project.brief.productOrService || project.name,
        tone: visualPlan.artDirection.name,
        visualEnergy: visualEnergyFrom(visualPlan),
        durationSec: visualPlan.totalDurationInFrames / visualPlan.fps,
        mood: visualPlan.artDirection.name.replace(/-/g, ' '),
        ...(wantsVocals ? { wantsVocals } : {}),
      })
      return ok(detail)
    },
  )

  // ---- Open the official Suno site (manual workflow only) ----
  handle(IPC.MusicOpenSuno, z.any(), async () => {
    // Test seam: prove the invocation without launching a browser.
    if (process.env.SOWYVID_E2E_SUPPRESS_OPEN === '1') {
      process.env.SOWYVID_E2E_SUNO_OPENED = SUNO_CREATE_URL
      return ok({ opened: true })
    }
    await shell.openExternal(SUNO_CREATE_URL)
    return ok({ opened: true })
  })

  // ---- Import a downloaded Suno track ----
  handle(
    IPC.MusicImportSuno,
    z.object({ brief: z.string(), paths: z.array(z.string()).optional() }),
    async ({ brief, paths }) => {
      const chosen = await pickMusicPaths(paths)
      if (!chosen) return ok<MusicImportResult>({ canceled: true, outcomes: [], tracks: [] })
      return ok(await importBatch(chosen, { source: 'suno-manual', sunoBrief: brief }))
    },
  )
}
