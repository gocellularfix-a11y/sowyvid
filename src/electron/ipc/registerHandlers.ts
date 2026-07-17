import { app, dialog, BrowserWindow } from 'electron'
import { z } from 'zod'
import { IPC } from '@shared/ipc/channels'
import { type CompiledConceptResult } from '@shared/ipc/api'
import { Project, CreateProjectInput } from '@shared/domain/project'
import { ok, err } from '@shared/result'
import {
  importMedia,
  removeMedia,
  type MediaImportInput,
} from '@features/media/mediaImport.node'
import { clearAssetReferences, retargetAssetReferences } from '@features/media/referenceEdits'
import { analyzeMedia } from '@features/media/analysis.node'
import { findMediaReferences, markMissingMedia } from '@features/media/mediaReferences'
import type { MediaRemoveResult } from '@features/media/types'
import { existsSync, cpSync, rmSync, readFileSync } from 'node:fs'
import type { MediaImportResult } from '@features/media/types'
import { SUPPORTED_EXTENSIONS } from '@features/media/limits'
import {
  developProjectConcepts,
  compileProjectConcept,
  toRendererPlan,
  projectAssetResolver,
  listCreativeFamilies,
} from '@features/creative'
import { visualPlanForProject } from '@features/visual'
import { audioPlanForProject } from '@features/audio'
import type { PersistentDatabase } from '@database/index'
import { ProjectRepository, MusicRepository } from '@database/index'
import { branding } from '@config/branding'
import { getAppPaths, projectDir } from '../paths'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { handle } from './registry'
import { registerRenderHandlers } from './renderHandlers'
import { registerMusicHandlers } from './registerMusicHandlers'
import { resolveMusicTrackFrom } from './musicResolvers'

export interface HandlerContext {
  db: PersistentDatabase
  repo: ProjectRepository
  musicRepo: MusicRepository
}

function openMediaDialogOptions(): Electron.OpenDialogOptions {
  return {
    title: 'Agregar fotos y videos',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Fotos, videos y audio', extensions: [...SUPPORTED_EXTENSIONS] }],
  }
}

/**
 * E2E dialog-answer seam. Returns the file paths a test wants the OS open
 * dialog to "return", or null to fall through to the real picker. Two forms:
 *
 *   SOWYVID_E2E_IMPORT_PATHS      — a fixed ';'-separated list (whole session)
 *   SOWYVID_E2E_IMPORT_PATHS_FILE — a file re-READ on every call, so one running
 *                                   app can import different files into different
 *                                   commercials (needed to drive two commercials
 *                                   from a single session). Empty/absent → null.
 *
 * Both answer ONLY the dialog; the import pipeline that follows is identical to
 * production. The file form is deleted-safe: a missing file means "no seam".
 */
