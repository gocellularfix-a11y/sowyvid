import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtempSync, writeFileSync, existsSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ffmpegPath from 'ffmpeg-static'
import ffprobeStatic from 'ffprobe-static'

/**
 * OWNER-WORKFLOW-RECOVERY acceptance, INSIDE the real packaged SowyVid.exe.
 *
 * This is the electron owner-path flow (`e2e-electron/owner-workflow.spec.ts`)
 * ported to the shipped executable: same visible controls, same audible-signal
 * measurement, but launched from `release/win-unpacked/SowyVid.exe` with the
 * packaged render bundle / browser / compositor. NOTHING mutates project state
 * through the bridge — every decision is a click on a visible control. The only
 * seams answer OS dialogs:
 *
 *   SOWYVID_E2E_IMPORT_PATHS_FILE — re-read per import, so ONE running app can
 *                                   import different files into two commercials.
 *   SOWYVID_E2E_EXPORT_DIR        — the save-dialog destination.
 *   SOWYVID_E2E_SUPPRESS_OPEN     — skip the shell open side effect.
 *   SOWYVID_E2E_USER_DATA         — isolated, persistent user data (for restart).
 *
 * `bridge` calls appear ONLY to READ state for assertions (project ids, export
 * paths) — never to create a project, import media, or choose audio.
 */

const execFileAsync = promisify(execFile)
const repoRoot = resolve(fileURLToPath(import.meta.url), '..', '..')
const packagedExe = join(repoRoot, 'release', 'win-unpacked', 'SowyVid.exe')
const FFMPEG = ffmpegPath as string
const FFPROBE = ffprobeStatic.path
const SILENCE_THRESHOLD_DB = -55

const seamFile = join(mkdtempSync(join(tmpdir(), 'sowyvid-pkgseam-')), 'imports.txt')
function setImports(paths: string[]): void {
  writeFileSync(seamFile, paths.join('\n'))
}

async function launch(userDataDir: string, exportDir: string): Promise<ElectronApplication> {
  return electron.launch({
    executablePath: packagedExe,
    args: [],
    env: {
      ...process.env,
      SOWYVID_E2E_USER_DATA: userDataDir,
      SOWYVID_E2E_EXPORT_DIR: exportDir,
      SOWYVID_E2E_SUPPRESS_OPEN: '1',
      SOWYVID_E2E_IMPORT_PATHS_FILE: seamFile,
    },
  })
}

async function makeSources(): Promise<{
  photo: string
  photoB: string
  clipWithAudio: string
  music: string
  musicB: string
}> {
  const dir = mkdtempSync(join(tmpdir(), 'sowyvid-pkgownersrc-'))
  const photo = join(dir, 'tienda.png')
  const photoB = join(dir, 'vitrina.png')
  const clipWithAudio = join(dir, 'mostrador_audio.mp4')
  const music = join(dir, 'fondo.mp3')
  const musicB = join(dir, 'jingle.mp3')
  await execFileAsync(
    FFMPEG,
    ['-y', '-f', 'lavfi', '-i', 'testsrc=size=1080x1920:duration=1:rate=1', '-frames:v', '1', photo],
    { timeout: 60_000 },
  )
  await execFileAsync(
    FFMPEG,
    ['-y', '-f', 'lavfi', '-i', 'rgbtestsrc=size=1080x1920:duration=1:rate=1', '-frames:v', '1', photoB],
    { timeout: 60_000 },
  )
  // A REAL video that genuinely carries an audio stream — the point of scenario
  // A. Video + a loud sine so the ORIGINAL audio is measurable when enabled.
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
  await execFileAsync(
    FFMPEG,
    ['-y', '-f', 'lavfi', '-i', 'sine=frequency=520:duration=8', '-c:a', 'libmp3lame', musicB],
    { timeout: 60_000 },
  )
  return { photo, photoB, clipWithAudio, music, musicB }
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

async function hasAacAudio(file: string): Promise<boolean> {
  const { stdout } = await execFileAsync(
    FFPROBE,
    ['-v', 'error', '-show_streams', '-of', 'json', file],
    { timeout: 60_000 },
  )
  const streams = (JSON.parse(stdout) as { streams: Array<{ codec_type: string; codec_name: string }> }).streams
  return streams.some((s) => s.codec_type === 'audio' && s.codec_name === 'aac')
}

/** Read-only: the current project id list (newest first). For assertions only. */
async function projectIds(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const r = await window.sowyvid!.projects.list()
    return r.ok ? r.value.map((p) => p.id) : []
  })
}

/** Read-only: newest COMPLETED export path for a project. For measurement only. */
async function newestExportPath(page: Page, projectId: string): Promise<string | null> {
  return page.evaluate(async (id) => {
    const r = await window.sowyvid!.render.listHistory({ projectId: id })
    if (!r.ok) return null
    const done = r.value.filter((x) => x.status === 'completed')
    return done[0]?.outputPath ?? null
  }, projectId)
}

