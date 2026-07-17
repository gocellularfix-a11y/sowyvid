import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtempSync, existsSync, statSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ffmpegPath from 'ffmpeg-static'
import ffprobeStatic from 'ffprobe-static'

/**
 * The owner's export, end to end, in the REAL Electron app (§9):
 *
 *   real imported media → compiled plans → CLICK the real "Descargar video"
 *   button → progress on screen → a real MP4 on disk → history row →
 *   restart → history survives.
 *
 * The only test seams are environment flags: SOWYVID_E2E_EXPORT_DIR replaces
 * the save dialog's ANSWER (the render path is identical), and
 * SOWYVID_E2E_SUPPRESS_OPEN skips the final shell side effect so automated
 * runs don't spawn video players. Nothing is mocked — the button drives the
 * same IPC and the same runRenderJob as production, and a real file must
 * appear with measurable audio.
 */

const execFileAsync = promisify(execFile)
const repoRoot = resolve(fileURLToPath(import.meta.url), '..', '..')
const mainEntry = join(repoRoot, 'out', 'main', 'index.js')
const FFMPEG = ffmpegPath as string
const FFPROBE = ffprobeStatic.path

test.setTimeout(600_000)

async function launch(
  userDataDir: string,
  exportDir: string,
  importPaths: string[] = [],
): Promise<ElectronApplication> {
  return electron.launch({
    args: [mainEntry],
    env: {
      ...process.env,
      SOWYVID_USER_DATA: userDataDir,
      SOWYVID_E2E_EXPORT_DIR: exportDir,
      SOWYVID_E2E_SUPPRESS_OPEN: '1',
      SOWYVID_E2E_IMPORT_PATHS: importPaths.join(';'),
    },
  })
}

async function makeSources(): Promise<{ photo: string; music: string }> {
  const dir = mkdtempSync(join(tmpdir(), 'sowyvid-btnsrc-'))
  const photo = join(dir, 'tienda.png')
  const music = join(dir, 'fondo.mp3')
  await execFileAsync(
    FFMPEG,
    ['-y', '-f', 'lavfi', '-i', 'testsrc=size=1080x1920:duration=1:rate=1', '-frames:v', '1', photo],
    { timeout: 60_000 },
  )
  await execFileAsync(
    FFMPEG,
    ['-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=8', '-c:a', 'libmp3lame', music],
    { timeout: 60_000 },
  )
  return { photo, music }
}

test('Descargar video produces a real MP4 and survives a restart', async () => {
  expect(existsSync(mainEntry), 'run `npm run build` first').toBe(true)
  const userData = mkdtempSync(join(tmpdir(), 'sowyvid-btn-'))
  const exportDir = mkdtempSync(join(tmpdir(), 'sowyvid-btnout-'))
  const { photo, music } = await makeSources()

  const app = await launch(userData, exportDir, [photo, music])
  const page = await app.firstWindow()

  // --- the owner creates their commercial through the real UI ---
  await page.getByLabel('Cuéntanos qué quieres promocionar').fill('Teléfonos certificados con garantía')
  await page.getByRole('button', { name: /Continuar/ }).click()
  await expect(page.getByTestId('commercial-summary')).toBeVisible({ timeout: 15_000 })

  // --- media + music through the REAL "Este equipo" button; the seam answers
  // only the open dialog. Nothing sets musicId: the app must auto-select the
  // imported music, and the owner must SEE that selection. ---
  await page.getByRole('button', { name: /Este equipo/ }).click()
  await expect(page.getByTestId('music-select')).toBeVisible({ timeout: 120_000 })
  await expect(page.getByTestId('music-select')).not.toHaveValue('')

  const projectId = await page.evaluate(async () => {
    const bridge = window.sowyvid!
    const projects = await bridge.projects.list()
    if (!projects.ok || projects.value.length === 0) throw new Error('no project')
    const project = projects.value[0]!
    const musicAsset = project.media.find((m) => m.kind === 'audio')
    if (!musicAsset) throw new Error('music did not import as audio')
    if (project.audio.musicId !== musicAsset.id) {
      throw new Error('imported music was not auto-selected as the commercial music')
    }
    return project.id
  })

  // --- the gate reports ready through the same IPC the button uses ---
  const status = await page.evaluate(async (id) => {
    const result = await window.sowyvid!.render.status({ projectId: id })
    if (!result.ok) throw new Error('status failed')
    return result.value
  }, projectId)
  expect(status.readiness.ready, JSON.stringify(status.readiness.blockers)).toBe(true)
  expect(status.defaultPreset).toBe('vertical')

  // --- the owner clicks the REAL button ---
  const download = page.getByTestId('export-download')
  await expect(download).toBeEnabled()
  await download.click()

  // Progress appears, with owner-facing Spanish stages.
  await expect(page.getByTestId('export-progress')).toBeVisible({ timeout: 30_000 })
  const stage = await page.getByTestId('export-stage').textContent()
  expect(stage).toMatch(/Preparando|Creando|Guardando/)
  expect(stage).not.toMatch(/ffmpeg|remotion|error/i)

  // Rendering a real commercial takes a while (a fresh cache bundles first).
  await expect(page.getByTestId('export-completed')).toBeVisible({ timeout: 480_000 })
  const shownName = await page.getByTestId('export-file-name').textContent()
  expect(shownName).toContain('.mp4')

  // --- a real MP4 exists exactly where the seam said to save ---
  const files = readdirSync(exportDir).filter((f) => f.endsWith('.mp4'))
  expect(files.length).toBe(1)
  const outputPath = join(exportDir, files[0]!)
  expect(statSync(outputPath).size).toBeGreaterThan(100_000)

  // --- and it is a real audiovisual file, not a stub ---
  const { stdout } = await execFileAsync(
    FFPROBE,
    ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', outputPath],
    { timeout: 60_000 },
  )
  const probe = JSON.parse(stdout) as {
    streams: Array<{ codec_type: string; codec_name: string }>
    format: { duration: string }
  }
  expect(probe.streams.some((s) => s.codec_type === 'video' && s.codec_name === 'h264')).toBe(true)
  expect(probe.streams.some((s) => s.codec_type === 'audio' && s.codec_name === 'aac')).toBe(true)
  expect(Number(probe.format.duration)).toBeGreaterThan(10)

  // Decoded signal, not just a stream: the selected music must be audible.
  const rms = await execFileAsync(
    FFMPEG,
    ['-nostats', '-i', outputPath, '-map', '0:a:0', '-af', 'volumedetect', '-f', 'null', '-'],
    { timeout: 120_000 },
  ).catch((e: { stderr?: string }) => ({ stderr: e.stderr ?? '' }))
  const mean = /mean_volume:\s*(-?[\d.]+)\s*dB/.exec(rms.stderr ?? '')
  expect(mean, 'volumedetect must report a level').not.toBeNull()
  expect(Number(mean![1])).toBeGreaterThan(-50)

  // --- open-file/open-folder wiring (side effect suppressed by the seam) ---
  await page.getByTestId('export-open-folder').click()
  await expect(page.getByTestId('export-notice')).toHaveCount(0)

  // --- history shows the completed export ---
  await expect(page.getByTestId('export-history')).toBeVisible()
  const record = await page.evaluate(async (id) => {
    const result = await window.sowyvid!.render.listHistory({ projectId: id })
    if (!result.ok) throw new Error('history failed')
    return result.value[0]!
  }, projectId)
  expect(record.status).toBe('completed')
  expect(record.outputPath).toBe(outputPath)
  expect(record.videoCodec).toBe('h264')
  expect(record.audioCodec).toBe('aac')
  expect(record.fingerprint).toBeTruthy()
  expect(record.fileExists).toBe(true)

  await app.close()

  // --- restart: the export history must survive AND be visible in the UI ---
  const app2 = await launch(userData, exportDir)
  const page2 = await app2.firstWindow()
  // The app restores the owner's project on startup — step 4 comes back alive
  // with the history list, without generating anything again.
  await expect(page2.getByTestId('export-panel')).toBeVisible({ timeout: 60_000 })
  await expect(page2.getByTestId('export-history')).toBeVisible()
  await expect(page2.getByTestId('export-history-row').first()).toContainText('.mp4')
  const survived = await page2.evaluate(async (id) => {
    const result = await window.sowyvid!.render.listHistory({ projectId: id })
    if (!result.ok) throw new Error('history failed after restart')
    return result.value
  }, projectId)
  expect(survived.length).toBe(1)
  expect(survived[0]!.status).toBe('completed')
  expect(survived[0]!.outputPath).toBe(outputPath)
  expect(survived[0]!.fileExists).toBe(true)
  await app2.close()
})

