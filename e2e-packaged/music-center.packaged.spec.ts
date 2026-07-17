import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtempSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ffmpegPath from 'ffmpeg-static'

/**
 * Music Center owner acceptance INSIDE the real packaged SowyVid.exe (§14),
 * through visible controls only. Bridge calls appear solely as read-only
 * assertions. Scenarios A–E: build the library, reuse one track across two
 * commercials, the manual Suno workflow, safe references, and restart.
 */
const execFileAsync = promisify(execFile)
const repoRoot = resolve(fileURLToPath(import.meta.url), '..', '..')
const packagedExe = join(repoRoot, 'release', 'win-unpacked', 'SowyVid.exe')
const FFMPEG = ffmpegPath as string
const SILENCE_THRESHOLD_DB = -55

const seamFile = join(mkdtempSync(join(tmpdir(), 'sowyvid-mcpkgseam-')), 'imports.txt')
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

async function makeSources(): Promise<{ photo: string; music: string; sunoResult: string }> {
  const dir = mkdtempSync(join(tmpdir(), 'sowyvid-mcpkgsrc-'))
  const photo = join(dir, 'tienda.png')
  const music = join(dir, 'fondo_biblioteca.mp3')
  const sunoResult = join(dir, 'suno_resultado.mp3')
  await execFileAsync(FFMPEG, ['-y', '-f', 'lavfi', '-i', 'testsrc=size=1080x1920:duration=1:rate=1', '-frames:v', '1', photo], { timeout: 60_000 })
  await execFileAsync(FFMPEG, ['-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=8', '-c:a', 'libmp3lame', music], { timeout: 60_000 })
  await execFileAsync(FFMPEG, ['-y', '-f', 'lavfi', '-i', 'sine=frequency=520:duration=8', '-c:a', 'libmp3lame', sunoResult], { timeout: 60_000 })
  return { photo, music, sunoResult }
}

async function meanDb(file: string): Promise<number> {
  const r = await execFileAsync(FFMPEG, ['-nostats', '-i', file, '-map', '0:a:0', '-af', 'volumedetect', '-f', 'null', '-'], { timeout: 120_000 }).catch((e: { stderr?: string }) => ({ stderr: e.stderr ?? '' }))
  const m = /mean_volume:\s*(-?[\d.]+|-inf)\s*dB/.exec(r.stderr ?? '')
  if (!m?.[1] || m[1] === '-inf') return -Infinity
  return Number(m[1])
}

async function createCommercial(page: Page, text: string): Promise<void> {
  await page.getByLabel('Cuéntanos qué quieres promocionar').fill(text)
  await page.getByRole('button', { name: /Continuar/ }).click()
  await expect(page.getByTestId('commercial-summary')).toBeVisible({ timeout: 60_000 })
}

async function importVisuals(page: Page): Promise<void> {
  await page.getByRole('button', { name: /Este equipo/ }).click()
  await expect(page.getByTestId('media-grid')).toBeVisible({ timeout: 180_000 })
}

async function exportAndWait(page: Page): Promise<void> {
  const download = page.getByTestId('export-download')
  await expect(download).toBeEnabled({ timeout: 60_000 })
  await download.click()
  await expect(page.getByTestId('export-completed')).toBeVisible({ timeout: 600_000 })
  await page.getByTestId('export-another').click()
  await expect(page.getByTestId('export-download')).toBeVisible({ timeout: 30_000 })
}

async function newestExportPath(page: Page, projectId: string): Promise<string | null> {
  return page.evaluate(async (id) => {
    const r = await window.sowyvid!.render.listHistory({ projectId: id })
    if (!r.ok) return null
    return r.value.filter((x) => x.status === 'completed')[0]?.outputPath ?? null
  }, projectId)
}

