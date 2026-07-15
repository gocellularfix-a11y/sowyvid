import type { Result } from '../result'

/**
 * The typed surface exposed to the renderer via the secure preload bridge
 * (`window.sowyvid`). This is the ONLY way the renderer talks to the main
 * process — there is no generic `ipcRenderer` access in the renderer.
 *
 * Namespaces grow per phase. Methods that are not yet implemented in the main
 * process return a Result with code 'UNSUPPORTED' rather than silently failing,
 * so the UI can mark a control as unavailable instead of dead.
 */

export interface AppInfo {
  name: 'SowyVid'
  version: string
  platform: NodeJS.Platform
  /** Where SowyVid stores user data (OS app-data dir). */
  userDataPath: string
  /** True when running against the dev mock AI provider. */
  mockAiActive: boolean
  /** Build/runtime mode. */
  mode: 'development' | 'production'
}

export interface SowyvidBridge {
  app: {
    info(): Promise<Result<AppInfo>>
    ping(message: string): Promise<Result<string>>
  }
  /**
   * Subscribe to a main-process event channel (e.g. render progress).
   * Returns an unsubscribe function.
   */
  on(channel: string, listener: (payload: unknown) => void): () => void
}

declare global {
  interface Window {
    /** Injected by the preload. Undefined only in plain-browser preview mode. */
    sowyvid?: SowyvidBridge
  }
}