async function createCommercial(page: Page, text: string): Promise<void> {
  await page.getByLabel('Cuéntanos qué quieres promocionar').fill(text)
  await page.getByRole('button', { name: /Continuar/ }).click()
  await expect(page.getByTestId('commercial-summary')).toBeVisible({ timeout: 60_000 })
}

async function exportAndWait(page: Page): Promise<void> {
  const download = page.getByTestId('export-download')
  await expect(download).toBeEnabled({ timeout: 60_000 })
  await download.click()
  await expect(page.getByTestId('export-completed')).toBeVisible({ timeout: 600_000 })
  // Return to the pre-export state so a second export can start from the button.
  await page.getByTestId('export-another').click()
  await expect(page.getByTestId('export-download')).toBeVisible({ timeout: 30_000 })
}

test('packaged owner acceptance: source audio, replacement music, two commercials, removal, restarts', async () => {
  expect(existsSync(packagedExe), 'run `npm run package:win` first').toBe(true)

  const userData = mkdtempSync(join(tmpdir(), 'sowyvid-pkgowner-'))
  const exportDir = mkdtempSync(join(tmpdir(), 'sowyvid-pkgownerout-'))
  const { photo, photoB, clipWithAudio, music, musicB } = await makeSources()

  const evidence: Record<string, unknown> = {}

  // ================= SESSION 1: build A (two exports) and B =================
  setImports([clipWithAudio, photo])
  let app = await launch(userData, exportDir)
  let page = await app.firstWindow()
  expect(await app.evaluate(({ app: a }) => a.isPackaged), 'must be the packaged app').toBe(true)

  // --- (1) Commercial A with an MP4 that contains audio ---
  await createCommercial(page, 'Comercial A mostrador con audio real')
  await page.getByRole('button', { name: /Este equipo/ }).click()

  // --- (2) The tile visibly says "Video · … · Con audio" (analyzed content) ---
  await expect(page.getByText(/Video · .* · Con audio/)).toBeVisible({ timeout: 180_000 })
  await expect(page.getByTestId('source-audio-section')).toBeVisible()

  const aId = (await projectIds(page))[0]!
  expect(aId).toBeTruthy()

  // --- (3) Enable "Audio original del video" and export measurable audio ---
  await page.getByTestId('source-audio-toggle').click()
  await expect
    .poll(async () =>
      page.evaluate(async (id) => {
        const p = await window.sowyvid!.projects.get(id)
        return p.ok && p.value ? p.value.audio.useSourceAudio : false
      }, aId),
    )
    .toBe(true)
  await exportAndWait(page)
  const aSourceAudioExport = (await newestExportPath(page, aId))!
  expect(existsSync(aSourceAudioExport)).toBe(true)
  expect(statSync(aSourceAudioExport).size).toBeGreaterThan(100_000)
  expect(await hasAacAudio(aSourceAudioExport)).toBe(true)
  const aSourceAudioDb = await meanDb(aSourceAudioExport)
  expect(Number.isFinite(aSourceAudioDb), 'source-audio export is digital silence').toBe(true)
  expect(aSourceAudioDb).toBeGreaterThan(SILENCE_THRESHOLD_DB)
  evidence.aSourceAudio = { export: aSourceAudioExport, meanDb: aSourceAudioDb }

  // --- (4) Mute original audio, import MP3, select it, export replacement music ---
  await page.getByTestId('source-audio-toggle').click()
  await expect
    .poll(async () =>
      page.evaluate(async (id) => {
        const p = await window.sowyvid!.projects.get(id)
        return p.ok && p.value ? p.value.audio.useSourceAudio : true
      }, aId),
    )
    .toBe(false)
  setImports([music])
  await page.getByRole('button', { name: /Este equipo/ }).click()
  // The imported music auto-selects and its volume control is active.
  await expect(page.getByTestId('music-select')).toBeVisible({ timeout: 180_000 })
  await expect(page.getByTestId('music-select')).not.toHaveValue('')
  await expect(page.getByTestId('music-volume')).toBeEnabled()
  await exportAndWait(page)
  const aMusicExport = (await newestExportPath(page, aId))!
  expect(aMusicExport).not.toBe(aSourceAudioExport)
  const aMusicDb = await meanDb(aMusicExport)
  expect(Number.isFinite(aMusicDb), 'replacement-music export is digital silence').toBe(true)
  expect(aMusicDb).toBeGreaterThan(SILENCE_THRESHOLD_DB)
  evidence.aMusic = { export: aMusicExport, meanDb: aMusicDb }

  // --- (5) Commercial B with a DIFFERENT project id ---
  await page.getByTestId('new-commercial').click()
  await createCommercial(page, 'Comercial B con música de fondo')
  setImports([photoB, musicB])
  await page.getByRole('button', { name: /Este equipo/ }).click()
  await expect(page.getByTestId('music-select')).toBeVisible({ timeout: 180_000 })
  await expect(page.getByTestId('music-select')).not.toHaveValue('')
  const bId = (await projectIds(page)).find((id) => id !== aId)!
  expect(bId, 'Commercial B must have a new project id').toBeTruthy()
  expect(bId).not.toBe(aId)
  await exportAndWait(page)
  const bExport = (await newestExportPath(page, bId))!
  expect(existsSync(bExport)).toBe(true)
  evidence.b = { projectId: bId, export: bExport }
  evidence.a = { projectId: aId }

  // --- (6) Both appear in Mis comerciales, each with its own exported video ---
  await page.getByRole('button', { name: 'Mis comerciales' }).click()
  await expect(page.getByTestId('commercial-card')).toHaveCount(2)
  const cardA = page.locator('[data-testid="commercial-card"]', { hasText: 'mostrador' })
  const cardB = page.locator('[data-testid="commercial-card"]', { hasText: 'música' })
  await expect(cardA).toHaveCount(1)
  await expect(cardB).toHaveCount(1)
  // Each commercial shows its own "Videos creados".
  await cardA.getByTestId('commercial-videos-toggle').click()
  await expect(cardA.getByTestId('video-row').first()).toBeVisible()
  await cardB.getByTestId('commercial-videos-toggle').click()
  await expect(cardB.getByTestId('video-row').first()).toBeVisible()
  await app.close()

  // ================= SESSION 2: restart → both visible; removal; delete B =====
  app = await launch(userData, exportDir)
  page = await app.firstWindow()
  // --- (7) After restart both commercials remain visible ---
  await page.getByRole('button', { name: 'Mis comerciales' }).click()
  await expect(page.getByTestId('commercial-card')).toHaveCount(2)
  await expect(page.locator('[data-testid="commercial-card"]', { hasText: 'mostrador' })).toHaveCount(1)
  await expect(page.locator('[data-testid="commercial-card"]', { hasText: 'música' })).toHaveCount(1)

  // --- (8) Remove referenced media via the visible decision dialog (Commercial A) ---
  await page
    .locator('[data-testid="commercial-card"]', { hasText: 'mostrador' })
    .getByTestId('commercial-open')
    .click()
  await expect(page.getByTestId('commercial-summary')).toBeVisible({ timeout: 60_000 })
  await page.getByRole('button', { name: /Quitar mostrador_audio/ }).click()
  await expect(page.getByTestId('media-remove-dialog')).toBeVisible()
  await page.getByTestId('media-remove-confirm').click()
  await expect(page.getByTestId('media-remove-dialog')).toHaveCount(0)

  // --- (9) The project stays usable and the old exported MP4 is intact ---
  await expect(page.getByTestId('export-panel')).toBeVisible()
  const aVideoGone = await page.evaluate(async (id) => {
    const p = await window.sowyvid!.projects.get(id)
    return p.ok && p.value ? !p.value.media.some((m) => m.kind === 'video') : false
  }, aId)
  expect(aVideoGone).toBe(true)
  expect(existsSync(aSourceAudioExport), 'old A export must survive media removal').toBe(true)
  expect(existsSync(aMusicExport), 'A music export must survive media removal').toBe(true)

  // --- (10) Delete Commercial B, preserving its exported file ---
  await page.getByRole('button', { name: 'Mis comerciales' }).click()
  const cardBDel = page.locator('[data-testid="commercial-card"]', { hasText: 'música' })
  await cardBDel.getByTestId('commercial-delete').click()
  await expect(page.getByTestId('delete-dialog')).toBeVisible()
  // Keep the exported video on disk (default checked, but assert it explicitly).
  const keep = page.getByTestId('delete-keep-exports')
  await expect(keep).toBeChecked()
  await page.getByTestId('delete-confirm').click()
  await expect(page.getByTestId('commercial-card')).toHaveCount(1)
  expect(existsSync(bExport), 'kept export must remain after deleting Commercial B').toBe(true)
  await app.close()

  // ================= SESSION 3: restart → only Commercial A remains ==========
  app = await launch(userData, exportDir)
  page = await app.firstWindow()
  // --- (11) After restart only Commercial A is present ---
  await page.getByRole('button', { name: 'Mis comerciales' }).click()
  await expect(page.getByTestId('commercial-card')).toHaveCount(1)
  await expect(page.getByTestId('commercial-card')).toContainText('mostrador')
  const survivors = await projectIds(page)
  expect(survivors).toEqual([aId])

  // eslint-disable-next-line no-console
  console.info(
    '\n=== PACKAGED OWNER ACCEPTANCE EVIDENCE ===\n' +
      JSON.stringify({ exe: packagedExe, ...evidence, survivors }, null, 2) +
      '\n==========================================\n',
  )
  await app.close()
})
