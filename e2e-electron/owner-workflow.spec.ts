import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtempSync, writeFileSync, existsSync, statSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ffmpegPath from 'ffmpeg-static'
import ffprobeStatic from 'ffprobe-static'

/**
 * The OWNER-WORKFLOW-RECOVERY acceptance flow (§12), in the REAL Electron app,
 * driven through VISIBLE controls only. No project state is created through the
 * bridge — every commercial, every media import, every audio choice happens by
 * clicking what Jorge clicks. The only seams answer OS dialogs:
 *
 *   SOWYVID_E2E_IMPORT_PATHS_FILE — re-read each import, so ONE running app can
 *                                   import different files into two commercials.
 *   SOWYVID_E2E_EXPORT_DIR        — the save-dialog destination.
 *   SOWYVID_E2E_SUPPRESS_OPEN     — skip the shell open side effect.
 *
 * Scenarios: A (video with original audio → enabled → exported with AAC signal),
 * B (imported music → auto-selected → exported with measurable music),
 * C (referenced-media removal keeps the project usable and the old export intact),
 * D (restart lists both commercials; deleting one does not affect the other).
 */

const execFileAsync = promisify(execFile)
const repoRoot = resolve(fileURLToPath(import.meta.url), '..', '..')
const mainEntry = join(repoRoot, 'out', 'main', 'index.js')
const FFMPEG = ffmpegPath as string
const FFPROBE = ffprobeStatic.path

test.setTimeout(600_000)

const seamFile = join(mkdtempSync(join(tmpdir(), 'sowyvid-seam-')), 'imports.txt')
function setImports(paths: string[]): void {
  writeFileSync(seamFile, paths.join('\n'))
}

async function launch(userDataDir: string, exportDir: string): Promise<ElectronApplication> {
  return electron.launch({
    args: [mainEntry],
    env: {
      ...process.env,
      SOWYVID_USER_DATA: userDataDir,
      SOWYVID_E2E_EXPORT_DIR: exportDir,
      SOWYVID_E2E_SUPPRESS_OPEN: '1',
      SOWYVID_E2E_IMPORT_PATHS_FILE: seamFile,
    },
  })
}

async function makeSources(): Promise<{ photo: string; clipWithAudio: string; music: string }> {
  const dir = mkdtempSync(join(tmpdir(), 'sowyvid-ownersrc-'))
  const photo = join(dir, 'tienda.png')
  const clipWithAudio = join(dir, 'mostrador_con_audio.mp4')
  const music = join(dir, 'fondo.mp3')
  await execFileAsync(
    FFMPEG,
    ['-y', '-f', 'lavfi', '-i', 'testsrc=size=1080x1920:duration=1:rate=1', '-frames:v', '1', photo],
    { timeout: 60_000 },
  )
  // A REAL video that genuinely carries an audio stream — the whole point of
  // scenario A. Video + a loud sine so source audio is measurable when enabled.
  await execFileAsync(
    FFMPEG,
    [
      '-y',
      '-f', 'lavfi', '-i', 'testsrc=duration=6:size=720x1280:rate=30',
      '-f', 'lavfi', '-i', 'sine=frequency=330:duration=6',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', clipWithAudio,
    ],
    { timeout: 120_000 },
  )
  await execFileAsync(
    FFMPEG,
    ['-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=8', '-c:a', 'libmp3lame', music],
    { timeout: 60_000 },
  )
  return { photo, clipWithAudio, music }
}

async function probeStreams(file: string): Promise<Array<{ codec_type: string; codec_name: string }>> {
  const { stdout } = await execFileAsync(
    FFPROBE,
    ['-v', 'error', '-show_streams', '-of', 'json', file],
    { timeout: 60_000 },
  )
  return (JSON.parse(stdout) as { streams: Array<{ codec_type: string; codec_name: string }> }).streams
}

async function meanDb(file: string): Promise<number> {
  const r = await execFileAsync(
    FFMPEG,
    ['-nostats', '-i', file, '-map', '0:a:0', '-af', 'volumedetect', '-f', 'null', '-'],
    { timeout: 120_000 },
  ).catch((e: { stderr?: string }) => ({ stderr: e.stderr ?? '' }))
  const m = /mean_volume:\s*(-?[\d.]+|-inf)\s*dB/.exec(r.stderr ?? '')
  if (!m?.[1] || m[1] === '-inf') return -Infinity
  return Number(m[1])
}

