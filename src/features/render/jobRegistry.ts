import { nanoid } from 'nanoid'
import type { ExportFailureCode } from '@shared/domain/exportRecord'
import type { RenderProgress } from './renderProgress'

/**
 * Main-process render job registry.
 *
 * Owns the lifecycle of every render: one active render per project, unique job
 * ids, progress fan-out, cooperative cancellation, and a truthful terminal
 * state for every attempt. The registry does NOT render — the actual runner is
 * injected, so these semantics are unit-testable without encoding a video, and
 * production injects the real `runRenderJob`.
 *
 * State machine (§4):
 *
 *   queued → preparing → bundling → rendering → publishing → completed
 *                                          ↘ failed / canceled
 *
 * `queued` exists only momentarily (jobs start immediately), but it is a real
 * state: a job is visible from the instant it is accepted, so a second click
 * during startup races cannot slip past the one-per-project rule.
 */

export type RenderJobState =
  | 'queued'
  | 'preparing'
  | 'bundling'
  | 'rendering'
  | 'publishing'
  | 'completed'
  | 'failed'
  | 'canceled'

/** runRenderJob phases → owner-visible states. */
const STATE_BY_PHASE: Record<RenderProgress['phase'], RenderJobState> = {
  bundling: 'bundling',
  preparing: 'preparing',
  rendering: 'rendering',
  finalizing: 'publishing',
}

/** Owner-facing Spanish stage line per state (§7). */
export const STAGE_TEXT: Record<RenderJobState, string> = {
  queued: 'Preparando tu comercial…',
  preparing: 'Preparando tu comercial…',
  bundling: 'Preparando tu comercial…',
  rendering: 'Creando el video y el audio…',
  publishing: 'Guardando el archivo…',
  completed: 'Tu comercial está listo.',
  failed: 'No se pudo crear el video.',
  canceled: 'Exportación cancelada.',
}

export interface RenderJobResultSummary {
  outputPath: string
  width: number
  height: number
  fps: number
  durationInFrames: number
  hasAudio: boolean
  fingerprint: string
  bytes: number
}

export interface RenderJobSnapshot {
  jobId: string
  projectId: string
  exportId: string
  state: RenderJobState
  /** 0..1 overall. */
  progress: number
  /** Owner-facing Spanish stage line. */
  stage: string
  /** Stable diagnostic code — never a raw error message. */
  failureCode: ExportFailureCode | null
  result: RenderJobResultSummary | null
}

const ACTIVE_STATES: ReadonlySet<RenderJobState> = new Set([
  'queued',
  'preparing',
  'bundling',
  'rendering',
  'publishing',
])

export function isActiveState(state: RenderJobState): boolean {
  return ACTIVE_STATES.has(state)
}

interface JobEntry {
  snapshot: RenderJobSnapshot
  controller: AbortController
}

/** What the registry needs from the caller to actually render and persist. */
export interface JobRunnerContext {
  /** The injected renderer (production: a wrapper around runRenderJob). */
  run: (args: {
    signal: AbortSignal
    onProgress: (p: RenderProgress) => void
  }) => Promise<RenderJobResultSummary>
  /** Persist "a render started" and return the history record id. */
  beginHistory: () => string
  /**
   * Persist success facts. AWAITED before the job reports `completed`, so a
   * "completed" state always means the history row is already durable — an app
   * closed right after seeing "listo" still shows the export after restart.
   */
  completeHistory: (exportId: string, result: RenderJobResultSummary) => void | Promise<void>
  /** Persist a terminal failure/cancel. Awaited for the same reason. */
  failHistory: (exportId: string, code: ExportFailureCode) => void | Promise<void>
  /** Classify an unexpected runner error into a stable diagnostic code. */
  classifyError?: (error: unknown) => ExportFailureCode
}

export class RenderBusyError extends Error {
  constructor(projectId: string) {
    super(`A render is already active for ${projectId}`)
    this.name = 'RenderBusyError'
  }
}