test('a second render for the same project is refused while one is active', async () => {
  expect(existsSync(mainEntry), 'run `npm run build` first').toBe(true)
  const userData = mkdtempSync(join(tmpdir(), 'sowyvid-btn2-'))
  const exportDir = mkdtempSync(join(tmpdir(), 'sowyvid-btn2out-'))
  const app = await launch(userData, exportDir)
  const page = await app.firstWindow()

  await page.getByLabel('Cuéntanos qué quieres promocionar').fill('Reparación de pantallas')
  await page.getByRole('button', { name: /Continuar/ }).click()
  await expect(page.getByTestId('commercial-summary')).toBeVisible({ timeout: 15_000 })

  const outcome = await page.evaluate(async () => {
    const bridge = window.sowyvid!
    const projects = await bridge.projects.list()
    const projectId = projects.ok ? projects.value[0]!.id : ''

    // First start goes through the real path…
    const first = await bridge.render.start({ projectId, presetId: 'vertical' })
    // …and an immediate second start must be refused, not duplicated.
    const second = await bridge.render.start({ projectId, presetId: 'vertical' })
    // Unknown-job cancel is calm, not an error.
    const bogusCancel = await bridge.render.cancel({ jobId: 'job_desconocido' })
    // Clean up: cancel the real job so the app can close quickly.
    const jobId = first.ok && first.value.job ? first.value.job.jobId : null
    const realCancel = jobId ? await bridge.render.cancel({ jobId }) : null
    return { first, second, bogusCancel, realCancel }
  })

  expect(outcome.first.ok).toBe(true)
  expect(outcome.second.ok).toBe(false)
  if (!outcome.second.ok) {
    // Owner-facing Spanish, stable code, no internals.
    expect(['BUSY', 'NOT_READY']).toContain(outcome.second.error.code)
    expect(outcome.second.error.message).toMatch(/exportación en curso/)
  }
  expect(outcome.bogusCancel.ok && outcome.bogusCancel.value).toBe(false)
  expect(outcome.realCancel && outcome.realCancel.ok && outcome.realCancel.value).toBe(true)

  // The canceled attempt is recorded truthfully and no MP4 was published.
  await page.waitForTimeout(2_000)
  const history = await page.evaluate(async () => {
    const bridge = window.sowyvid!
    const projects = await bridge.projects.list()
    const projectId = projects.ok ? projects.value[0]!.id : ''
    const result = await bridge.render.listHistory({ projectId })
    return result.ok ? result.value : []
  })
  expect(history.length).toBe(1)
  expect(history[0]!.status).toBe('canceled')
  expect(readdirSync(exportDir).filter((f) => f.endsWith('.mp4'))).toEqual([])

  await app.close()
})
