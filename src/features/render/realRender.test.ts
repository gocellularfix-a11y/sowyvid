import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, statSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import ffmpegPath from 'ffmpeg-static'
import ffprobeStatic from 'ffprobe-static'
import { runRenderJob, RenderCancelledError } from './renderJob.node'
import { currentBundleFingerprint } from './bundleCache.node'
import { fingerprintDirName, BUNDLE_STAMP_FILE } from './bundleFingerprint'
import {
  probeMedia,
  measureAudioLevels,
  isAudible,
  extractFrame,
  frameStats,
  isBlackFrame,
  isBlankFrame,
  frameDifference,
  SILENCE_THRESHOLD_DB,
} from './renderValidation.node'
import { visualPlanToCompositionProps } from '@render/remotionProps'
import { audioPlanToCompositionAudio } from '@render/remotionAudio'
import { buildAudioPlan } from '@features/audio'
import { buildVisualPlan } from '@features/visual'
import { developProjectConcepts, compileProjectConcept } from '@features/creative'
import { goCellularProject } from '@shared/fixtures/goCellular'
import { importMedia } from '@features/media/mediaImport.node'
import { analyzeMedia } from '@features/media/analysis.node'
import { resolveManagedMediaPath } from '@features/media/managedPath'
import type { ManagedMediaResolver } from './mediaServer.node'
import type { CommercialCompositionProps } from '@render/remotionProps'
import type { MediaAsset } from '@shared/domain/media'

/**
 * REAL production render — the whole point of this milestone.
 *
 * These tests render through `runRenderJob`, the exact function the app uses.
 * They do NOT bundle into a private fresh directory, because that is precisely
 * how a stale-cache bug survives a green test suite: the proof used a fresh
 * serve dir, production used the rotten cache, and the two never met.
 *
 * What is asserted:
 *   - audio is measured (RMS), not assumed from "ffprobe says AAC"
 *   - frames are sampled across the timeline and checked for real content
 *   - a deliberately STALE cache is planted, and the render must self-repair
 *
 * Slow by nature: it launches a headless browser and encodes video.
 */

const execFileAsync = promisify(execFile)
const FFMPEG = ffmpegPath as string
const FFPROBE = ffprobeStatic.path
const repoRoot = resolve(__dirname, '..', '..', '..')
const enabled = Boolean(FFMPEG && FFPROBE)

let workRoot: string
let cacheRoot: string
let tempRoot: string
let outDir: string
/** The project directory. Managed media lives in `<projectDir>/media`. */
let projectDir: string
let props: CommercialCompositionProps
let renderedFile: string
let projectMedia: MediaAsset[]

/**
 * The same ID-only, traversal-guarded resolution the Electron protocol uses —
 * the render server never takes a path from the composition.
 */
const resolveAsset: ManagedMediaResolver = (_projectId, mediaId, variant) => {
  const asset = projectMedia.find((m) => m.id === mediaId)
  if (!asset) return null
  return resolveManagedMediaPath(projectDir, asset, variant)
}

/** A real mp3 with an actual tone — the music the export must contain. */
async function makeMusicFile(dir: string): Promise<string> {
  const path = join(dir, 'music.mp3')
  await execFileAsync(
    FFMPEG,
    ['-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=10', '-c:a', 'libmp3lame', path],
    { timeout: 60_000 },
  )
  return path
}

/** A real photo with actual content (not a flat fill) — must be visible in frames. */
async function makePhotoFile(dir: string, name: string): Promise<string> {
  const path = join(dir, name)
  await execFileAsync(
    FFMPEG,
    ['-y', '-f', 'lavfi', '-i', 'testsrc=size=1080x1920:duration=1:rate=1', '-frames:v', '1', path],
    { timeout: 60_000 },
  )
  return path
}

