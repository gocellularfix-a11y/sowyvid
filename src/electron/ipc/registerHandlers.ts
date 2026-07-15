import { app } from 'electron'
import { z } from 'zod'
import { IPC } from '@shared/ipc/channels'
import { type AppInfo } from '@shared/ipc/api'
import { ok, type Result } from '@shared/result'
import { getAppPaths } from '../paths'
import { handle } from './registry'

/**
 * Registers all IPC handlers available in the current phase. Handlers for
 * not-yet-implemented domains are intentionally absent; the renderer treats a
 * missing channel as "unavailable" and marks the control accordingly rather
 * than presenting a dead button as finished.
 */
export function registerHandlers(): void {
  handle(IPC.AppInfo, z.undefined().or(z.null()).or(z.void()), (): Result<AppInfo> => {
    return ok({
      name: 'SowyVid',
      version: app.getVersion(),
      platform: process.platform,
      userDataPath: getAppPaths().userData,
      // Real AI provider wiring lands in Phase 11; the dev build uses a mock.
      mockAiActive: true,
      mode: app.isPackaged ? 'production' : 'development',
    })
  })

  handle(IPC.Ping, z.string(), (message): Result<string> => {
    return ok(`pong: ${message}`)
  })
}