function seamImportPaths(): string[] | null {
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

/** Create the managed folder tree for a project (media/thumbnails/audio/...). */
function ensureProjectFolders(projectId: string): void {
  const base = projectDir(projectId)
  for (const sub of ['media', 'thumbnails', 'audio', 'renders', 'temp']) {
    mkdirSync(join(base, sub), { recursive: true })
  }
}

export function registerHandlers(ctx: HandlerContext): void {
  const { db, repo } = ctx

  // ---- System ----
  handle(IPC.AppInfo, z.any(), () =>
    ok({
      name: branding.productName,
      version: app.getVersion(),
      platform: process.platform,
      userDataPath: getAppPaths().userData,
      mockAiActive: true,
      mode: app.isPackaged ? 'production' : ('development' as const),
    }),
  )
  handle(IPC.Ping, z.string(), (message) => ok(`pong: ${message}`))

  // ---- Projects ----
  handle(IPC.ProjectList, z.any(), () => ok(repo.list()))

  handle(IPC.ProjectCreate, CreateProjectInput, async (input) => {
    const project = repo.create(input)
    ensureProjectFolders(project.id)
    await db.persist()
    return ok(project)
  })

  handle(IPC.ProjectGet, z.string(), (id) => {
    const project = repo.get(id)
    if (!project) return ok(null)
    // Detect managed media whose file went missing (flagged, not persisted).
    const base = projectDir(id)
    const media = markMissingMedia(project.media, (rel) => existsSync(join(base, rel)))
    return ok({ ...project, media })
  })

  handle(IPC.ProjectUpdate, Project, async (project) => {
    const saved = repo.save(project)
    await db.persist()
    return ok(saved)
  })

  handle(IPC.ProjectDelete, z.string(), async (id) => {
    const existed = repo.delete(id)
    await db.persist()
    return ok(existed)
  })

  // Duplicate a commercial: new identity, copied managed material, copied
  // brief/style/audio choices — but NO export history (those belong to the
  // original's real renders).
  handle(IPC.ProjectDuplicate, z.object({ projectId: z.string() }), async ({ projectId }) => {
    const source = repo.get(projectId)
    if (!source) return err('NOT_FOUND', `Project not found: ${projectId}`)

    const created = repo.create({ name: `Copia de ${source.name}`.slice(0, 120) })
    ensureProjectFolders(created.id)
    // Managed media is project-relative, so a directory copy keeps every
    // relPath valid in the duplicate.
    const sourceMedia = join(projectDir(source.id), 'media')
    if (existsSync(sourceMedia)) {
      cpSync(sourceMedia, join(projectDir(created.id), 'media'), { recursive: true })
    }
    const saved = repo.save({
      ...source,
      id: created.id,
      name: created.name,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    })
    await db.persist()
    return ok(saved)
  })

  // Delete a whole commercial. Managed material always goes with it; files the
  // owner exported to their OWN folders are deleted only with the explicit
  // flag — and even then, only records that this app wrote.
  handle(
    IPC.ProjectDeleteCommercial,
    z.object({ projectId: z.string(), deleteExportedFiles: z.boolean().optional() }),
    async ({ projectId, deleteExportedFiles }) => {
      const project = repo.get(projectId)
      if (!project) return err('NOT_FOUND', `Project not found: ${projectId}`)

      let exportedFilesDeleted = 0
      if (deleteExportedFiles) {
        for (const record of repo.listExports(projectId)) {
          if (record.status !== 'completed') continue
          const path = record.outputPath
          if (!path.toLowerCase().endsWith('.mp4') || !existsSync(path)) continue
          try {
            rmSync(path)
            exportedFilesDeleted += 1
          } catch {
            // Locked/unreachable file: leave it — deletion must never crash.
          }
        }
      }

      const deleted = repo.deleteCommercial(projectId)
      try {
        rmSync(projectDir(projectId), { recursive: true, force: true })
      } catch {
        // Managed-dir cleanup is best-effort; the database row removal is what
        // makes the commercial disappear from the app.
      }
      await db.persist()
      return ok({ deleted, exportedFilesDeleted })
    },
  )

  // ---- Media import (MediaVault) ----
  handle(
    IPC.MediaImport,
    z.object({ projectId: z.string(), paths: z.array(z.string()).optional() }),
    async ({ projectId, paths }) => {
      const project = repo.get(projectId)
      if (!project) return err('NOT_FOUND', `Project not found: ${projectId}`)

      let filePaths = paths ?? seamImportPaths() ?? undefined
      if (!filePaths) {
        const parent = BrowserWindow.getFocusedWindow()
        const picked = await (parent
          ? dialog.showOpenDialog(parent, openMediaDialogOptions())
          : dialog.showOpenDialog(openMediaDialogOptions()))
        if (picked.canceled || picked.filePaths.length === 0) {
          const empty: MediaImportResult = { canceled: true, outcomes: [], project }
          return ok(empty)
        }
        filePaths = picked.filePaths
      }

      const inputs: MediaImportInput[] = filePaths.map((path) => ({ kind: 'path', path }))
      const vaultRoot = join(projectDir(projectId), 'media')
      const summary = await importMedia(vaultRoot, project.media, inputs)
      // Deeper analysis (probe + thumbnail/poster) runs as child processes, off
      // the main JS thread; failures never invalidate an otherwise-valid file.
      const analyzedMedia = await analyzeMedia(vaultRoot, summary.media)

      // An owner who adds a music file wants it in their commercial — before
      // this, an imported mp3 sat unused and the export was silently mute (the
      // packaged-app failure Jorge reproduced). Auto-select the first valid
      // audio import as the commercial's music when none is chosen; the owner
      // can change or remove it from the interface.
      let audio = project.audio
      if (!audio.musicId) {
        const firstMusic = analyzedMedia.find((m) => m.kind === 'audio' && m.valid)
        if (firstMusic) audio = { ...audio, musicId: firstMusic.id }
      }

      const saved = repo.save({ ...project, media: analyzedMedia, audio })
      await db.persist()
      const result: MediaImportResult = { canceled: false, outcomes: summary.outcomes, project: saved }
      return ok(result)
    },
  )

  handle(
    IPC.MediaRemove,
    z.object({ projectId: z.string(), mediaId: z.string() }),
    async ({ projectId, mediaId }) => {
      const project = repo.get(projectId)
      if (!project) return err('NOT_FOUND', `Project not found: ${projectId}`)

      // Reference safety: never silently delete media still in use. The UI
      // turns `blocked` into a real decision dialog (replace / remove / cancel);
      // there is NO bypass flag on this channel.
      const references = findMediaReferences(mediaId, {
        project,
        versions: repo.listVersions(projectId),
      })
      if (references.length > 0) {
        const blocked: MediaRemoveResult = { removed: false, blocked: true, references, project }
        return ok(blocked)
      }

      const vaultRoot = join(projectDir(projectId), 'media')
      const media = await removeMedia(vaultRoot, project.media, mediaId)
      // Clear any soft references so nothing dangles (a dangling musicId would
      // block every export with an error the owner cannot see the cause of).
      const saved = repo.save(clearAssetReferences(project, mediaId, media))
      await db.persist()
      const result: MediaRemoveResult = { removed: true, blocked: false, references: [], project: saved }
      return ok(result)
    },
  )

  // Owner-CONFIRMED removal of a referenced asset. The main process owns the
  // whole cascade: clear references, drop the managed file + derivatives, and
  // persist a project that still compiles. Exported MP4s are never touched —
  // they live at owner-chosen paths outside managed storage.
  handle(
    IPC.MediaRemoveReferenced,
    z.object({ projectId: z.string(), mediaId: z.string() }),
    async ({ projectId, mediaId }) => {
      const project = repo.get(projectId)
      if (!project) return err('NOT_FOUND', `Project not found: ${projectId}`)
      if (!project.media.some((m) => m.id === mediaId)) {
        return err('NOT_FOUND', 'Ese archivo ya no está en el comercial.')
      }

      const vaultRoot = join(projectDir(projectId), 'media')
      const media = await removeMedia(vaultRoot, project.media, mediaId)
      const saved = repo.save(clearAssetReferences(project, mediaId, media))
      await db.persist()
      const result: MediaRemoveResult = { removed: true, blocked: false, references: [], project: saved }
      return ok(result)
    },
  )

  // Replace a referenced asset: import the picked file, retarget references,
  // remove the old managed file. One operation, main-owned, never partial —
  // if the owner cancels the picker nothing changes.
  handle(
    IPC.MediaReplace,
    z.object({ projectId: z.string(), mediaId: z.string() }),
    async ({ projectId, mediaId }) => {
      const project = repo.get(projectId)
      if (!project) return err('NOT_FOUND', `Project not found: ${projectId}`)
      if (!project.media.some((m) => m.id === mediaId)) {
        return err('NOT_FOUND', 'Ese archivo ya no está en el comercial.')
      }

      let filePaths = seamImportPaths() ?? undefined
      if (!filePaths) {
        const parent = BrowserWindow.getFocusedWindow()
        const options: Electron.OpenDialogOptions = {
          ...openMediaDialogOptions(),
          title: 'Elegir archivo de reemplazo',
          properties: ['openFile'],
        }
        const picked = await (parent
          ? dialog.showOpenDialog(parent, options)
          : dialog.showOpenDialog(options))
        if (picked.canceled || picked.filePaths.length === 0) {
          const canceled: MediaImportResult = { canceled: true, outcomes: [], project }
          return ok(canceled)
        }
        filePaths = [picked.filePaths[0]!]
      }

      const vaultRoot = join(projectDir(projectId), 'media')
      const summary = await importMedia(vaultRoot, project.media, [
        { kind: 'path', path: filePaths[0]! },
      ])
      const imported = summary.outcomes.find(
        (o) => (o.status === 'imported' || o.status === 'duplicate') && o.asset,
      )
      if (!imported?.asset) {
        // Nothing usable came in — report the outcomes, change nothing.
        const failed: MediaImportResult = { canceled: false, outcomes: summary.outcomes, project }
        return ok(failed)
      }
      const analyzedMedia = await analyzeMedia(vaultRoot, summary.media)
      const replacement = analyzedMedia.find((m) => m.id === imported.asset!.id)!

      // Same-file "replacement" (dedup hit on the asset being replaced) is a no-op.
      if (replacement.id === mediaId) {
        const saved = repo.save({ ...project, media: analyzedMedia })
        await db.persist()
        const noop: MediaImportResult = { canceled: false, outcomes: summary.outcomes, project: saved }
        return ok(noop)
      }

      const withoutOld = await removeMedia(vaultRoot, analyzedMedia, mediaId)
      const saved = repo.save(
        retargetAssetReferences(project, mediaId, replacement, withoutOld),
      )
      await db.persist()
      const result: MediaImportResult = { canceled: false, outcomes: summary.outcomes, project: saved }
      return ok(result)
    },
  )

  // ---- Creative engine ----
  handle(IPC.EngineFamilies, z.any(), () => ok(listCreativeFamilies()))

  handle(
    IPC.EngineDevelopConcepts,
    z.object({ projectId: z.string(), count: z.number().int().min(1).max(15) }),
    ({ projectId, count }) => {
      const project = repo.get(projectId)
      if (!project) return err('NOT_FOUND', `Project not found: ${projectId}`)
      return ok(developProjectConcepts(project, count))
    },
  )

  handle(
    IPC.EngineCompile,
    z.object({ projectId: z.string(), conceptId: z.string() }),
    async ({ projectId, conceptId }) => {
      const project = repo.get(projectId)
      if (!project) return err('NOT_FOUND', `Project not found: ${projectId}`)

      const { renderPlan, selection } = compileProjectConcept(project, conceptId)
      const rendererPlan = toRendererPlan(renderPlan, projectAssetResolver(project))
      const visualPlan = visualPlanForProject(project, renderPlan)
      // Sound shares the picture's timeline, so the AudioPlan is built FROM the
      // VisualPlan rather than from the render plan independently. The global
      // Music Center track (if one is selected) is resolved through the catalog.
      const audioPlan = audioPlanForProject(project, visualPlan, resolveMusicTrackFrom(ctx.musicRepo))

      // Persist the reproducible selection so the concept survives restart.
      repo.save({
        ...project,
        creative: selection,
        status: project.status === 'draft' ? 'planned' : project.status,
      })
      await db.persist()

      const result: CompiledConceptResult = { renderPlan, rendererPlan, visualPlan, audioPlan, selection }
      return ok(result)
    },
  )

  // ---- Music Center (global catalog + manual Suno workflow) ----
  registerMusicHandlers(ctx)

  // ---- Rendering (owner MP4 export) ----
  registerRenderHandlers(ctx)
}
