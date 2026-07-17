import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtempSync, existsSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ffmpegPath from 'ffmpeg-static'

/**
 * Visual Text Layout Editor — packaged acceptance inside the real SowyVid.exe.
 * Drives only visible controls (drag, resize, click). Proves that the exported
 * MP4's text lands where the owner placed it in the preview, that the custom
 * position survives restart, and that resetting returns the export to the
 * automatic layout — while the Music Center, audio and library still work.
 *
 * PREVIEW/EXPORT PARITY METHOD & TOLERANCE:
 *   The edit canvas renders each text element at its canonical normalized
 *   position (no fade), so it IS the owner's preview of the layout. We compute
 *   the bright-text CENTROID (luminance-weighted) of a downscaled edit-canvas
 *   screenshot and of a decoded export frame, normalize both to [0,1], and
 *   require they agree within CENTROID_TOLERANCE = 0.12 of the frame. Both are
 *   produced from the SAME shared conversion (compositionTextElements), so this
 *   verifies — not merely trusts — that preview and export agree.
 */
const execFileAsync = promisify(execFile)
const repoRoot = resolve(fileURLToPath(import.meta.url), '..', '..')
const packagedExe = join(repoRoot, 'release', 'win-unpacked', 'SowyVid.exe')
const FFMPEG = ffmpegPath as string
const CENTROID_TOLERANCE = 0.12

async function launch(userDataDir: string, exportDir: string): Promise<ElectronApplication> {
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

/** Luminance-weighted centroid of the bright (text) pixels, normalized to [0,1]. */
function brightCentroid(rgb: Buffer, w: number, h: number): { x: number; y: number; mass: number } {
  let sx = 0
  let sy = 0
  let mass = 0
  for (let i = 0; i < w * h; i++) {
    const r = rgb[i * 3]!
    const g = rgb[i * 3 + 1]!
    const b = rgb[i * 3 + 2]!
    const luma = 0.299 * r + 0.587 * g + 0.114 * b
    if (luma < 170) continue // text is bright on the darker scene
    const px = i % w
    const py = Math.floor(i / w)
    sx += px * luma
    sy += py * luma
    mass += luma
  }
  if (mass === 0) return { x: 0.5, y: 0.5, mass: 0 }
  return { x: sx / mass / w, y: sy / mass / h, mass }
}

/** Decode any image/video frame source to a 64×48 RGB buffer and take its centroid. */
async function centroidOf(inputPath: string, atSec?: number): Promise<{ x: number; y: number; mass: number }> {
  const dir = mkdtempSync(join(tmpdir(), 'sowyvid-cen-'))
  const out = join(dir, 'f.rgb')
  const args = ['-y', ...(atSec !== undefined ? ['-ss', String(atSec)] : []), '-i', inputPath, '-frames:v', '1', '-vf', 'scale=64:48', '-pix_fmt', 'rgb24', '-f', 'rawvideo', out]
  await execFileAsync(FFMPEG, args, { timeout: 60_000 })
  const buf = readFileSync(out)
  rmSync(dir, { recursive: true, force: true })
  return brightCentroid(buf, 64, 48)
}

async function createCommercial(page: Page, text: string): Promise<void> {
  await page.getByLabel('Cuéntanos qué quieres promocionar').fill(text)
  await page.getByRole('button', { name: /Continuar/ }).click()
  await expect(page.getByTestId('commercial-summary')).toBeVisible({ timeout: 60_000 })
}

async function dragBox(page: Page, testId: string, dxFrac: number, dyFrac: number): Promise<void> {
  const canvas = (await page.getByTestId('text-canvas').boundingBox())!
  const box = (await page.getByTestId(testId).boundingBox())!
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  await page.mouse.move(cx + dxFrac * canvas.width, cy + dyFrac * canvas.height, { steps: 12 })
  await page.mouse.up()
}

async function projectId(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const r = await window.sowyvid!.projects.list()
    return r.ok ? r.value[0]!.id : ''
  })
}

async function headlineLayout(page: Page, id: string): Promise<{ x: number; y: number } | null> {
  return page.evaluate(async (pid) => {
    const p = await window.sowyvid!.projects.get(pid)
    const l = p.ok && p.value ? p.value.textLayouts.find((t) => t.role === 'headline') : null
    return l ? { x: l.x, y: l.y } : null
  }, id)
}

async function exportAndFrame(page: Page, exportDir: string): Promise<{ path: string; centroid: { x: number; y: number; mass: number } }> {
  const before = new Set(readdirSync(exportDir))
  const download = page.getByTestId('export-download')
  await expect(download).toBeEnabled({ timeout: 60_000 })
  await download.click()
  await expect(page.getByTestId('export-completed')).toBeVisible({ timeout: 600_000 })
  await page.getByTestId('export-another').click()
  const file = readdirSync(exportDir).find((f) => f.endsWith('.mp4') && !before.has(f))!
  const path = join(exportDir, file)
  // Scene 1, past the fade-in.
  const centroid = await centroidOf(path, 1.0)
  return { path, centroid }
}

