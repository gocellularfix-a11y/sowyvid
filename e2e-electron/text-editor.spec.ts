import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtempSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Visual Text Layout Editor — owner-path acceptance in the REAL Electron app.
 * Every edit is a VISIBLE action (click, drag, keyboard); the only bridge calls
 * are read-only assertions on the persisted layout. Scenarios A–E from §13.
 */
const repoRoot = resolve(fileURLToPath(import.meta.url), '..', '..')
const mainEntry = join(repoRoot, 'out', 'main', 'index.js')

test.setTimeout(300_000)

async function launch(userDataDir: string): Promise<ElectronApplication> {
  return electron.launch({
    args: [mainEntry],
    env: { ...process.env, SOWYVID_USER_DATA: userDataDir, SOWYVID_E2E_SUPPRESS_OPEN: '1' },
  })
}

async function createCommercial(page: Page, text: string): Promise<void> {
  await page.getByLabel('Cuéntanos qué quieres promocionar').fill(text)
  await page.getByRole('button', { name: /Continuar/ }).click()
  await expect(page.getByTestId('commercial-summary')).toBeVisible({ timeout: 30_000 })
}

/** Drag an element by a normalized fraction of the edit canvas. */
async function dragBox(page: Page, testId: string, dxFrac: number, dyFrac: number): Promise<void> {
  const canvas = (await page.getByTestId('text-canvas').boundingBox())!
  const box = (await page.getByTestId(testId).boundingBox())!
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  await page.mouse.move(cx + dxFrac * canvas.width, cy + dyFrac * canvas.height, { steps: 10 })
  await page.mouse.up()
}

async function currentProjectId(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const r = await window.sowyvid!.projects.list()
    return r.ok ? r.value[0]!.id : ''
  })
}

type Layout = { sceneId: string; role: string; x: number; y: number; alignment: string; width: number }
async function layouts(page: Page, projectId: string): Promise<Layout[]> {
  return page.evaluate(async (id) => {
    const p = await window.sowyvid!.projects.get(id)
    return p.ok && p.value ? p.value.textLayouts : []
  }, projectId)
}

/** Persistence is debounced; wait until an override matching `pred` is durable. */
async function waitForLayout(page: Page, projectId: string, pred: (l: Layout) => boolean): Promise<void> {
  await expect.poll(async () => (await layouts(page, projectId)).some(pred), { timeout: 5000 }).toBe(true)
}

