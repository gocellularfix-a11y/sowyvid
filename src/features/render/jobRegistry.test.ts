import { describe, it, expect, vi } from 'vitest'
import {
  RenderJobRegistry,
  RenderBusyError,
  isActiveState,
  type JobRunnerContext,
  type RenderJobResultSummary,
  type RenderJobSnapshot,
} from './jobRegistry'
import type { RenderProgress } from './renderJob.node'

/**
 * Registry semantics with an injected runner. The REAL render path is covered
 * by realRender.test.ts and the e2e suites; what lives here is the lifecycle
 * the owner depends on — one render per project, truthful terminal states,
 * cancellation, and history that records every attempt.
 */

const RESULT: RenderJobResultSummary = {
  outputPath: 'C:\\out\\video.mp4',
  width: 1080,
  height: 1920,
  fps: 30,
  durationInFrames: 600,
  hasAudio: true,
  fingerprint: 'fp',
  bytes: 1000,
}

/** A controllable runner: resolves/rejects when the test says so. */
function makeRunner() {
  let resolve!: (r: RenderJobResultSummary) => void
  let reject!: (e: unknown) => void
  let report!: (p: RenderProgress) => void
  let signal!: AbortSignal
  const run: JobRunnerContext['run'] = ({ signal: s, onProgress }) => {
    signal = s
    report = onProgress
    return new Promise((res, rej) => {
      resolve = res
      reject = rej
      s.addEventListener('abort', () => {
        const e = new Error('Render cancelled')
        e.name = 'RenderCancelledError'
        rej(e)
      })
    })
  }
  return {
    run,
    finish: () => resolve(RESULT),
    fail: (e: unknown) => reject(e),
    progress: (p: RenderProgress) => report(p),
    getSignal: () => signal,
  }
}

function makeCtx(runner: ReturnType<typeof makeRunner>) {
  let nextExport = 0
  const begun: string[] = []
  const completed: Array<{ id: string; result: RenderJobResultSummary }> = []
  const failed: Array<{ id: string; code: string }> = []
  const ctx: JobRunnerContext = {
    run: runner.run,
    beginHistory: () => {
      const id = `exp_${++nextExport}`
      begun.push(id)
      return id
    },
    completeHistory: (id, result) => {
      completed.push({ id, result })
    },
    failHistory: (id, code) => {
      failed.push({ id, code })
    },
  }
  return { ctx, begun, completed, failed }
}

const tick = () => new Promise((r) => setTimeout(r, 0))

describe('one active render per project', () => {
  it('rejects a second start synchronously — a double click cannot race', () => {
    const registry = new RenderJobRegistry()
    const runner = makeRunner()
    const { ctx } = makeCtx(runner)
    registry.start('proj_a', ctx)
    // No await between the two clicks: the guard must be synchronous.
    expect(() => registry.start('proj_a', ctx)).toThrow(RenderBusyError)
  })

  it('allows different projects to render concurrently', () => {
    const registry = new RenderJobRegistry()
    const a = registry.start('proj_a', makeCtx(makeRunner()).ctx)
    const b = registry.start('proj_b', makeCtx(makeRunner()).ctx)
    expect(a.jobId).not.toBe(b.jobId)
    expect(registry.activeForProject('proj_a')).not.toBeNull()
    expect(registry.activeForProject('proj_b')).not.toBeNull()
  })

  it('allows a new render after the previous one completes', async () => {
    const registry = new RenderJobRegistry()
    const runner = makeRunner()
    const { ctx } = makeCtx(runner)
    registry.start('proj_a', ctx)
    runner.finish()
    await tick()
    expect(registry.activeForProject('proj_a')).toBeNull()
    expect(() => registry.start('proj_a', makeCtx(makeRunner()).ctx)).not.toThrow()
  })
})

describe('lifecycle states', () => {
  it('walks queued → bundling → rendering → publishing → completed', async () => {
    const registry = new RenderJobRegistry()
    const runner = makeRunner()
    const { ctx, completed } = makeCtx(runner)
    const seen: string[] = []
    registry.onUpdate((s) => seen.push(s.state))

    const job = registry.start('proj_a', ctx)
    expect(job.state).toBe('queued')
    await tick()
    runner.progress({ phase: 'bundling', progress: 0.1 })
    runner.progress({ phase: 'preparing', progress: 0.18 })
    runner.progress({ phase: 'rendering', progress: 0.5 })
    runner.progress({ phase: 'finalizing', progress: 0.97 })
    runner.finish()
    await tick()

    expect(seen).toEqual(['queued', 'bundling', 'preparing', 'rendering', 'publishing', 'completed'])
    const final = registry.get(job.jobId)!
    expect(final.state).toBe('completed')
    expect(final.progress).toBe(1)
    expect(final.result).toEqual(RESULT)
    expect(completed).toEqual([{ id: 'exp_1', result: RESULT }])
  })

  it('reports monotone owner-facing progress and Spanish stages', async () => {
    const registry = new RenderJobRegistry()
    const runner = makeRunner()
    const { ctx } = makeCtx(runner)
    const stages: string[] = []
    registry.onUpdate((s) => stages.push(s.stage))
    registry.start('proj_a', ctx)
    await tick()
    runner.progress({ phase: 'rendering', progress: 0.4 })
    runner.finish()
    await tick()
    for (const stage of stages) {
      // Owner-facing text only — never internals.
      expect(stage).not.toMatch(/ffmpeg|remotion|stack|error:/i)
    }
    expect(stages.at(-1)).toBe('Tu comercial está listo.')
  })
})

