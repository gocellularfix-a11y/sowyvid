import type { SowyvidBridge, AppInfo } from '@shared/ipc/api'
import { ok, type Result } from '@shared/result'

/**
 * Resolves the Electron bridge. In plain-browser preview mode (Playwright smoke
 * test, `npm run dev:renderer-only`) `window.sowyvid` is absent, so we return a
 * clearly-marked mock that lets the UI shell render and be tested without the
 * main process. The mock NEVER pretends to be real production behavior.
 */
const BROWSER_PREVIEW =
  typeof window !== 'undefined' && !window.sowyvid

const mockBridge: SowyvidBridge = {
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
  on: () => () => undefined,
}

export function getBridge(): SowyvidBridge {
  if (typeof window !== 'undefined' && window.sowyvid) return window.sowyvid
  return mockBridge
}

/** True when running in a plain browser without the Electron main process. */
export const isBrowserPreview = BROWSER_PREVIEW
