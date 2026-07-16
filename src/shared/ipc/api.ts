import type { Result } from '../result'
import type { Project, CreateProjectInput } from '../domain/project'
import type { Template } from '../domain/template'
import type { ScenePlan } from '../domain/scenePlan'

/**
 * The typed surface exposed to the renderer via the secure preload bridge
 * (`window.sowyvid`). This is the ONLY way the renderer talks to the main
 * process — there is no generic `ipcRenderer` access in the renderer.
 */

export interface AppInfo {
  name: 'SowyVid'
  version: string
  platform: NodeJS.Platform
  userDataPath: string
  mockAiActive: boolean
  mode: 'development' | 'production'
}

export interface SowyvidBridge {
  app: {
    info(): Promise<Result<AppInfo>>
    ping(message: string): Promise<Result<string>>
  }
  projects: {
    list(): Promise<Result<Project[]>>
    create(input: CreateProjectInput): Promise<Result<Project>>
    get(id: string): Promise<Result<Project | null>>
    save(project: Project): Promise<Result<Project>>
    delete(id: string): Promise<Result<boolean>>
  }
  templates: {
    list(): Promise<Result<Template[]>>
  }
  plan: {
    /** Generate a deterministic scene plan for a project + template. */
    generate(input: { projectId: string; templateId: string }): Promise<Result<ScenePlan>>
  }
  /** Subscribe to a main-process event channel; returns an unsubscribe fn. */
  on(channel: string, listener: (payload: unknown) => void): () => void
}

declare global {
  interface Window {
    /** Injected by the preload. Undefined only in plain-browser preview mode. */
    sowyvid?: SowyvidBridge
  }
}