test('text editor: move, per-scene, persist, reset, copy — visible controls only', async () => {
  expect(existsSync(mainEntry), 'run `npm run build` first').toBe(true)
  const userData = mkdtempSync(join(tmpdir(), 'sowyvid-txt-'))

  let app = await launch(userData)
  let page = await app.firstWindow()

  // ===== Scenario A: move / resize / align the headline =====
  await createCommercial(page, 'Promoción para editar el texto del comercial')
  const projectId = await currentProjectId(page)

  await expect(page.getByTestId('edit-text')).toBeVisible({ timeout: 30_000 })
  await page.getByTestId('edit-text').click()
  await expect(page.getByTestId('text-editor')).toBeVisible()
  await expect(page.getByTestId('text-box-headline')).toBeVisible()

  // Drag the headline up-left.
  await dragBox(page, 'text-box-headline', -0.15, -0.25)
  await expect(page.getByTestId('selected-label')).toContainText('Título')

  await waitForLayout(page, projectId, (l) => l.role === 'headline')
  const head = (await layouts(page, projectId)).find((l) => l.role === 'headline')!
  const movedX = head.x
  const movedY = head.y

  // Resize narrower/wider via the visible handle, then change alignment.
  await dragBox(page, 'resize-headline', 0.12, 0)
  await page.getByTestId('align-left').click()
  await expect
    .poll(async () => (await layouts(page, projectId)).find((l) => l.role === 'headline')?.alignment)
    .toBe('left')

  await page.getByTestId('text-editor-close').click()
  // Exiting returns to the live preview, which now reflects the custom layout.
  await expect(page.getByTestId('preview-player')).toBeVisible()

  // ===== Scenario B: per-scene layouts are independent =====
  await page.getByTestId('edit-text').click()
  // Move the headline in scene 2 to a different place.
  await page.getByTestId('scene-tab-1').click()
  await expect(page.getByTestId('text-box-headline')).toBeVisible()
  await dragBox(page, 'text-box-headline', 0.18, 0.28)
  // Two independent headline overrides now exist (scene 1 + scene 2).
  await expect
    .poll(async () => new Set((await layouts(page, projectId)).filter((l) => l.role === 'headline').map((l) => l.sceneId)).size, { timeout: 5000 })
    .toBeGreaterThanOrEqual(2)
  // Scene 1's headline kept its original custom position.
  const s1 = (await layouts(page, projectId)).find((l) => l.role === 'headline' && Math.abs(l.x - movedX) < 0.001 && Math.abs(l.y - movedY) < 0.001)
  expect(s1, 'scene 1 headline kept its original custom position').toBeTruthy()
  await page.getByTestId('text-editor-close').click()
  await app.close()

  // ===== Scenario C: persistence across restart =====
  app = await launch(userData)
  page = await app.firstWindow()
  await expect(page.getByTestId('commercial-summary')).toBeVisible({ timeout: 30_000 })
  const afterRestart = await layouts(page, projectId)
  expect(afterRestart.filter((l) => l.role === 'headline').length).toBeGreaterThanOrEqual(2)
  const restoredHead = afterRestart.find((l) => Math.abs(l.x - movedX) < 0.001 && Math.abs(l.y - movedY) < 0.001)
  expect(restoredHead, 'the custom headline survived restart').toBeTruthy()
  expect(restoredHead!.alignment).toBe('left')

  // ===== Scenario D: reset one element only =====
  await page.getByTestId('edit-text').click()
  await page.getByTestId('scene-tab-0').click()
  await page.getByTestId('text-box-headline').click() // select without moving
  await expect(page.getByTestId('selected-label')).toContainText('Título')
  const beforeReset = await layouts(page, projectId)
  await page.getByTestId('ctl-reset').click()
  await expect
    .poll(async () => (await layouts(page, projectId)).filter((l) => l.sceneId === restoredHead!.sceneId && l.role === 'headline').length)
    .toBe(0)
  // Other scene's override remains.
  const afterReset = await layouts(page, projectId)
  expect(afterReset.length).toBe(beforeReset.length - 1)

  // ===== Scenario E: copy a layout to all scenes (layout only, not text) =====
  // Re-move scene 1 headline, then copy its position to every scene.
  const headCountAfterReset = (await layouts(page, projectId)).filter((l) => l.role === 'headline').length
  await page.getByTestId('text-box-headline').click()
  await dragBox(page, 'text-box-headline', 0.12, -0.18)
  await expect
    .poll(async () => (await layouts(page, projectId)).filter((l) => l.role === 'headline').length, { timeout: 5000 })
    .toBeGreaterThan(headCountAfterReset)
  const total = await sceneCount(page)
  await page.getByTestId('ctl-copy').click()
  await page.getByTestId('copy-all').click()
  // Every scene now has a headline override at ONE copied position (text unchanged).
  await expect
    .poll(async () => (await layouts(page, projectId)).filter((l) => l.role === 'headline').length, { timeout: 5000 })
    .toBe(total)
  const headOverrides = (await layouts(page, projectId)).filter((l) => l.role === 'headline')
  const positions = new Set(headOverrides.map((l) => `${l.x.toFixed(3)},${l.y.toFixed(3)}`))
  expect(positions.size, 'copy placed the same position in every scene').toBe(1)
  await page.getByTestId('text-editor-close').click()

  await app.close()
})

async function sceneCount(page: Page): Promise<number> {
  return page.getByTestId('scene-nav').getByRole('button').count()
}
