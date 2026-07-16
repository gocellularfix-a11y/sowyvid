import { nanoid } from 'nanoid'
import type { SowyvidBridge, AppInfo, CompiledConceptResult } from '@shared/ipc/api'
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
import {
  developProjectConcepts,
  compileProjectConcept,
  toRendererPlan,
  projectAssetResolver,
  listCreativeFamilies,
} from '@features/creative'
import { visualPlanForProject } from '@features/visual'
import { audioPlanForProject } from '@features/audio'
import { branding } from '@config/branding'

/**
 * Resolves the Electron bridge. In plain-browser preview mode (Playwright smoke
 * test, `npm run dev:renderer-only`) `window.sowyvid` is absent, so we return a
 * clearly-marked mock. Because the Northstar engine and its adapters are
 * isomorphic (pure, no Node APIs), family listing, concept development and
 * compilation are the REAL implementations here; only project storage is
 * in-memory (not persisted), and the UI shows a "preview mode" banner.
 */
const BROWSER_PREVIEW = typeof window !== 'undefined' && !window.sowyvid

function createMockBridge(): SowyvidBridge {
  const store = new Map<string, Project>()

  return {
    app: {
      info: (): Promise<Result<AppInfo>> =>
        Promise.resolve(
          ok({
            name: branding.productName,
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
          ok([...store.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))),
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
          creative: null,
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
    media: {
      import: () =>
        Promise.resolve(
          err('UNSUPPORTED', 'La importación de archivos solo está disponible en la app de escritorio.'),
        ),
      remove: () => Promise.resolve(err('UNSUPPORTED', 'No disponible en vista previa.')),
    },
    render: {
      // Exporting needs the desktop app (real render engine, real filesystem).
      // The browser preview reports an honest not-ready status instead.
      start: () =>
        Promise.resolve(err('UNSUPPORTED', 'Descargar video solo está disponible en la app de escritorio.')),
      cancel: () => Promise.resolve(ok(false)),
      status: ({ projectId }) => {
        const project = store.get(projectId)
        return Promise.resolve(
          ok({
            active: null,
            readiness: {
              ready: false,
              blockers: [
                {
                  code: (project ? 'render-active' : 'no-project') as 'render-active' | 'no-project',
                  message: 'Descargar video solo está disponible en la app de escritorio.',
                },
              ],
            },
            presets: [],
            defaultPreset: 'vertical' as const,
          }),
        )
      },
      listHistory: () => Promise.resolve(ok([])),
      retry: () =>
        Promise.resolve(err('UNSUPPORTED', 'Descargar video solo está disponible en la app de escritorio.')),
      openFile: () =>
        Promise.resolve(ok({ opened: false, fileExists: false, message: 'No disponible en vista previa.' })),
      openFolder: () =>
        Promise.resolve(ok({ opened: false, fileExists: false, message: 'No disponible en vista previa.' })),
    },
    engine: {
      families: () => Promise.resolve(ok(listCreativeFamilies())),
      developConcepts: ({ projectId, count }) => {
        const project = store.get(projectId)
        if (!project) return Promise.resolve(err('NOT_FOUND', 'Proyecto no encontrado'))
        return Promise.resolve(ok(developProjectConcepts(project, count)))
      },
      compile: ({ projectId, conceptId }) => {
        const project = store.get(projectId)
        if (!project) return Promise.resolve(err('NOT_FOUND', 'Proyecto no encontrado'))
        try {
          const { renderPlan, selection } = compileProjectConcept(project, conceptId)
          const rendererPlan = toRendererPlan(renderPlan, projectAssetResolver(project))
          const visualPlan = visualPlanForProject(project, renderPlan)
          const audioPlan = audioPlanForProject(project, visualPlan)
          const next = { ...project, creative: selection, updatedAt: new Date().toISOString() }
          store.set(project.id, next)
          const result: CompiledConceptResult = { renderPlan, rendererPlan, visualPlan, audioPlan, selection }
          return Promise.resolve(ok(result))
        } catch (e) {
          return Promise.resolve(err('INTERNAL', e instanceof Error ? e.message : String(e)))
        }
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
