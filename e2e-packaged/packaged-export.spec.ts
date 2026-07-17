import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, statSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ffmpegPath from 'ffmpeg-static'
import ffprobeStatic from 'ffprobe-static'

/**
 * Packaged-Windows validation (§10–§17): the complete owner workflow inside the
 * REAL packaged .exe, using the real packaged resources — the shipped render
 * bundle, the shipped browser, the shipped compositor. Nothing here launches
 * Electron from node_modules, and nothing substitutes `verify:render` for
 * packaged evidence.
 *
 * The validation TOOLS (ffprobe/ffmpeg used to measure the output) come from
 * the repo's node_modules — they inspect the file the packaged app produced;
 * they play no part in producing it.
 *
 * A stale render cache is PLANTED in the fresh user-data directory before the
 * render, so this also proves the packaged app self-repairs the exact failure
 * documented in docs/RENDER-BUNDLE-CACHE.md.
 */

const execFileAsync = promisify(execFile)
const repoRoot = resolve(fileURLToPath(import.meta.url), '..', '..')
const packagedExe = join(repoRoot, 'release', 'win-unpacked', 'SowyVid.exe')
const FFMPEG = ffmpegPath as string
const FFPROBE = ffprobeStatic.path

/** Same silence threshold as the existing render verification. */
const SILENCE_THRESHOLD_DB = -50

async function launchPackaged(userDataDir: string, exportDir: string): Promise<ElectronApplication> {
  return electron.launch({
    executablePath: packagedExe,
    args: [],
    env: {
      ...process.env,
      SOWYVID_E2E_USER_DATA: userDataDir,
      SOWYVID_E2E_EXPORT_DIR: exportDir,
      SOWYVID_E2E_SUPPRESS_OPEN: '1',
    },
  })
}

async function makeSources(): Promise<{ photo: string; clip: string; music: string }> {
  const dir = mkdtempSync(join(tmpdir(), 'sowyvid-pkgsrc-'))
  const photo = join(dir, 'tienda.png')
  const clip = join(dir, 'mostrador.mp4')
  const music = join(dir, 'fondo.mp3')
  await execFileAsync(
    FFMPEG,
    ['-y', '-f', 'lavfi', '-i', 'testsrc=size=1080x1920:duration=1:rate=1', '-frames:v', '1', photo],
    { timeout: 60_000 },
  )
  await execFileAsync(
    FFMPEG,
    [
      '-y',
      '-f', 'lavfi', '-i', 'testsrc=duration=5:size=720x1280:rate=30',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', clip,
    ],
    { timeout: 120_000 },
  )
  await execFileAsync(
    FFMPEG,
    ['-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=8', '-c:a', 'libmp3lame', music],
    { timeout: 60_000 },
  )
  return { photo, clip, music }
}

interface Probe {
  streams: Array<{
    codec_type: string
    codec_name: string
    width?: number
    height?: number
    sample_rate?: string
    channels?: number
    r_frame_rate?: string
  }>
  format: { duration: string }
}

async function probe(file: string): Promise<Probe> {
  const { stdout } = await execFileAsync(
    FFPROBE,
    ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file],
    { timeout: 60_000 },
  )
  return JSON.parse(stdout) as Probe
}

async function measureMeanDb(file: string): Promise<number> {
  const result = await execFileAsync(
    FFMPEG,
    ['-nostats', '-i', file, '-map', '0:a:0', '-af', 'volumedetect', '-f', 'null', '-'],
    { timeout: 120_000 },
  ).catch((e: { stderr?: string }) => ({ stderr: e.stderr ?? '' }))
  const m = /mean_volume:\s*(-?[\d.]+|-inf)\s*dB/.exec(result.stderr ?? '')
  if (!m?.[1] || m[1] === '-inf') return -Infinity
  return Number(m[1])
}