test('packaged text editor: place text, preview/export parity, restart, reset', async () => {
  expect(existsSync(packagedExe), 'run `npm run package:win` first').toBe(true)
  const userData = mkdtempSync(join(tmpdir(), 'sowyvid-txtpkg-'))
  const exportDir = mkdtempSync(join(tmpdir(), 'sowyvid-txtpkgout-'))
  const evidence: Record<string, unknown> = {}

  let app = await launch(userData, exportDir)
  let page = await app.firstWindow()
  expect(await app.evaluate(({ app: a }) => a.isPackaged)).toBe(true)

  // A text-only commercial (no media) → clean bright-text detection.
  await createCommercial(page, 'Gran promocion de temporada en tu negocio local')
  const id = await projectId(page)

  // ----- Editar texto: drag the headline to a clearly higher position -----
  await page.getByTestId('edit-text').click()
  await expect(page.getByTestId('text-canvas')).toBeVisible()
  await dragBox(page, 'text-box-headline', 0, -0.42)
  await dragBox(page, 'resize-headline', 0.1, 0)
  await expect
    .poll(async () => await headlineLayout(page, id), { timeout: 5000 })
    .not.toBeNull()
  const placed = (await headlineLayout(page, id))!
  expect(placed.y).toBeLessThan(0.4) // clearly moved up from the automatic position

  // Preview = the edit canvas (canonical positions, full opacity).
  const previewShot = join(mkdtempSync(join(tmpdir(), 'sowyvid-shot-')), 'preview.png')
  await page.getByTestId('text-canvas').screenshot({ path: previewShot })
  const previewCentroid = await centroidOf(previewShot)
  expect(previewCentroid.mass, 'preview canvas shows bright text').toBeGreaterThan(0)

  await page.getByTestId('text-editor-close').click()

  // ----- Export and measure parity -----
  const customExport = await exportAndFrame(page, exportDir)
  expect(customExport.centroid.mass, 'export frame shows bright text').toBeGreaterThan(0)
  const dxy = Math.hypot(previewCentroid.x - customExport.centroid.x, previewCentroid.y - customExport.centroid.y)
  evidence.parity = { previewCentroid, exportCentroid: customExport.centroid, distance: dxy, tolerance: CENTROID_TOLERANCE }
  expect(dxy, 'preview and exported text positions agree within tolerance').toBeLessThan(CENTROID_TOLERANCE)
  const customCentroidY = customExport.centroid.y
  evidence.placed = placed

  await app.close()

  // ----- Restart: the custom position persists -----
  app = await launch(userData, exportDir)
  page = await app.firstWindow()
  await expect(page.getByTestId('commercial-summary')).toBeVisible({ timeout: 60_000 })
  const afterRestart = await headlineLayout(page, id)
  expect(afterRestart).not.toBeNull()
  expect(Math.abs(afterRestart!.x - placed.x)).toBeLessThan(0.001)
  expect(Math.abs(afterRestart!.y - placed.y)).toBeLessThan(0.001)
  evidence.afterRestart = afterRestart

  // ----- Reset the headline → export uses the automatic position -----
  await page.getByTestId('edit-text').click()
  await page.getByTestId('scene-tab-0').click()
  await page.getByTestId('text-box-headline').click()
  await page.getByTestId('ctl-reset').click()
  await expect
    .poll(async () => await headlineLayout(page, id), { timeout: 5000 })
    .toBeNull()
  await page.getByTestId('text-editor-close').click()

  const autoExport = await exportAndFrame(page, exportDir)
  // The automatic headline sits lower than where we had dragged it → the text
  // centroid moved down between the two exports.
  expect(autoExport.centroid.y, 'reset export differs from the custom export').toBeGreaterThan(customCentroidY + 0.03)
  evidence.autoCentroidY = autoExport.centroid.y

  // ----- The rest of the app still works -----
  await page.getByRole('button', { name: 'Música', exact: true }).click()
  await expect(page.getByTestId('music-library')).toBeVisible()
  await page.getByRole('button', { name: 'Mis comerciales' }).click()
  await expect(page.getByTestId('commercial-card')).toHaveCount(1)
  await page.getByRole('button', { name: 'Inicio' }).click()
  await expect(page.getByTestId('audio-section')).toBeVisible({ timeout: 30_000 })

  // eslint-disable-next-line no-console
  console.info('\n=== PACKAGED TEXT EDITOR EVIDENCE ===\n' + JSON.stringify({ exe: packagedExe, ...evidence }, null, 2) + '\n=====================================\n')
  await app.close()
})