beforeAll(async () => {
  if (!enabled) return
  workRoot = mkdtempSync(join(tmpdir(), 'sowyvid-realrender-'))
  cacheRoot = join(workRoot, 'render-cache')
  tempRoot = join(workRoot, 'temp')
  outDir = join(workRoot, 'out')
  projectDir = join(workRoot, 'project')
  // MediaVault's root is `<project>/media`; asset relPaths are relative to
  // `<project>`. Getting this wrong makes every asset resolve to a path that
  // does not exist — and the render silently produces a black, silent video.
  const vaultRoot = join(projectDir, 'media')
  for (const d of [cacheRoot, tempRoot, outDir, vaultRoot]) mkdirSync(d, { recursive: true })

  // Import REAL files through the REAL MediaVault path, so the render consumes
  // genuinely managed assets rather than hand-written fixtures.
  const srcDir = mkdtempSync(join(tmpdir(), 'sowyvid-realsrc-'))
  const music = await makeMusicFile(srcDir)
  const photo1 = await makePhotoFile(srcDir, 'tienda.png')

  const { media } = await importMedia(vaultRoot, [], [
    { kind: 'path', path: photo1 },
    { kind: 'path', path: music },
  ])
  const analyzed: MediaAsset[] = await analyzeMedia(vaultRoot, media)
  projectMedia = analyzed

  // Fail loudly here rather than rendering a black video: every managed asset
  // must actually resolve to a real file before we claim anything about output.
  for (const asset of analyzed) {
    const abs = resolveManagedMediaPath(projectDir, asset, 'original')
    expect(abs, `asset ${asset.id} must resolve`).toBeTruthy()
    expect(existsSync(abs!), `asset file must exist at ${abs}`).toBe(true)
  }
  const musicAsset = analyzed.find((m) => m.kind === 'audio')!
  const photoAssets = analyzed.filter((m) => m.kind === 'image')
  expect(musicAsset, 'music must import as audio').toBeTruthy()
  expect(photoAssets.length).toBeGreaterThan(0)

  const project = {
    ...goCellularProject,
    id: 'proj_realrender',
    media: analyzed,
    audio: { ...goCellularProject.audio, musicId: musicAsset.id },
  }

  const concept = developProjectConcepts(project, 1)[0]!
  const { renderPlan } = compileProjectConcept(project, concept.conceptId)
  const visualPlan = buildVisualPlan({
    renderPlan,
    brand: project.brand,
    media: project.media,
    industry: project.brief.category,
  })
  const audioPlan = buildAudioPlan({
    projectId: project.id,
    audio: project.audio,
    visualPlan,
    media: project.media,
  })
  expect(audioPlan.silent, 'the fixture must actually have audio to prove anything').toBe(false)
  expect(audioPlan.music).not.toBeNull()

  props = visualPlanToCompositionProps(visualPlan, project.id, project.media, {
    audio: audioPlanToCompositionAudio(audioPlan),
  })
}, 180_000)

afterAll(() => {
  // Keep the rendered artifact out of the repo; the temp dir is disposable.
})