/** Extract a small raw-RGB frame and return luminance stats + the pixels. */
async function frameStatsAt(
  file: string,
  atSec: number,
): Promise<{ mean: number; stdDev: number; pixels: Buffer }> {
  const dir = mkdtempSync(join(tmpdir(), 'sowyvid-pkgframe-'))
  const out = join(dir, 'frame.rgb')
  await execFileAsync(
    FFMPEG,
    ['-y', '-ss', String(atSec), '-i', file, '-frames:v', '1', '-vf', 'scale=64:64', '-pix_fmt', 'rgb24', '-f', 'rawvideo', out],
    { timeout: 60_000 },
  )
  const pixels = readFileSync(out)
  rmSync(dir, { recursive: true, force: true })
  const count = Math.floor(pixels.length / 3)
  let sum = 0
  const luma = new Float64Array(count)
  for (let i = 0; i < count; i++) {
    luma[i] = 0.299 * pixels[i * 3]! + 0.587 * pixels[i * 3 + 1]! + 0.114 * pixels[i * 3 + 2]!
    sum += luma[i]!
  }
  const mean = sum / count
  let variance = 0
  for (let i = 0; i < count; i++) variance += (luma[i]! - mean) ** 2
  return { mean, stdDev: Math.sqrt(variance / count), pixels }
}

function frameDifference(a: Buffer, b: Buffer): number {
  const len = Math.min(a.length, b.length)
  let total = 0
  for (let i = 0; i < len; i++) total += Math.abs(a[i]! - b[i]!)
  return total / len
}

