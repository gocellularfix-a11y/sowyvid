import { nanoid } from 'nanoid'
import type { SowyvidBridge, AppInfo } from '@shared/ipc/api'
import { ok, err, type Result } from '@shared/result'
import {
  Project,
  CreateProjectInput,
  CommercialBrief,
  BrandPreferences,
  VideoConfig,
  AudioConfig,
  RenderConfig,
} from '@shared/domain/project'
import { listTemplates, getTemplate, generateScenePlan } from '@rules/index'

/**
 * Resolves the Electron bridge. In plain-browser preview mode (Playwright smoke
 * test, `npm run dev:renderer-only`) `window.sowyvid` is absent, so we return a
 * clearly-marked mock. Because the template engine and domain schemas are
 * isomorphic (pure, no Node APIs), templates and scene-plan generation are the
 * REAL implementations here; only project storage is in-memory (not persisted),
 * and the UI shows a "preview mode" banner so this is never mistaken for the app.
 */
const BROWSER_PREVIEW = typeof window !== 'undefined' && !window.sowyvid

function createMockBridge(): SowyvidBridge {
  const store = new Map<string, Project>()

  return {
    app: {
      info: (): Promise<Result<AppInfo>> =>
        Promise.resolve(
          ok({
            name: 'SowyVid',
            version: '0.1.0-preview',
            platform: 'browser' as NodeJS.Platform,
            userDataPath: '(browser preview — no filesystem)',
            mockAiActive: true,
            mode: 'development',
          }),
        ),
      ping: (message: string) => Promise.resolve(ok(`pong: ${message}`)),
    },
    projects: {
      list: () =>
        Promise.resolve(
          ok(
            [...store.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
          ),
        ),
      create: (input) => {
        const parsed = CreateProjectInput.parse(input)
        const ts = new Date().toISOString()
        const project = Project.parse({
          id: `proj_${nanoid(10)}`,
          name: parsed.name,
          brief: CommercialBrief.parse(parsed.brief ?? {}),
          brand: BrandPreferences.parse({}),
          video: VideoConfig.parse({}),
          audio: AudioConfig.parse({}),
          render: RenderConfig.parse({}),
          targetPlatform: 'instagram-reel',
          templateId: null,
          templateVersion: null,
          ruleEngineVersion: null,
          media: [],
          status: 'draft',
          createdAt: ts,
          updatedAt: ts,
        })
        store.set(project.id, project)
        return Promise.resolve(ok(project))
      },
      get: (id) => Promise.resolve(ok(store.get(id) ?? null)),
      save: (project) => {
        const parsed = Project.parse(project)
        const next = { ...parsed, updatedAt: new Date().toISOString() }
        store.set(next.id, next)
        return Promise.resolve(ok(next))
      },
      delete: (id) => Promise.resolve(ok(store.delete(id))),
    },
    templates: {
      list: () => Promise.resolve(ok(listTemplates())),
    },
    plan: {
      generate: ({ projectId, templateId }) => {
        const project = store.get(projectId)
        if (!project) return Promise.resolve(err('NOT_FOUND', 'Proyecto no encontrado'))
        const template = getTemplate(templateId)
        if (!template) return Promise.resolve(err('NOT_FOUND', 'Plantilla no encontrada'))
        return Promise.resolve(ok(generateScenePlan(project, template)))
      },
    },
    on: () => () => undefined,
  }
}

let mock: SowyvidBridge | null = null

export function getBridge(): SowyvidBridge {
  if (typeof window !== 'undefined' && window.sowyvid) return window.sowyvid
  if (!mock) mock = createMockBridge()
  return mock
}

/** True when running in a plain browser without the Electron main process. */
export const isBrowserPreview = BROWSER_PREVIEW
