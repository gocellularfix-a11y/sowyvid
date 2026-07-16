/**
 * Canonical IPC channel names shared between the Electron main process and the
 * renderer. Renderer code never hardcodes channel strings — it goes through the
 * typed bridge in the preload, which references these constants.
 *
 * Naming convention: `<domain>:<action>`.
 */
export const IPC = {
  // System / diagnostics
  AppInfo: 'app:info',
  Ping: 'app:ping',

  // Projects (Phase 4)
  ProjectList: 'project:list',
  ProjectCreate: 'project:create',
  ProjectGet: 'project:get',
  ProjectUpdate: 'project:update',
  ProjectDelete: 'project:delete',
  ProjectListVersions: 'project:listVersions',
  ProjectRestoreVersion: 'project:restoreVersion',

  // Creative engine (deterministic-creative-engine v2)
  EngineFamilies: 'engine:families',
  EngineDevelopConcepts: 'engine:developConcepts',
  EngineCompile: 'engine:compile',

  // Media (Phase 6)
  MediaImport: 'media:import',
  MediaList: 'media:list',
  MediaRemove: 'media:remove',

  // Rendering (owner MP4 export)
  RenderStart: 'render:start',
  RenderCancel: 'render:cancel',
  RenderStatus: 'render:status',
  RenderListHistory: 'render:listHistory',
  RenderRetry: 'render:retry',
  RenderOpenFile: 'render:openFile',
  RenderOpenFolder: 'render:openFolder',
  RenderProgress: 'render:progress', // main -> renderer event

  // Phone import (Phase 10)
  PhoneSessionStart: 'phone:sessionStart',
  PhoneSessionStop: 'phone:sessionStop',
  PhoneSessionStatus: 'phone:sessionStatus',

  // AI gateway (Phase 11)
  AiRequest: 'ai:request',
  AiUsage: 'ai:usage',
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]