test('the packaged SowyVid.exe exports a real audiovisual MP4 from a planted stale cache', async () => {
  expect(existsSync(packagedExe), 'run `npm run package:win` first').toBe(true)

  const userData = mkdtempSync(join(tmpdir(), 'sowyvid-pkg-'))
  const exportDir = mkdtempSync(join(tmpdir(), 'sowyvid-pkgout-'))
  const { photo, clip, music } = await makeSources()

  // --- §12: plant the Colibrí failure INSIDE the packaged app's user data ---
  // The shipped bundle's fingerprint is public in resources; a cache directory
  // already exists at that exact name, holding pre-audio garbage with a stale
  // stamp. "Directory exists → reuse" would render June's engine.
  const shippedStamp = JSON.parse(
    readFileSync(join(repoRoot, 'release', 'win-unpacked', 'resources', 'render-bundle', 'sowyvid-bundle.json'), 'utf8'),
  ) as { fingerprint: string }
  const staleDir = join(userData, 'render-cache', `bundle-${shippedStamp.fingerprint.slice(0, 16)}`)
  mkdirSync(staleDir, { recursive: true })
  writeFileSync(join(staleDir, 'index.html'), '<html>STALE PRE-AUDIO BUNDLE (june 16)</html>')
  writeFileSync(
    join(staleDir, 'sowyvid-bundle.json'),
    JSON.stringify({ fingerprint: 'pre-audio-june-16', stampVersion: 1, builtAt: '2026-06-16T00:00:00.000Z' }),
  )

  const app = await launchPackaged(userData, exportDir)
  const page = await app.firstWindow()

  // The packaged app really is packaged (not a dev binary in disguise).
  const isPackaged = await app.evaluate(({ app: electronApp }) => electronApp.isPackaged)
  expect(isPackaged).toBe(true)

  // --- the owner's workflow, in the packaged UI ---
  await page.getByLabel('Cuéntanos qué quieres promocionar').fill('Teléfonos certificados con garantía')
  await page.getByRole('button', { name: /Continuar/ }).click()
  await expect(page.getByTestId('commercial-summary')).toBeVisible({ timeout: 30_000 })

  // Real managed media through the packaged import path (magic-byte checks,
  // hashing, ffprobe analysis — all with PACKAGED ffmpeg/ffprobe).
  const setup = await page.evaluate(
    async ({ photoPath, clipPath, musicPath }) => {
      const bridge = window.sowyvid!
      const projects = await bridge.projects.list()
      if (!projects.ok || projects.value.length === 0) throw new Error('no project')
      const project = projects.value[0]!

      const imported = await bridge.media.import({
        projectId: project.id,
        paths: [photoPath, clipPath, musicPath],
      })
      if (!imported.ok) throw new Error(`import failed: ${imported.error.message}`)
      const media = imported.value.project.media
      const musicAsset = media.find((m) => m.kind === 'audio')
      const videoAsset = media.find((m) => m.kind === 'video')
      if (!musicAsset) throw new Error('music did not import')

      const saved = await bridge.projects.save({
        ...imported.value.project,
        audio: { ...imported.value.project.audio, musicId: musicAsset.id },
      })
      if (!saved.ok) throw new Error('save failed')
      return {
        projectId: project.id,
        // Packaged ffprobe/ffmpeg really ran: analysis produced duration+poster.
        musicAnalyzed: musicAsset.analysisStatus === 'ready' && musicAsset.durationSec !== null,
        videoAnalyzed: videoAsset
          ? videoAsset.analysisStatus === 'ready' && videoAsset.posterRelPath !== null
          : false,
      }
    },
    { photoPath: photo, clipPath: clip, musicPath: music },
  )
  expect(setup.musicAnalyzed, 'packaged ffprobe must analyze audio').toBe(true)
  expect(setup.videoAnalyzed, 'packaged ffmpeg must produce a video poster').toBe(true)

  // The preview mounts with the imported media (served by the packaged protocol).
  await expect(page.getByTestId('preview-player')).toBeVisible()

  // --- §13: click Descargar video in the packaged app ---
  const download = page.getByTestId('export-download')
  await expect(download).toBeEnabled()
  await download.click()
  await expect(page.getByTestId('export-progress')).toBeVisible({ timeout: 60_000 })
  await expect(page.getByTestId('export-completed')).toBeVisible({ timeout: 600_000 })

  // --- §12: the planted stale cache was replaced, not reused ---
  const repairedStamp = JSON.parse(readFileSync(join(staleDir, 'sowyvid-bundle.json'), 'utf8')) as {
    fingerprint: string
  }
  expect(repairedStamp.fingerprint).toBe(shippedStamp.fingerprint)
  expect(readFileSync(join(staleDir, 'index.html'), 'utf8')).not.toContain('STALE PRE-AUDIO')

  // --- §14: validate the EXACT file the packaged app produced ---
  const files = readdirSync(exportDir).filter((f) => f.endsWith('.mp4'))
  expect(files.length).toBe(1)
  const outputPath = join(exportDir, files[0]!)
  const bytes = statSync(outputPath).size
  expect(bytes).toBeGreaterThan(100_000)

  const info = await probe(outputPath)
  const video = info.streams.find((s) => s.codec_type === 'video')!
  const audio = info.streams.find((s) => s.codec_type === 'audio')!
  expect(video.codec_name).toBe('h264')
  // Vertical preset: 1080×1920.
  expect(video.width).toBe(1080)
  expect(video.height).toBe(1920)
  expect(audio.codec_name).toBe('aac')
  expect(audio.channels).toBeGreaterThanOrEqual(1)
  expect(Number(audio.sample_rate)).toBeGreaterThanOrEqual(44_100)
  const durationSec = Number(info.format.duration)
  expect(durationSec).toBeGreaterThan(15)
  expect(durationSec).toBeLessThan(30)

  // Decoded signal energy — an AAC stream alone proves nothing.
  const meanDb = await measureMeanDb(outputPath)
  expect(Number.isFinite(meanDb), 'digital silence (-inf) in the packaged export').toBe(true)
  expect(meanDb).toBeGreaterThan(SILENCE_THRESHOLD_DB)

  // --- §15: frames across the whole timeline ---
  const positions = [0.4, durationSec * 0.25, durationSec * 0.5, durationSec * 0.75, durationSec - 0.3]
  const frames = []
  for (const at of positions) frames.push(await frameStatsAt(outputPath, at))
  for (const [i, frame] of frames.entries()) {
    expect(frame.mean, `frame ${i} is black`).toBeGreaterThan(8)
    expect(frame.stdDev, `frame ${i} is a flat fill`).toBeGreaterThan(2)
  }
  // Scenes visibly change.
  const diffs = frames.slice(1).map((f, i) => frameDifference(frames[i]!.pixels, f.pixels))
  expect(Math.max(...diffs)).toBeGreaterThan(3)

  // Evidence block for the acceptance report.
  // eslint-disable-next-line no-console
  console.info(
    '\n=== PACKAGED EXPORT EVIDENCE ===\n' +
      JSON.stringify(
        {
          exe: packagedExe,
          outputPath,
          bytes,
          resolution: `${video.width}x${video.height}`,
          durationSec,
          fps: video.r_frame_rate,
          videoCodec: video.codec_name,
          audioCodec: audio.codec_name,
          sampleRate: audio.sample_rate,
          channels: audio.channels,
          meanVolumeDb: meanDb,
          staleCacheRepaired: true,
        },
        null,
        2,
      ) +
      '\n================================\n',
  )

  // --- §16: open file / open folder through the packaged IPC ---
  const opens = await page.evaluate(async (id) => {
    const bridge = window.sowyvid!
    const history = await bridge.render.listHistory({ projectId: id })
    if (!history.ok || history.value.length === 0) throw new Error('no history')
    const exportId = history.value[0]!.id
    const file = await bridge.render.openFile({ exportId })
    const folder = await bridge.render.openFolder({ exportId })
    return { record: history.value[0]!, file, folder }
  }, setup.projectId)
  expect(opens.record.status).toBe('completed')
  expect(opens.record.outputPath).toBe(outputPath)
  expect(opens.record.fileExists).toBe(true)
  expect(opens.file.ok && opens.file.value.opened).toBe(true)
  expect(opens.folder.ok && opens.folder.value.opened).toBe(true)

  await app.close()

  // --- §13/§8: restart the PACKAGED app; history must survive ---
  const app2 = await launchPackaged(userData, exportDir)
  const page2 = await app2.firstWindow()
  const survived = await page2.evaluate(async (id) => {
    const result = await window.sowyvid!.render.listHistory({ projectId: id })
    return result.ok ? result.value : []
  }, setup.projectId)
  expect(survived.length).toBe(1)
  expect(survived[0]!.status).toBe('completed')
  expect(survived[0]!.outputPath).toBe(outputPath)
  await app2.close()
})

