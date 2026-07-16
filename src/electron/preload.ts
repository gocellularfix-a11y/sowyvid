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
  },
  media: {
    import: (input) => ipcRenderer.invoke(IPC.MediaImport, input),
    remove: (input) => ipcRenderer.invoke(IPC.MediaRemove, input),
  },
  engine: {
    families: () => ipcRenderer.invoke(IPC.EngineFamilies),
    developConcepts: (input) => ipcRenderer.invoke(IPC.EngineDevelopConcepts, input),
    compile: (input) => ipcRenderer.invoke(IPC.EngineCompile, input),
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
