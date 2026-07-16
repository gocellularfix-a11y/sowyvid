import { app } from 'electron'
import { z } from 'zod'
import { IPC } from '@shared/ipc/channels'
import { type AppInfo } from '@shared/ipc/api'
import { Project, CreateProjectInput } from '@shared/domain/project'
import { ok, err, type Result } from '@shared/result'
import { generateScenePlan, listTemplates, getTemplate } from '@rules/index'
import type { PersistentDatabase } from '@database/index'
import { ProjectRepository } from '@database/index'
import { getAppPaths, projectDir } from '../paths'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { handle } from './registry'

export interface HandlerContext {
  db: PersistentDatabase
  repo: ProjectRepository
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
  handle(IPC.AppInfo, z.any(), (): Result<AppInfo> =>
    ok({
      name: 'SowyVid',
      version: app.getVersion(),
      platform: process.platform,
      userDataPath: getAppPaths().userData,
      mockAiActive: true,
      mode: app.isPackaged ? 'production' : 'development',
    }),
  )
  handle(IPC.Ping, z.string(), (message): Result<string> => ok(`pong: ${message}`))

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

  // ---- Templates ----
  handle(IPC.TemplateList, z.any(), () => ok(listTemplates()))

  // ---- Deterministic scene plan ----
  handle(
    IPC.PlanGenerate,
    z.object({ projectId: z.string(), templateId: z.string() }),
    async ({ projectId, templateId }) => {
      const project = repo.get(projectId)
      if (!project) return err('NOT_FOUND', `Project not found: ${projectId}`)
      const template = getTemplate(templateId)
      if (!template) return err('NOT_FOUND', `Template not found: ${templateId}`)

      const plan = generateScenePlan(project, template)
      // Persist the versions used so this project stays reproducible.
      repo.save({
        ...project,
        templateId: template.id,
        templateVersion: template.version,
        ruleEngineVersion: plan.engineVersion,
        status: project.status === 'draft' ? 'planned' : project.status,
      })
      await db.persist()
      return ok(plan)
    },
  )
}