export class RenderJobRegistry {
  private readonly jobs = new Map<string, JobEntry>()
  private readonly listeners = new Set<(snapshot: RenderJobSnapshot) => void>()

  /** Subscribe to every job update (IPC broadcast hangs off this). */
  onUpdate(listener: (snapshot: RenderJobSnapshot) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(snapshot: RenderJobSnapshot): void {
    for (const listener of this.listeners) listener({ ...snapshot })
  }

  private update(jobId: string, patch: Partial<RenderJobSnapshot>): void {
    const entry = this.jobs.get(jobId)
    if (!entry) return
    entry.snapshot = { ...entry.snapshot, ...patch, stage: STAGE_TEXT[patch.state ?? entry.snapshot.state] }
    this.emit(entry.snapshot)
  }

  /** The active job for a project, if any. */
  activeForProject(projectId: string): RenderJobSnapshot | null {
    for (const { snapshot } of this.jobs.values()) {
      if (snapshot.projectId === projectId && isActiveState(snapshot.state)) {
        return { ...snapshot }
      }
    }
    return null
  }

  get(jobId: string): RenderJobSnapshot | null {
    const entry = this.jobs.get(jobId)
    return entry ? { ...entry.snapshot } : null
  }

  /**
   * Accept and immediately start a render. Rejects a second render for the same
   * project SYNCHRONOUSLY — the job is registered before any awaiting happens,
   * so a double click cannot race two jobs into existence.
   */
  start(projectId: string, ctx: JobRunnerContext): RenderJobSnapshot {
    if (this.activeForProject(projectId)) throw new RenderBusyError(projectId)

    const exportId = ctx.beginHistory()
    const controller = new AbortController()
    const snapshot: RenderJobSnapshot = {
      jobId: `job_${nanoid(10)}`,
      projectId,
      exportId,
      state: 'queued',
      progress: 0,
      stage: STAGE_TEXT.queued,
      failureCode: null,
      result: null,
    }
    this.jobs.set(snapshot.jobId, { snapshot, controller })
    this.emit(snapshot)

    void this.execute(snapshot.jobId, controller, ctx)
    return { ...snapshot }
  }

  private async execute(jobId: string, controller: AbortController, ctx: JobRunnerContext): Promise<void> {
    const entry = this.jobs.get(jobId)
    if (!entry) return
    const { exportId } = entry.snapshot

    try {
      const result = await ctx.run({
        signal: controller.signal,
        onProgress: (p) => {
          // A cancel may land between progress ticks; never resurrect a
          // terminal state with a late progress event.
          const current = this.jobs.get(jobId)
          if (!current || !isActiveState(current.snapshot.state)) return
          this.update(jobId, { state: STATE_BY_PHASE[p.phase], progress: p.progress })
        },
      })

      await ctx.completeHistory(exportId, result)
      this.update(jobId, { state: 'completed', progress: 1, result })
    } catch (error) {
      const wasCancel =
        controller.signal.aborted ||
        (error instanceof Error && error.name === 'RenderCancelledError')
      const code: ExportFailureCode = wasCancel
        ? 'canceled'
        : (ctx.classifyError?.(error) ?? 'render-failed')

      try {
        await ctx.failHistory(exportId, code)
      } catch {
        // A history-write failure must not mask the render outcome itself.
      }
      this.update(jobId, {
        state: wasCancel ? 'canceled' : 'failed',
        failureCode: code,
      })
      if (!wasCancel) {
        // Structured server-side log; the owner sees only the stable code.
        console.error(`[render:${jobId}]`, error instanceof Error ? error.message : String(error))
      }
    }
  }

  /** Cancel a job. Unknown or already-terminal jobs return false, calmly. */
  cancel(jobId: string): boolean {
    const entry = this.jobs.get(jobId)
    if (!entry || !isActiveState(entry.snapshot.state)) return false
    entry.controller.abort()
    return true
  }
}