describe('cancellation', () => {
  it('cancels an active job: signal aborted, state canceled, history told', async () => {
    const registry = new RenderJobRegistry()
    const runner = makeRunner()
    const { ctx, failed } = makeCtx(runner)
    const job = registry.start('proj_a', ctx)
    await tick()

    expect(registry.cancel(job.jobId)).toBe(true)
    expect(runner.getSignal().aborted).toBe(true)
    await tick()

    const final = registry.get(job.jobId)!
    expect(final.state).toBe('canceled')
    expect(final.failureCode).toBe('canceled')
    expect(failed).toEqual([{ id: 'exp_1', code: 'canceled' }])
    // The project is free again.
    expect(registry.activeForProject('proj_a')).toBeNull()
  })

  it('returns false for an unknown job instead of throwing', () => {
    const registry = new RenderJobRegistry()
    expect(registry.cancel('job_nope')).toBe(false)
  })

  it('returns false when canceling an already-finished job', async () => {
    const registry = new RenderJobRegistry()
    const runner = makeRunner()
    const { ctx } = makeCtx(runner)
    const job = registry.start('proj_a', ctx)
    runner.finish()
    await tick()
    expect(registry.cancel(job.jobId)).toBe(false)
    expect(registry.get(job.jobId)!.state).toBe('completed')
  })

  it('a late progress tick can never resurrect a canceled job', async () => {
    const registry = new RenderJobRegistry()
    const runner = makeRunner()
    const { ctx } = makeCtx(runner)
    const job = registry.start('proj_a', ctx)
    await tick()
    registry.cancel(job.jobId)
    await tick()
    // The renderer might still emit one tick before it notices the abort.
    runner.progress({ phase: 'rendering', progress: 0.6 })
    expect(registry.get(job.jobId)!.state).toBe('canceled')
  })
})

describe('failure', () => {
  it('records a stable diagnostic code, never the raw error', async () => {
    const registry = new RenderJobRegistry()
    const runner = makeRunner()
    const { ctx, failed } = makeCtx(runner)
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const job = registry.start('proj_a', ctx)
    await tick()
    runner.fail(new Error('ENOSPC: disk full at C:\\secret\\path'))
    await tick()
    spy.mockRestore()

    const final = registry.get(job.jobId)!
    expect(final.state).toBe('failed')
    expect(final.failureCode).toBe('render-failed')
    // Nothing owner-visible carries the raw message or a path.
    expect(JSON.stringify(final)).not.toContain('ENOSPC')
    expect(JSON.stringify(final)).not.toContain('secret')
    expect(failed).toEqual([{ id: 'exp_1', code: 'render-failed' }])
  })

  it('uses the injected classifier for known failure kinds', async () => {
    const registry = new RenderJobRegistry()
    const runner = makeRunner()
    const base = makeCtx(runner)
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const job = registry.start('proj_a', {
      ...base.ctx,
      classifyError: () => 'output-unavailable',
    })
    await tick()
    runner.fail(new Error('EPERM'))
    await tick()
    spy.mockRestore()
    expect(registry.get(job.jobId)!.failureCode).toBe('output-unavailable')
  })

  it('frees the project after a failure', async () => {
    const registry = new RenderJobRegistry()
    const runner = makeRunner()
    const { ctx } = makeCtx(runner)
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    registry.start('proj_a', ctx)
    await tick()
    runner.fail(new Error('boom'))
    await tick()
    spy.mockRestore()
    expect(registry.activeForProject('proj_a')).toBeNull()
  })
})

describe('history is told about every attempt', () => {
  it('begins exactly one history record per job, before rendering starts', async () => {
    const registry = new RenderJobRegistry()
    const runner = makeRunner()
    const { ctx, begun } = makeCtx(runner)
    registry.start('proj_a', ctx)
    expect(begun).toEqual(['exp_1'])
    runner.finish()
    await tick()
    expect(begun).toEqual(['exp_1'])
  })
})

describe('state helpers', () => {
  it('classifies active vs terminal states', () => {
    for (const s of ['queued', 'preparing', 'bundling', 'rendering', 'publishing'] as const) {
      expect(isActiveState(s)).toBe(true)
    }
    for (const s of ['completed', 'failed', 'canceled'] as const) {
      expect(isActiveState(s)).toBe(false)
    }
  })

  it('snapshots are copies — callers cannot mutate registry state', () => {
    const registry = new RenderJobRegistry()
    const runner = makeRunner()
    const { ctx } = makeCtx(runner)
    const job = registry.start('proj_a', ctx)
    const snapshot = registry.get(job.jobId)!
    ;(snapshot as RenderJobSnapshot).state = 'completed'
    expect(registry.get(job.jobId)!.state).toBe('queued')
  })
})
