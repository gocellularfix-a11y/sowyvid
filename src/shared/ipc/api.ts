import type { Result } from '../result'
import type { Project, CreateProjectInput, CreativeSelection } from '../domain/project'
import type { CreativePlan, CommercialRenderPlan } from '@jorge-engines/northstar-creative'
import type { CreativeFamilyInfo } from '@features/creative/families'
import type { SowyvidRendererPlan } from '@features/creative/creativePlanToRenderer'
import type { MediaImportResult, MediaRemoveResult } from '@features/media/types'
import type { VisualPlan } from '@features/visual/visualPlan'
import type { AudioPlan } from '@features/audio/audioPlan'
import type { ExportRecordWithFileState } from '../domain/exportRecord'
import type { RenderJobSnapshot } from '@features/render/jobRegistry'
import type { RenderReadiness } from '@features/render/readiness'
import type { ExportPresetId, ExportPresetInfo } from '@features/render/exportPresets'

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
  /** SoundWeave's decisions for this commercial; carries engine name/version. */
  audioPlan: AudioPlan
  selection: CreativeSelection
}

/** Outcome of asking to start (or retry) a render. */
export interface RenderStartResult {
  /** True when the owner dismissed the save dialog — no job was created. */
  canceled: boolean
  job: RenderJobSnapshot | null
}

export interface RenderStatusResult {
  /** The active job for this project, if any. */
  active: RenderJobSnapshot | null
  /** Whether "Descargar video" may be enabled, with Spanish blockers when not. */
  readiness: RenderReadiness
  /** Preset catalog with per-plan renderability, plus the default selection. */
  presets: Array<ExportPresetInfo & { renderable: boolean }>
  defaultPreset: ExportPresetId
}

/** Outcome of open-file / open-folder. */
export interface OpenExportResult {
  opened: boolean
  /** False when the exported file was deleted after the fact. */
  fileExists: boolean
  /** Owner-facing Spanish note when not opened. */
  message: string | null
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
  render: {
    /**
     * Start an export. The renderer sends ONLY ids — never paths, dimensions,
     * or composition data. Main reconstructs and validates the render request
     * from persisted project data and opens the native save dialog itself.
     */
    start(input: { projectId: string; presetId: ExportPresetId }): Promise<Result<RenderStartResult>>
    cancel(input: { jobId: string }): Promise<Result<boolean>>
    status(input: { projectId: string }): Promise<Result<RenderStatusResult>>
    listHistory(input: { projectId: string }): Promise<Result<ExportRecordWithFileState[]>>
    /** Re-run a past export with its preset, into its folder (numbered name). */
    retry(input: { exportId: string }): Promise<Result<RenderStartResult>>
    openFile(input: { exportId: string }): Promise<Result<OpenExportResult>>
    openFolder(input: { exportId: string }): Promise<Result<OpenExportResult>>
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
