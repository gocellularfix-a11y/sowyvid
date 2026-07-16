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
import type { MediaImportResult } from '@features/media/types'
import { SUPPORTED_EXTENSIONS } from '@features/media/limits'
import {
  developProjectConcepts,
  compileProjectConcept,
  toRendererPlan,
  projectAssetResolver,
  listCreativeFamilies,
} from '@features/creative'
import type { PersistentDatabase } from '@database/index'
import { ProjectRepository } from '@database/index'
import { branding } from '@config/branding'
import { getAppPaths, projectDir } from '../paths'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { handle } from './registry'

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

  handle(IPC.ProjectGet, z.string(), (id) => ok(repo.get(id) ?? null))

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
      const saved = repo.save({ ...project, media: summary.media })
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
      const vaultRoot = join(projectDir(projectId), 'media')
      const media = await removeMedia(vaultRoot, project.media, mediaId)
      const saved = repo.save({ ...project, media })
      await db.persist()
      return ok(saved)
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

      // Persist the reproducible selection so the concept survives restart.
      repo.save({
        ...project,
        creative: selection,
        status: project.status === 'draft' ? 'planned' : project.status,
      })
      await db.persist()

      const result: CompiledConceptResult = { renderPlan, rendererPlan, selection }
      return ok(result)
    },
  )
}