test('the packaged app handles a deleted export and an unknown cancel calmly', async () => {
  expect(existsSync(packagedExe), 'run `npm run package:win` first').toBe(true)
  const userData = mkdtempSync(join(tmpdir(), 'sowyvid-pkg2-'))
  const exportDir = mkdtempSync(join(tmpdir(), 'sowyvid-pkg2out-'))
  const app = await launchPackaged(userData, exportDir)
  const page = await app.firstWindow()

  const outcome = await page.evaluate(async () => {
    const bridge = window.sowyvid!
    // Opening a nonexistent export: calm Spanish, no crash.
    const missingOpen = await bridge.render.openFile({ exportId: 'exp_inexistente' })
    // Unknown cancel: false, not an error.
    const bogusCancel = await bridge.render.cancel({ jobId: 'job_inexistente' })
    // Status for a nonexistent project: a readiness answer, not a throw.
    const status = await bridge.render.status({ projectId: 'proj_inexistente' })
    return { missingOpen, bogusCancel, status }
  })

  expect(outcome.missingOpen.ok).toBe(true)
  if (outcome.missingOpen.ok) {
    expect(outcome.missingOpen.value.opened).toBe(false)
    expect(outcome.missingOpen.value.message).toMatch(/no está disponible/)
  }
  expect(outcome.bogusCancel.ok && outcome.bogusCancel.value).toBe(false)
  expect(outcome.status.ok).toBe(true)
  if (outcome.status.ok) {
    expect(outcome.status.value.readiness.ready).toBe(false)
  }

  await app.close()
})
