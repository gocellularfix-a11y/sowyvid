import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtempSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Commercial Prompter (Phase A) owner acceptance in the REAL Electron app,
 * visible controls only. Deterministic — no AI, no network. The only bridge
 * calls are read-only assertions on the persisted plan.
 */
const repoRoot = resolve(fileURLToPath(import.meta.url), '..', '..')
const mainEntry = join(repoRoot, 'out', 'main', 'index.js')
const FULL = 'Quiero promocionar un Samsung A16 nuevo de 128 GB por $179. Incluye case y vidrio. Disponible hoy en Go Cellular.'

test.setTimeout(300_000)

async function launch(userDataDir: string): Promise<ElectronApplication> {
  return electron.launch({ args: [mainEntry], env: { ...process.env, SOWYVID_USER_DATA: userDataDir, SOWYVID_E2E_SUPPRESS_OPEN: '1' } })
}

async function firstProjectPlan(page: Page): Promise<{ product: string; price: string | null; scenes: number } | null> {
  return page.evaluate(async () => {
    const r = await window.sowyvid!.projects.list()
    const p = r.ok ? r.value[0] : null
    const plan = p?.commercialPlan
    if (!plan) return null
    return {
      product: plan.product.displayName,
      price: plan.knownFacts.find((f) => f.key === 'price')?.value ?? null,
      scenes: plan.narrationScenes.length,
    }
  })
}

test('commercial assistant: analyze, fact-correct, privacy preview, create, persist', async () => {
  expect(existsSync(mainEntry), 'run `npm run build` first').toBe(true)
  const userData = mkdtempSync(join(tmpdir(), 'sowyvid-asst-'))

  let app = await launch(userData)
  let page = await app.firstWindow()

  // ----- Vague request stays fact-safe -----
  await page.getByRole('button', { name: 'Asistente' }).click()
  await page.getByRole('textbox', { name: 'Asistente de comerciales' }).fill('Quiero promocionar un Samsung A16.')
  await page.getByTestId('assistant-analyze').click()
  await expect(page.getByTestId('assistant-plan')).toBeVisible()
  await expect(page.getByTestId('assistant-product')).toHaveText('Samsung A16')
  // No invented specs / price in the narration.
  const vagueNarration = await page.getByTestId('assistant-plan').textContent()
  expect(vagueNarration).not.toMatch(/mAh|megapixel|\$\d/i)
  await expect(page.getByTestId('assistant-warnings')).toContainText(/precio/i)

  // ----- Complete request preserves facts -----
  await page.getByRole('textbox', { name: 'Asistente de comerciales' }).fill(FULL)
  await page.getByTestId('assistant-analyze').click()
  await expect(page.getByTestId('fact-price')).toHaveValue('$179')
  await expect(page.getByTestId('narration-offer')).toHaveValue(/\$179/)
  const hookBefore = await page.getByTestId('narration-hook').inputValue()

  // ----- Fact correction → partial regeneration -----
  await page.getByTestId('fact-price').fill('$199')
  await expect(page.getByTestId('narration-offer')).toHaveValue(/\$199/)
  // The hook did not change.
  expect(await page.getByTestId('narration-hook').inputValue()).toBe(hookBefore)

  // ----- Privacy preview: text only, AI not configured -----
  await page.getByTestId('assistant-ai').click()
  await expect(page.getByTestId('ai-privacy-dialog')).toBeVisible()
  const privacy = await page.getByTestId('ai-privacy-content').textContent()
  expect(privacy).toContain('Precio: $199')
  expect(privacy).not.toMatch(/media|relPath|C:\\\\|apiKey/i)
  await expect(page.getByTestId('ai-not-configured')).toBeVisible()
  await expect(page.getByTestId('ai-continue')).toBeDisabled()
  await page.getByTestId('ai-use-without').click()
  await expect(page.getByTestId('ai-privacy-dialog')).toHaveCount(0)

  // ----- Create the commercial from the plan -----
  await page.getByTestId('assistant-create').click()
  await expect(page.getByTestId('current-commercial')).toBeVisible({ timeout: 30_000 })
  const created = await firstProjectPlan(page)
  expect(created?.product).toBe('Samsung A16')
  expect(created?.price).toBe('$199')
  expect(created?.scenes).toBeGreaterThanOrEqual(6)
  await app.close()

  // ----- Restart: the accepted plan persists -----
  app = await launch(userData)
  page = await app.firstWindow()
  await expect(page.getByTestId('current-commercial')).toBeVisible({ timeout: 30_000 })
  const afterRestart = await firstProjectPlan(page)
  expect(afterRestart?.product).toBe('Samsung A16')
  expect(afterRestart?.price).toBe('$199')
  await app.close()
})
