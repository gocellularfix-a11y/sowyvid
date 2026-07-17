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
import { analyzeMedia } from '@features/media/analysis.node'
import { findMediaReferences, markMissingMedia } from '@features/media/mediaReferences'
import type { MediaRemoveResult } from '@features/media/types'
import { existsSync } from 'node:fs'
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
import { ProjectRepository } from '@database/index'
import { branding } from '@config/branding'
import { getAppPaths, projectDir } from '../paths'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { handle } from './registry'
import { registerRenderHandlers } from './renderHandlers'

export interface HandlerContext {
  db: PersistentDatabase
  repo: ProjectRepository
}

function openMediaDialogOptions(): Electron.OpenDialogOptions {
  return {
    title: 'Agregar fotos y videos',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Fotos, videos y audio', extensions: [...SUPPORTED_EXTENSIONS] }],
  }
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

  // ---- Media import (MediaVault) ----
  handle(
    IPC.MediaImport,
    z.object({ projectId: z.string(), paths: z.array(z.string()).optional() }),
    async ({ projectId, paths }) => {
      const project = repo.get(projectId)
      if (!project) return err('NOT_FOUND', `Project not found: ${projectId}`)

      let filePaths = paths
      if (!filePaths && process.env.SOWYVID_E2E_IMPORT_PATHS) {
        // E2E seam, symmetric with SOWYVID_E2E_EXPORT_DIR: replaces only the
        // OPEN dialog's answer so tests can drive the real "Este equipo"
        // button; the import pipeline is identical.
        filePaths = process.env.SOWYVID_E2E_IMPORT_PATHS.split(';').filter(Boolean)
      }
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
    z.object({ projectId: z.string(), mediaId: z.string(), force: z.boolean().optional() }),
    async ({ projectId, mediaId, force }) => {
      const project = repo.get(projectId)
      if (!project) return err('NOT_FOUND', `Project not found: ${projectId}`)

      // Reference safety: never silently delete media still in use.
      const references = findMediaReferences(mediaId, {
        project,
        versions: repo.listVersions(projectId),
      })
      if (references.length > 0 && !force) {
        const blocked: MediaRemoveResult = { removed: false, blocked: true, references, project }
        return ok(blocked)
      }

      const vaultRoot = join(projectDir(projectId), 'media')
      const media = await removeMedia(vaultRoot, project.media, mediaId)
      // If this was the brand logo or the selected music, clear the reference
      // so nothing dangles (a dangling musicId would block every export with a
      // missing-audio error the owner cannot see the cause of).
      const brand =
        project.brand.logoMediaId === mediaId
          ? { ...project.brand, logoMediaId: null }
          : project.brand
      const audio =
        project.audio.musicId === mediaId
          ? { ...project.audio, musicId: null }
          : project.audio
      const saved = repo.save({ ...project, brand, audio, media })
      await db.persist()
      const result: MediaRemoveResult = { removed: true, blocked: false, references: [], project: saved }
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
      // VisualPlan rather than from the render plan independently.
      const audioPlan = audioPlanForProject(project, visualPlan)

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

  // ---- Rendering (owner MP4 export) ----
  registerRenderHandlers(ctx)
}
