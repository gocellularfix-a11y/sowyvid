import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@shared/ipc/channels'
import type { SowyvidBridge } from '@shared/ipc/api'

/**
 * The secure preload bridge. Runs with sandbox + context isolation, so the
 * renderer receives ONLY the explicitly whitelisted, typed methods below —
 * never `ipcRenderer`, `require`, or Node globals.
 */
const bridge: SowyvidBridge = {
  app: {
    info: () => ipcRenderer.invoke(IPC.AppInfo),
    ping: (message) => ipcRenderer.invoke(IPC.Ping, message),
  },
  projects: {
    list: () => ipcRenderer.invoke(IPC.ProjectList),
    create: (input) => ipcRenderer.invoke(IPC.ProjectCreate, input),
    get: (id) => ipcRenderer.invoke(IPC.ProjectGet, id),
    save: (project) => ipcRenderer.invoke(IPC.ProjectUpdate, project),
    delete: (id) => ipcRenderer.invoke(IPC.ProjectDelete, id),
    duplicate: (input) => ipcRenderer.invoke(IPC.ProjectDuplicate, input),
    deleteCommercial: (input) => ipcRenderer.invoke(IPC.ProjectDeleteCommercial, input),
  },
  media: {
    import: (input) => ipcRenderer.invoke(IPC.MediaImport, input),
    remove: (input) => ipcRenderer.invoke(IPC.MediaRemove, input),
    replace: (input) => ipcRenderer.invoke(IPC.MediaReplace, input),
    removeReferenced: (input) => ipcRenderer.invoke(IPC.MediaRemoveReferenced, input),
  },
  engine: {
    families: () => ipcRenderer.invoke(IPC.EngineFamilies),
    developConcepts: (input) => ipcRenderer.invoke(IPC.EngineDevelopConcepts, input),
    compile: (input) => ipcRenderer.invoke(IPC.EngineCompile, input),
  },
  music: {
    list: () => ipcRenderer.invoke(IPC.MusicList),
    get: (input) => ipcRenderer.invoke(IPC.MusicGet, input),
    import: (input) => ipcRenderer.invoke(IPC.MusicImport, input ?? {}),
    updateMeta: (input) => ipcRenderer.invoke(IPC.MusicUpdateMeta, input),
    select: (input) => ipcRenderer.invoke(IPC.MusicSelect, input),
    delete: (input) => ipcRenderer.invoke(IPC.MusicDelete, input),
    removeFromAll: (input) => ipcRenderer.invoke(IPC.MusicRemoveFromAll, input),
    replaceEverywhere: (input) => ipcRenderer.invoke(IPC.MusicReplaceEverywhere, input),
    reveal: (input) => ipcRenderer.invoke(IPC.MusicReveal, input),
    brief: (input) => ipcRenderer.invoke(IPC.MusicBrief, input),
    openSuno: () => ipcRenderer.invoke(IPC.MusicOpenSuno),
    importSuno: (input) => ipcRenderer.invoke(IPC.MusicImportSuno, input),
  },
  render: {
    start: (input) => ipcRenderer.invoke(IPC.RenderStart, input),
    cancel: (input) => ipcRenderer.invoke(IPC.RenderCancel, input),
    status: (input) => ipcRenderer.invoke(IPC.RenderStatus, input),
    listHistory: (input) => ipcRenderer.invoke(IPC.RenderListHistory, input),
    listHistoryAll: () => ipcRenderer.invoke(IPC.RenderListHistoryAll),
    retry: (input) => ipcRenderer.invoke(IPC.RenderRetry, input),
    openFile: (input) => ipcRenderer.invoke(IPC.RenderOpenFile, input),
    openFolder: (input) => ipcRenderer.invoke(IPC.RenderOpenFolder, input),
  },
  on: (channel, listener) => {
    const allowed = new Set<string>([IPC.RenderProgress, IPC.PhoneSessionStatus])
    if (!allowed.has(channel)) {
      return () => undefined
    }
    const wrapped = (_event: unknown, payload: unknown) => listener(payload)
    ipcRenderer.on(channel, wrapped)
    return () => ipcRenderer.removeListener(channel, wrapped)
  },
}

contextBridge.exposeInMainWorld('sowyvid', bridge)
