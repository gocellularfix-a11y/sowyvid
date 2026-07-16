import type { Result } from '../result'
import type { Project, CreateProjectInput, CreativeSelection } from '../domain/project'
import type { CreativePlan, CommercialRenderPlan } from '@jorge-engines/northstar-creative'
import type { CreativeFamilyInfo } from '@features/creative/families'
import type { SowyvidRendererPlan } from '@features/creative/creativePlanToRenderer'
import type { MediaImportResult, MediaRemoveResult } from '@features/media/types'
import type { VisualPlan } from '@features/visual/visualPlan'

/**
 * The typed surface exposed to the renderer via the secure preload bridge
 * (`window.sowyvid`). This is the ONLY way the renderer talks to the main
 * process — there is no generic `ipcRenderer` access in the renderer.
 *
 * The `engine` namespace fronts the deterministic creative engine
 * (deterministic-creative-engine v2) through app-side adapters.
 */

export interface AppInfo {
  name: string
  version: string
  platform: NodeJS.Platform
  userDataPath: string
  mockAiActive: boolean
  mode: 'development' | 'production'
}

export interface CompiledConceptResult {
  renderPlan: CommercialRenderPlan
  rendererPlan: SowyvidRendererPlan
  visualPlan: VisualPlan
  selection: CreativeSelection
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
  media: {
    /**
     * Import local files into the project's managed storage. With `paths`, those
     * files are imported directly (used by tests/automation); without, the main
     * process opens the OS file picker.
     */
    import(input: { projectId: string; paths?: string[] }): Promise<Result<MediaImportResult>>
    /**
     * Remove a managed media asset. Blocked (not removed) when the asset is still
     * referenced, unless `force` is set. Returns where it is used.
     */
    remove(input: {
      projectId: string
      mediaId: string
      force?: boolean
    }): Promise<Result<MediaRemoveResult>>
  }
  engine: {
    /** Owner-facing creative families for the "choose your style" step. */
    families(): Promise<Result<CreativeFamilyInfo[]>>
    /** Develop N ranked, deterministic creative concepts for a project. */
    developConcepts(input: { projectId: string; count: number }): Promise<Result<CreativePlan[]>>
    /** Compile a chosen concept into a validated render plan; persists selection. */
    compile(input: { projectId: string; conceptId: string }): Promise<Result<CompiledConceptResult>>
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