describe.runIf(enabled)('production MP4 render', () => {
  it(
    'renders a real H.264 + AAC file through the production path, from a STALE cache',
    async () => {
      // --- plant the exact Colibri failure ---------------------------------
      // A bundle directory that already exists at the fingerprint the render is
      // about to want, but whose contents are from "before audio support" and
      // whose stamp does not match. "Directory exists -> reuse" would render the
      // old, audio-less composition and emit a phantom silent track.
      const fingerprint = await currentBundleFingerprint({ projectRoot: repoRoot, cacheRoot })
      const staleDir = join(cacheRoot, fingerprintDirName(fingerprint))
      mkdirSync(staleDir, { recursive: true })
      writeFileSync(join(staleDir, 'index.html'), '<html><body>STALE PRE-AUDIO BUNDLE</body></html>')
      writeFileSync(
        join(staleDir, BUNDLE_STAMP_FILE),
        JSON.stringify({ fingerprint: 'pre-audio-june-16', stampVersion: 1, builtAt: '2026-06-16T00:00:00.000Z' }),
      )
      expect(existsSync(join(staleDir, 'index.html'))).toBe(true)

      renderedFile = join(outDir, 'comercial.mp4')
      const progress: number[] = []

      const result = await runRenderJob(
        {
          projectId: 'proj_realrender',
          props,
          preset: { id: 'instagram-reel', resolution: 720 },
          outputPath: renderedFile,
          cache: { projectRoot: repoRoot, cacheRoot },
          tempRoot,
          resolveAsset,
        },
        { onProgress: (p) => progress.push(p.progress) },
      )

      // The stale bundle was detected and replaced, not reused.
      expect(result.bundleRebuilt).toBe(true)
      const stamp = JSON.parse(readFileSync(join(staleDir, BUNDLE_STAMP_FILE), 'utf8')) as {
        fingerprint: string
      }
      expect(stamp.fingerprint).toBe(fingerprint)
      expect(readFileSync(join(staleDir, 'index.html'), 'utf8')).not.toContain('STALE PRE-AUDIO')

      // Progress was reported and is monotonic, ending at 1.
      expect(progress.length).toBeGreaterThan(1)
      expect(progress.at(-1)).toBe(1)
      for (let i = 1; i < progress.length; i++) {
        expect(progress[i]!).toBeGreaterThanOrEqual(progress[i - 1]!)
      }

      // The file exists and is not a stub.
      expect(existsSync(renderedFile)).toBe(true)
      expect(statSync(renderedFile).size).toBeGreaterThan(10_000)

      // Scratch was cleaned up.
      expect(existsSync(join(tempRoot, `render-proj_realrender-${process.pid}`))).toBe(false)
    },
    600_000,
  )

  it('contains a real H.264 video and AAC audio stream at the requested size', async () => {
    const probe = await probeMedia(FFPROBE, renderedFile)
    expect(probe.video.present).toBe(true)
    expect(probe.video.codec).toBe('h264')
    expect(probe.audio.present).toBe(true)
    expect(probe.audio.codec).toBe('aac')

    // 9:16 at 720 long edge → 405x720 (even).
    expect(probe.video.width).toBe(406)
    expect(probe.video.height).toBe(720)
  }, 120_000)

  it('has audio that is ACTUALLY AUDIBLE, not a valid-but-silent track', async () => {
    // The whole lesson: a valid AAC stream can be digital silence, and every
    // format check passes while the commercial is mute. So measure the signal.
    const levels = await measureAudioLevels(FFMPEG, renderedFile)

    // Print the measured evidence, so the claim "it has audio" is backed by a
    // number anyone can read rather than a green check. `npm run verify:render`
    // exists to surface exactly this block.
    const probe = await probeMedia(FFPROBE, renderedFile)
    // eslint-disable-next-line no-console -- this IS the deliverable of verify:render
    console.info(
      '\n=== RENDER EVIDENCE ===\n' +
        JSON.stringify(
          {
            file: renderedFile,
            bytes: statSync(renderedFile).size,
            resolution: `${probe.video.width}x${probe.video.height}`,
            durationSec: probe.durationSec,
            videoCodec: probe.video.codec,
            audioCodec: probe.audio.codec,
            audioSampleRate: probe.audio.sampleRate,
            audioChannels: probe.audio.channels,
            meanVolumeDb: levels.meanVolumeDb,
            maxVolumeDb: levels.maxVolumeDb,
            silenceThresholdDb: SILENCE_THRESHOLD_DB,
            audible: isAudible(levels),
          },
          null,
          2,
        ) +
        '\n=======================\n',
    )

    expect(Number.isFinite(levels.meanVolumeDb), 'mean volume is -inf → digital silence').toBe(true)
    expect(levels.meanVolumeDb).toBeGreaterThan(SILENCE_THRESHOLD_DB)
    expect(isAudible(levels)).toBe(true)
    // Peak must be real too, and must not be clipping.
    expect(levels.maxVolumeDb).toBeGreaterThan(-30)
    expect(levels.maxVolumeDb).toBeLessThanOrEqual(0)
  }, 180_000)

  it('matches the planned duration', async () => {
    const probe = await probeMedia(FFPROBE, renderedFile)
    const expected = props.durationInFrames / props.fps
    expect(probe.durationSec).not.toBeNull()
    expect(probe.durationSec!).toBeGreaterThan(expected - 0.5)
    expect(probe.durationSec!).toBeLessThan(expected + 0.5)
  }, 120_000)

  it('shows real picture across the timeline — not black, not blank', async () => {
    const probe = await probeMedia(FFPROBE, renderedFile)
    const duration = probe.durationSec!
    // Sample several positions, not just the first frame.
    const positions = [0.1, 0.25, 0.5, 0.75, 0.9].map((p) => Number((duration * p).toFixed(2)))
    const frames = []
    for (const at of positions) frames.push(await extractFrame(FFMPEG, renderedFile, at))

    for (const frame of frames) {
      const stats = frameStats(frame)
      expect(isBlackFrame(stats), `frame at ${frame.atSec}s is black`).toBe(false)
      expect(isBlankFrame(stats), `frame at ${frame.atSec}s is a flat fill`).toBe(false)
    }

    // Scenes actually change: at least one sampled pair differs materially.
    const diffs: number[] = []
    for (let i = 1; i < frames.length; i++) diffs.push(frameDifference(frames[i - 1]!, frames[i]!))
    expect(Math.max(...diffs)).toBeGreaterThan(3)
  }, 300_000)

  it('ends on the CTA scene, as the plan requires', async () => {
    const probe = await probeMedia(FFPROBE, renderedFile)
    const last = await extractFrame(FFMPEG, renderedFile, probe.durationSec! - 0.3)
    const stats = frameStats(last)
    // The CTA is a designed frame with text — it must not be empty.
    expect(isBlackFrame(stats)).toBe(false)
    expect(isBlankFrame(stats)).toBe(false)
    expect(props.scenes.at(-1)?.role).toBe('cta')
  }, 180_000)

  it('reuses the bundle on a second render — and still produces audible audio', async () => {
    // Cheap when nothing changed...
    const second = join(outDir, 'comercial-2.mp4')
    const result = await runRenderJob({
      projectId: 'proj_realrender',
      props,
      preset: { id: 'instagram-reel', resolution: 720 },
      outputPath: second,
      cache: { projectRoot: repoRoot, cacheRoot },
      tempRoot,
      resolveAsset,
    })
    expect(result.bundleRebuilt).toBe(false)
    // ...but a reused bundle must never mean a silent export.
    const levels = await measureAudioLevels(FFMPEG, second)
    expect(isAudible(levels)).toBe(true)
  }, 600_000)

  it('cancels cleanly and leaves no output and no scratch behind', async () => {
    const controller = new AbortController()
    const out = join(outDir, 'cancelled.mp4')
    const promise = runRenderJob(
      {
        projectId: 'proj_cancel',
        props,
        preset: { id: 'instagram-reel', resolution: 720 },
        outputPath: out,
        cache: { projectRoot: repoRoot, cacheRoot },
        tempRoot,
        resolveAsset,
      },
      {
        signal: controller.signal,
        // Abort as soon as encoding actually starts, so this exercises real
        // mid-render cancellation rather than a pre-flight bail-out.
        onProgress: (p) => {
          if (p.phase === 'rendering') controller.abort()
        },
      },
    )

    await expect(promise).rejects.toThrow()
    // The project is safe after cancellation: no half-written file at the
    // owner's chosen path, no scratch left over.
    expect(existsSync(out)).toBe(false)
    expect(existsSync(join(tempRoot, `render-proj_cancel-${process.pid}`))).toBe(false)
  }, 600_000)

  it('rejects with RenderCancelledError so callers can tell cancel from failure', async () => {
    const controller = new AbortController()
    controller.abort() // already cancelled before it starts
    await expect(
      runRenderJob(
        {
          projectId: 'proj_cancel2',
          props,
          preset: { id: 'instagram-reel', resolution: 720 },
          outputPath: join(outDir, 'cancelled2.mp4'),
          cache: { projectRoot: repoRoot, cacheRoot },
          tempRoot,
          resolveAsset,
        },
        { signal: controller.signal },
      ),
    ).rejects.toBeInstanceOf(RenderCancelledError)
  }, 120_000)
})

