import { ipcMain } from 'electron'
import { z } from 'zod'
import { type Result, err } from '@shared/result'

/**
 * A tiny typed IPC registry. Every handler validates its input with a Zod
 * schema at the boundary and returns a Result — handlers never throw across the
 * bridge. Unexpected throws are caught and converted to an INTERNAL error so a
 * bug in one handler can never crash the main process or leak a stack trace to
 * the renderer.
 */
export function handle<I, O>(
  channel: string,
  schema: z.ZodType<I>,
  handler: (input: I) => Promise<Result<O>> | Result<O>,
): void {
  ipcMain.handle(channel, async (_event, raw: unknown): Promise<Result<O>> => {
    const parsed = schema.safeParse(raw)
    if (!parsed.success) {
      return err('VALIDATION', `Invalid payload for ${channel}`, {
        issues: parsed.error.issues,
      })
    }
    try {
      return await handler(parsed.data)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      // Structured server-side log; never returned verbatim to owners.
      console.error(`[ipc:${channel}]`, message)
      return err('INTERNAL', message)
    }
  })
}