/** Drive step 1 → a compiled commercial in the current (blank) workspace. */
async function createCommercial(page: import('@playwright/test').Page, text: string): Promise<void> {
  await page.getByLabel('Cuéntanos qué quieres promocionar').fill(text)
  await page.getByRole('button', { name: /Continuar/ }).click()
  await expect(page.getByTestId('commercial-summary')).toBeVisible({ timeout: 30_000 })
}

async function exportAndWait(page: import('@playwright/test').Page): Promise<void> {
  const download = page.getByTestId('export-download')
  await expect(download).toBeEnabled({ timeout: 30_000 })
  await download.click()
  await expect(page.getByTestId('export-completed')).toBeVisible({ timeout: 480_000 })
}

test('two commercials: source audio, music, referenced removal, and library survive restart', async () => {
  expect(existsSync(mainEntry), 'run `npm run build` first').toBe(true)
  const userData = mkdtempSync(join(tmpdir(), 'sowyvid-owner-'))
  const exportDirA = mkdtempSync(join(tmpdir(), 'sowyvid-ownerA-'))
  const exportDirB = mkdtempSync(join(tmpdir(), 'sowyvid-ownerB-'))
  const { photo, clipWithAudio, music } = await makeSources()

  // ----- Scenario A: a video WITH original audio -----
  setImports([clipWithAudio, photo])
  let app = await launch(userData, exportDirA)
  let page = await app.firstWindow()

  await createCommercial(page, 'Promoción del mostrador con sonido real')
  await page.getByRole('button', { name: /Este equipo/ }).click()
  // The video is identified from analyzed content, and its audio is offered.
  await expect(page.getByTestId('source-audio-section')).toBeVisible({ timeout: 120_000 })

  const aInfo = await page.evaluate(async () => {
    const bridge = window.sowyvid!
    const projects = await bridge.projects.list()
    const project = projects.ok ? projects.value[0]! : null
    const video = project?.media.find((m) => m.kind === 'video') ?? null
    return {
      projectId: project?.id ?? '',
      videoHasAudio: video?.hasAudio ?? false,
      videoAudioCodec: video?.audioCodec ?? null,
      videoContainer: video?.container ?? null,
    }
  })
  expect(aInfo.videoHasAudio, 'the analyzed clip must report an audio stream').toBe(true)
  expect(aInfo.videoAudioCodec).toBeTruthy()

  // The owner turns ON the original audio (off by default). It is a controlled
  // checkbox backed by an async persist+replan, so click and then poll the
  // persisted result rather than asserting an instantaneous flip.
  await page.getByTestId('source-audio-toggle').click()
  // Persisted → replanned: the choice reaches persisted project state (which is
  // exactly what the export rebuilds from), so preview and export agree.
  await expect
    .poll(async () =>
      page.evaluate(async (id) => {
        const p = await window.sowyvid!.projects.get(id)
        return p.ok && p.value ? p.value.audio.useSourceAudio : false
      }, aInfo.projectId),
    )
    .toBe(true)

  await exportAndWait(page)
  const aFiles = readdirSync(exportDirA).filter((f) => f.endsWith('.mp4'))
  expect(aFiles.length).toBe(1)
  const aPath = join(exportDirA, aFiles[0]!)
  expect(statSync(aPath).size).toBeGreaterThan(100_000)
  const aStreams = await probeStreams(aPath)
  expect(aStreams.some((s) => s.codec_type === 'audio' && s.codec_name === 'aac')).toBe(true)
  const aMeanDb = await meanDb(aPath)
  expect(Number.isFinite(aMeanDb), 'scenario A export is digital silence').toBe(true)
  expect(aMeanDb).toBeGreaterThan(-55)

  // Scenario A must appear in Mis comerciales.
  await page.getByRole('button', { name: 'Mis comerciales' }).click()
  await expect(page.getByTestId('commercial-card')).toHaveCount(1)
  await app.close()

  // ----- Scenario B: imported music, a SEPARATE commercial -----
  setImports([photo, music])
  app = await launch(userData, exportDirB)
  page = await app.firstWindow()
  // Fresh start restores commercial A; the owner explicitly starts a new one.
  await page.getByTestId('new-commercial').click()
  await createCommercial(page, 'Promoción con música de fondo')
  await page.getByRole('button', { name: /Este equipo/ }).click()
  // Music auto-selects and its volume control becomes active.
  await expect(page.getByTestId('music-select')).toBeVisible({ timeout: 120_000 })
  await expect(page.getByTestId('music-select')).not.toHaveValue('')
  await expect(page.getByTestId('music-volume')).toBeEnabled()

  const bId = await page.evaluate(async () => {
    const projects = await window.sowyvid!.projects.list()
    // Newest first; B is the one we just built.
    return projects.ok ? projects.value[0]!.id : ''
  })

  await exportAndWait(page)
  const bFiles = readdirSync(exportDirB).filter((f) => f.endsWith('.mp4'))
  expect(bFiles.length).toBe(1)
  const bPath = join(exportDirB, bFiles[0]!)
  const bMeanDb = await meanDb(bPath)
  expect(Number.isFinite(bMeanDb), 'scenario B export has no music signal').toBe(true)
  expect(bMeanDb).toBeGreaterThan(-55)

  // Two distinct commercials now exist.
  await page.getByRole('button', { name: 'Mis comerciales' }).click()
  await expect(page.getByTestId('commercial-card')).toHaveCount(2)
  await app.close()

  // ----- Scenario C: referenced-media removal keeps A usable, export intact -----
  app = await launch(userData, exportDirA)
  page = await app.firstWindow()
  // Open commercial A from the library.
  await page.getByRole('button', { name: 'Mis comerciales' }).click()
  const cardA = page.locator('[data-testid="commercial-card"]', { hasText: 'mostrador' })
  await cardA.getByTestId('commercial-open').click()
  await expect(page.getByTestId('commercial-summary')).toBeVisible({ timeout: 30_000 })

  // Try to remove the used video → the decision dialog appears (not a dead end).
  await page.getByRole('button', { name: /Quitar mostrador/ }).click()
  await expect(page.getByTestId('media-remove-dialog')).toBeVisible()
  await page.getByTestId('media-remove-confirm').click()
  await expect(page.getByTestId('media-remove-dialog')).toHaveCount(0)

  // The project remains usable: it still compiles and can still export.
  await expect(page.getByTestId('export-panel')).toBeVisible()
  const cState = await page.evaluate(async () => {
    const projects = await window.sowyvid!.projects.list()
    const a = projects.ok ? projects.value.find((p) => p.name.includes('mostrador')) : null
    return {
      videoGone: a ? !a.media.some((m) => m.kind === 'video') : false,
      sourceAudioOff: a ? a.audio.useSourceAudio === false : false,
    }
  })
  expect(cState.videoGone).toBe(true)
  // Source audio was switched off because its only clip is gone (no dangling ref).
  expect(cState.sourceAudioOff).toBe(true)
  // The already-exported MP4 is untouched on disk.
  expect(existsSync(aPath), 'the old export must survive media removal').toBe(true)
  await app.close()

  // ----- Scenario D: restart lists both; deleting one leaves the other -----
  app = await launch(userData, exportDirA)
  page = await app.firstWindow()
  await page.getByRole('button', { name: 'Mis comerciales' }).click()
  await expect(page.getByTestId('commercial-card')).toHaveCount(2)

  // Delete commercial B, keeping its exported video on disk.
  const cardB = page.locator('[data-testid="commercial-card"]', { hasText: 'música' })
  await cardB.getByTestId('commercial-delete').click()
  await expect(page.getByTestId('delete-dialog')).toBeVisible()
  await page.getByTestId('delete-keep-exports').check()
  await page.getByTestId('delete-confirm').click()

  // Only commercial A remains; B's exported file is still on disk (kept).
  await expect(page.getByTestId('commercial-card')).toHaveCount(1)
  await expect(page.getByTestId('commercial-card')).toContainText('mostrador')
  expect(existsSync(bPath), 'kept export must remain after deleting its commercial').toBe(true)

  const survivors = await page.evaluate(async () => {
    const projects = await window.sowyvid!.projects.list()
    return projects.ok ? projects.value.map((p) => p.name) : []
  })
  expect(survivors.length).toBe(1)
  expect(survivors[0]).toContain('mostrador')

  // Evidence block for the acceptance report.
  // eslint-disable-next-line no-console
  console.info(
    '\n=== OWNER WORKFLOW EVIDENCE ===\n' +
      JSON.stringify(
        {
          commercialA: { projectId: aInfo.projectId, export: aPath, sourceAudioMeanDb: aMeanDb },
          commercialB: { projectId: bId, export: bPath, musicMeanDb: bMeanDb },
          referencedRemoval: 'video removed, source audio auto-disabled, old export intact',
          afterRestart: survivors,
        },
        null,
        2,
      ) +
      '\n===============================\n',
  )
  await app.close()
})