describe.runIf(enabled)('silence detection actually works', () => {
  it('flags a genuinely silent track as inaudible', async () => {
    // Guards the guard: if this passed on silence, every audio assertion above
    // would be worthless.
    const dir = mkdtempSync(join(tmpdir(), 'sowyvid-silent-'))
    const silent = join(dir, 'silent.mp4')
    await execFileAsync(
      FFMPEG,
      [
        '-y',
        '-f', 'lavfi', '-i', 'testsrc=size=320x240:duration=2:rate=30',
        '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo',
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', silent,
      ],
      { timeout: 120_000 },
    )

    // ffprobe is perfectly happy — this is the trap.
    const probe = await probeMedia(FFPROBE, silent)
    expect(probe.audio.present).toBe(true)
    expect(probe.audio.codec).toBe('aac')

    // Measuring the content is what catches it.
    const levels = await measureAudioLevels(FFMPEG, silent)
    expect(isAudible(levels)).toBe(false)
  }, 180_000)

  it('flags an all-black video as black', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sowyvid-black-'))
    const black = join(dir, 'black.mp4')
    await execFileAsync(
      FFMPEG,
      ['-y', '-f', 'lavfi', '-i', 'color=c=black:size=320x240:duration=2:rate=30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', black],
      { timeout: 120_000 },
    )
    const frame = await extractFrame(FFMPEG, black, 1)
    expect(isBlackFrame(frameStats(frame))).toBe(true)
  }, 180_000)
})
