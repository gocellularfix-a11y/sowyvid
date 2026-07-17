import { renderMedia, selectComposition } from '@remotion/renderer'
import { mkdir, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { COMMERCIAL_COMPOSITION_ID } from '@render/compositionId'
import type { CommercialCompositionProps } from '@render/remotionProps'
import { ensureRenderBundle, type BundleCacheOptions } from './bundleCache.node'
import { resolutionFor, type RenderPreset } from './presets'
import {
  startRenderMediaServer,
  rewriteManagedUrls,
  type ManagedMediaResolver,
} from './mediaServer.node'

/**
 * Production MP4 rendering: Northstar plan + FrameLogic VisualPlan + SoundWeave
 * AudioPlan + MediaVault assets → H.264 video with AAC audio.
 *
 * Runs in the MAIN process (never the React renderer thread), and Remotion
 * spawns its own headless browser, so encoding never blocks the UI.
 */

export type { RenderPhase, RenderProgress } from './renderProgress'
import type { RenderPhase, RenderProgress } from './renderProgress'

export interface RenderJobInput {
  projectId: string
  props: CommercialCompositionProps
  preset: RenderPreset
  /** Final destination chosen by the owner. */
  outputPath: string
  cache: BundleCacheOptions
  /** Scratch directory; cleaned up on success, failure and cancel. */
  tempRoot: string
  /**
   * Headless browser path for Remotion. Null → Remotion's own resolution
   * (development). Packaged apps must pass the shipped browser — there is no
   * node_modules/.remotion to download into.
   */
  browserExecutable?: string | null
  /** Compositor binaries dir. Null → Remotion's own resolution (development). */
  binariesDirectory?: string | null
  /**
   * Resolves managed asset IDs to absolute paths for the render-only loopback
   * server. Required because the render's headless Chrome cannot use the
   * Electron `sowyvid-media://` scheme — see mediaServer.node.ts.
   */
  resolveAsset: ManagedMediaResolver
}

export interface RenderJobResult {
  outputPath: string
  width: number
  height: number
  fps: number
  durationInFrames: number
  /** True when the composition actually had an audible track. */
  hasAudio: boolean
  fingerprint: string
  bundleRebuilt: boolean
}

export class RenderCancelledError extends Error {
  constructor() {
    super('Render cancelled')
    this.name = 'RenderCancelledError'
  }
}

/** Progress weighting, so the owner sees one honest bar rather than three resets. */
const PHASE_WEIGHT: Record<RenderPhase, [number, number]> = {
  bundling: [0, 0.15],
  preparing: [0.15, 0.2],
  rendering: [0.2, 0.95],
  finalizing: [0.95, 1],
}

function scaled(phase: RenderPhase, within: number): number {
  const [from, to] = PHASE_WEIGHT[phase]
  return from + (to - from) * Math.min(1, Math.max(0, within))
}

/**
 * Render one commercial. Cancellation is cooperative and checked at every phase
 * boundary as well as inside Remotion (via its own cancel signal).
 */
export async function runRenderJob(
  input: RenderJobInput,
  hooks: {
    onProgress?: (p: RenderProgress) => void
    signal?: AbortSignal
  } = {},
): Promise<RenderJobResult> {
  const { signal } = hooks
  const report = (phase: RenderPhase, within: number): void =>
    hooks.onProgress?.({ phase, progress: scaled(phase, within) })

  const throwIfCancelled = (): void => {
    if (signal?.aborted) throw new RenderCancelledError()
  }

  // Scratch lives OUTSIDE project media, and is removed in `finally` on every
  // exit path — success, failure, or cancel.
  const tempDir = join(input.tempRoot, `render-${input.projectId}-${process.pid}`)
  let mediaServer: { baseUrl: string; close: () => Promise<void> } | null = null

  try {
    throwIfCancelled()

    // --- 1. a bundle that provably matches the running code ---
    report('bundling', 0)
    const { serveUrl, fingerprint, built } = await ensureRenderBundle(input.cache, {
      onProgress: (p) => report('bundling', p / 100),
    })
    report('bundling', 1)
    throwIfCancelled()

    await mkdir(tempDir, { recursive: true })

    // --- 2. resolve the composition, honoring the plan's own metadata ---
    report('preparing', 0)
    const scale = resolutionFor(input.preset, input.props.width, input.props.height)

    // Managed media must be reachable by the render's headless Chrome, which has
    // no `sowyvid-media://` scheme. Serve it over a token-guarded loopback
    // server addressed by the SAME stable ids, and rewrite the props to match —
    // no filesystem path ever enters the composition.
    mediaServer = await startRenderMediaServer(input.resolveAsset)
    const props: CommercialCompositionProps = rewriteManagedUrls(
      { ...input.props, ...scale },
      mediaServer.baseUrl,
    )

    const composition = await selectComposition({
      serveUrl,
      id: COMMERCIAL_COMPOSITION_ID,
      inputProps: props,
      browserExecutable: input.browserExecutable ?? null,
      binariesDirectory: input.binariesDirectory ?? null,
    })
    report('preparing', 1)
    throwIfCancelled()

    // --- 3. render to a temp file, then move into place ---
    const staging = join(tempDir, 'out.mp4')
    const hasAudio = Boolean(props.audio && !props.audio.silent)

    await renderMedia({
      composition,
      serveUrl,
      codec: 'h264',
      audioCodec: 'aac',
      browserExecutable: input.browserExecutable ?? null,
      binariesDirectory: input.binariesDirectory ?? null,
      // Never let Remotion invent a silent track: when the plan has no audio we
      // say so explicitly, so a silent export is a recorded decision rather than
      // an accident that looks identical to a broken one.
      muted: !hasAudio,
      enforceAudioTrack: hasAudio,
      outputLocation: staging,
      inputProps: props,
      onProgress: ({ progress }) => report('rendering', progress),
      cancelSignal: signal
        ? (cancel) => {
            if (signal.aborted) cancel()
            else signal.addEventListener('abort', () => cancel(), { once: true })
          }
        : undefined,
    })
    throwIfCancelled()

    // --- 4. publish atomically: a half-written MP4 must never appear at the
    // owner's chosen path, so the file only lands once it is complete ---
    report('finalizing', 0)
    await mkdir(join(input.outputPath, '..'), { recursive: true }).catch(() => undefined)
    await rename(staging, input.outputPath).catch(async (e: NodeJS.ErrnoException) => {
      // Cross-device (temp on another volume) → copy+unlink instead.
      if (e.code !== 'EXDEV') throw e
      const { copyFile, unlink } = await import('node:fs/promises')
      await copyFile(staging, input.outputPath)
      await unlink(staging)
    })
    report('finalizing', 1)

    return {
      outputPath: input.outputPath,
      width: composition.width,
      height: composition.height,
      fps: composition.fps,
      durationInFrames: composition.durationInFrames,
      hasAudio,
      fingerprint,
      bundleRebuilt: built,
    }
  } finally {
    // The media server must not outlive its render on ANY exit path.
    await mediaServer?.close().catch(() => undefined)
    // The project must be safe after failure or cancellation: scratch never
    // survives, and the destination is only ever touched by the atomic move.
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined)
  }
}