test('packaged Music Center: library, reuse, Suno workflow, safe references, restart', async () => {
  expect(existsSync(packagedExe), 'run `npm run package:win` first').toBe(true)
  const userData = mkdtempSync(join(tmpdir(), 'sowyvid-mcpkg-'))
  const exportDir = mkdtempSync(join(tmpdir(), 'sowyvid-mcpkgout-'))
  const { photo, music, sunoResult } = await makeSources()
  const evidence: Record<string, unknown> = {}

  // ===== A: build the library, play, edit, restart =====
  setImports([music])
  let app = await launch(userData, exportDir)
  let page = await app.firstWindow()
  expect(await app.evaluate(({ app: a }) => a.isPackaged)).toBe(true)

  await page.getByRole('button', { name: 'Música', exact: true }).click()
  await page.getByTestId('music-add').click()
  await expect(page.getByTestId('music-card')).toHaveCount(1, { timeout: 180_000 })
  const trackId = await page.evaluate(async () => {
    const r = await window.sowyvid!.music.list()
    return r.ok && r.value[0] ? r.value[0].id : ''
  })
  expect(trackId).toMatch(/^music_[a-f0-9]{64}$/)
  const analyzed = await page.evaluate(async (id) => {
    const r = await window.sowyvid!.music.get({ id })
    return r.ok && r.value ? { duration: r.value.durationSec, codec: r.value.codec } : null
  }, trackId)
  expect(analyzed?.duration).toBeGreaterThan(0)
  evidence.track = { trackId, ...analyzed }

  await page.getByTestId('music-play').click()
  await expect
    .poll(async () => {
      const txt = (await page.getByTestId('music-time').textContent()) ?? '0:00 / 0:00'
      return Number(txt.split('/')[0]!.trim().split(':')[1])
    }, { timeout: 15_000 })
    .toBeGreaterThan(0)

  await page.getByTestId('music-edit').click()
  await page.getByTestId('meta-title').fill('Mi jingle de tienda')
  await page.getByTestId('meta-license').selectOption('commercial-confirmed')
  await page.getByTestId('meta-save').click()
  await expect(page.getByTestId('music-title').first()).toContainText('Mi jingle de tienda')
  await app.close()

  app = await launch(userData, exportDir)
  page = await app.firstWindow()
  await page.getByRole('button', { name: 'Música', exact: true }).click()
  await expect(page.getByTestId('music-card')).toHaveCount(1)
  await expect(page.getByTestId('music-title').first()).toContainText('Mi jingle de tienda')

  // ===== B: reuse the SAME track across two commercials =====
  setImports([photo])
  await page.getByRole('button', { name: 'Inicio' }).click()
  await page.getByTestId('new-commercial').click()
  await createCommercial(page, 'Comercial A con música de biblioteca')
  await importVisuals(page)
  const aId = await page.evaluate(async () => {
    const r = await window.sowyvid!.projects.list()
    return r.ok ? r.value[0]!.id : ''
  })
  await page.getByRole('button', { name: 'Música', exact: true }).click()
  await page.getByTestId('music-use').click()
  await page.getByRole('button', { name: 'Inicio' }).click()
  await expect(page.getByTestId('library-music-name')).toContainText('Mi jingle de tienda')
  await expect(page.getByTestId('music-volume')).toBeEnabled()
  await exportAndWait(page)
  const aExport = (await newestExportPath(page, aId))!
  const aDb = await meanDb(aExport)
  expect(Number.isFinite(aDb) && aDb > SILENCE_THRESHOLD_DB, 'A export has no measurable music').toBe(true)

  await page.getByTestId('new-commercial').click()
  await createCommercial(page, 'Comercial B reutiliza la misma música')
  await importVisuals(page)
  const bId = await page.evaluate(async () => {
    const r = await window.sowyvid!.projects.list()
    return r.ok ? r.value[0]!.id : ''
  })
  await page.getByRole('button', { name: 'Música', exact: true }).click()
  await expect(page.getByTestId('music-card')).toHaveCount(1) // still ONE track
  await page.getByTestId('music-use').click()
  await page.getByRole('button', { name: 'Inicio' }).click()
  await exportAndWait(page)
  const bExport = (await newestExportPath(page, bId))!
  const bDb = await meanDb(bExport)
  expect(Number.isFinite(bDb) && bDb > SILENCE_THRESHOLD_DB, 'B export has no measurable music').toBe(true)

  const usage = await page.evaluate(async (id) => {
    const r = await window.sowyvid!.music.get({ id })
    return r.ok && r.value ? r.value.usageCount : -1
  }, trackId)
  expect(usage).toBe(2) // one managed file, two commercial usages
  evidence.b = { aId, bId, trackId, usageCount: usage, aExport, aMeanDb: aDb, bExport, bMeanDb: bDb }

  // ===== C: manual Suno workflow (on a fresh commercial) =====
  await page.getByRole('button', { name: 'Inicio' }).click()
  await page.getByTestId('new-commercial').click()
  await createCommercial(page, 'Comercial C para el brief de Suno')
  await page.getByRole('button', { name: 'Música', exact: true }).click()
  await page.getByTestId('music-tab-suno').click()
  await page.getByTestId('suno-generate').click()
  await expect(page.getByTestId('suno-brief')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('suno-duration')).toContainText('s')
  await expect(page.getByTestId('suno-tempo')).toContainText('BPM')
  await page.getByTestId('suno-copy').click()
  await page.getByTestId('suno-open').click()
  const sunoOpened = await app.evaluate(() => process.env.SOWYVID_E2E_SUNO_OPENED ?? '')
  expect(sunoOpened).toContain('suno.com')
  setImports([sunoResult])
  await page.getByTestId('suno-import').click()
  await expect
    .poll(async () =>
      page.evaluate(async () => {
        const r = await window.sowyvid!.music.list()
        return r.ok ? r.value.filter((t) => t.source === 'suno-manual').length : 0
      }), { timeout: 60_000 })
    .toBe(1)
  const sunoTrack = await page.evaluate(async () => {
    const r = await window.sowyvid!.music.list()
    const t = r.ok ? r.value.find((x) => x.source === 'suno-manual') : null
    return t ? { id: t.id, source: t.source, brief: t.sunoBrief } : null
  })
  expect(sunoTrack?.source).toBe('suno-manual')
  expect(sunoTrack?.brief).toBeTruthy()
  evidence.suno = { openedUrl: sunoOpened, importedTrackId: sunoTrack?.id, source: sunoTrack?.source }

  // ===== D: safe references =====
  await page.getByTestId('music-tab-library').click()
  await page.locator('[data-testid="music-card"]', { hasText: 'Mi jingle de tienda' }).getByTestId('music-delete').click()
  await expect(page.getByTestId('music-inuse-dialog')).toBeVisible()
  await expect(page.getByTestId('music-inuse-dialog')).toContainText('Comercial A')
  await expect(page.getByTestId('music-inuse-dialog')).toContainText('Comercial B')
  await page.getByTestId('music-removeall-delete').click()
  await expect(page.getByTestId('music-inuse-dialog')).toHaveCount(0)

  const afterDelete = await page.evaluate(async (ids) => {
    const list = await window.sowyvid!.music.list()
    const a = await window.sowyvid!.projects.get(ids.aId)
    const b = await window.sowyvid!.projects.get(ids.bId)
    return {
      trackIds: list.ok ? list.value.map((t) => t.id) : [],
      aTrack: a.ok && a.value ? a.value.audio.musicTrackId : 'err',
      bTrack: b.ok && b.value ? b.value.audio.musicTrackId : 'err',
    }
  }, { aId, bId })
  expect(afterDelete.trackIds).not.toContain(trackId)
  expect(afterDelete.aTrack).toBeNull()
  expect(afterDelete.bTrack).toBeNull()
  expect(existsSync(aExport), 'A export survives track deletion').toBe(true)
  expect(existsSync(bExport), 'B export survives track deletion').toBe(true)
  expect(statSync(aExport).size).toBeGreaterThan(100_000)

  // eslint-disable-next-line no-console
  console.info('\n=== PACKAGED MUSIC CENTER EVIDENCE ===\n' + JSON.stringify({ exe: packagedExe, ...evidence }, null, 2) + '\n======================================\n')
  await app.close()

  // ===== E: restart — library + metadata + selections persist =====
  app = await launch(userData, exportDir)
  page = await app.firstWindow()
  await page.getByRole('button', { name: 'Música', exact: true }).click()
  const remaining = await page.evaluate(async () => {
    const r = await window.sowyvid!.music.list()
    return r.ok ? r.value.map((t) => t.source) : []
  })
  expect(remaining).toContain('suno-manual')
  expect(remaining).not.toContain(undefined)
  expect(readdirSync(exportDir).filter((f) => f.endsWith('.mp4')).length).toBeGreaterThanOrEqual(2)
  await app.close()
})
