import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtempSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Commercial Prompter (Phase A) packaged acceptance inside the real SowyVid.exe.
 * Visible controls only; deterministic (no AI, no network). Verifies items 1,
 * 3, 5, 6, 7, 9, 10 of the packaged owner acceptance and that the existing
 * Music Center / commercial-library workflows remain operational.
 */
const repoRoot = resolve(fileURLToPath(import.meta.url), '..', '..')
const packagedExe = join(repoRoot, 'release', 'win-unpacked', 'SowyVid.exe')
const FULL = 'Quiero promocionar un Samsung A16 nuevo de 128 GB por $179. Incluye case y vidrio. Disponible hoy en Go Cellular.'

async function launch(userDataDir: string): Promise<ElectronApplication> {
  return electron.launch({
    executablePath: packagedExe,
    args: [],
    env: { ...process.env, SOWYVID_E2E_USER_DATA: userDataDir, SOWYVID_E2E_SUPPRESS_OPEN: '1' },
  })
}

async function firstPlan(page: Page): Promise<{ product: string; price: string | null; scenes: number; generatedBy: string } | null> {
  return page.evaluate(async () => {
    const r = await window.sowyvid!.projects.list()
    const plan = r.ok ? r.value[0]?.commercialPlan : null
    if (!plan) return null
    return {
      product: plan.product.displayName,
      price: plan.knownFacts.find((f) => f.key === 'price')?.value ?? null,
      scenes: plan.narrationScenes.length,
      generatedBy: plan.generatedBy,
    }
  })
}

test('packaged commercial assistant: deterministic plan, privacy, regen, create, restart', async () => {
  expect(existsSync(packagedExe), 'run `npm run package:win` first').toBe(true)
  const userData = mkdtempSync(join(tmpdir(), 'sowyvid-asstpkg-'))
  const evidence: Record<string, unknown> = {}

  let app = await launch(userData)
  let page = await app.firstWindow()
  expect(await app.evaluate(({ app: a }) => a.isPackaged)).toBe(true)

  // (1,10) Deterministic creation without AI.
  await page.getByRole('button', { name: 'Asistente' }).click()
  await page.getByRole('textbox', { name: 'Asistente de comerciales' }).fill(FULL)
  await page.getByTestId('assistant-analyze').click()
  await expect(page.getByTestId('assistant-product')).toHaveText('Samsung A16')
  await expect(page.getByTestId('fact-price')).toHaveValue('$179')
  await expect(page.getByTestId('narration-offer')).toHaveValue(/\$179/)
  const hookBefore = await page.getByTestId('narration-hook').inputValue()

  // (5,6) Fact correction → partial regeneration (offer changes, hook does not).
  await page.getByTestId('fact-price').fill('$209')
  await expect(page.getByTestId('narration-offer')).toHaveValue(/\$209/)
  expect(await page.getByTestId('narration-hook').inputValue()).toBe(hookBefore)

  // (3) Privacy preview: text only, AI not configured.
  await page.getByTestId('assistant-ai').click()
  const privacy = await page.getByTestId('ai-privacy-content').textContent()
  expect(privacy).toContain('Precio: $209')
  expect(privacy).not.toMatch(/media|relPath|C:\\\\|apiKey/i)
  await expect(page.getByTestId('ai-not-configured')).toBeVisible()
  await expect(page.getByTestId('ai-continue')).toBeDisabled()
  await page.getByTestId('ai-use-without').click()

  // (7) Apply → create the commercial.
  await page.getByTestId('assistant-create').click()
  await expect(page.getByTestId('current-commercial')).toBeVisible({ timeout: 60_000 })
  const created = await firstPlan(page)
  expect(created?.product).toBe('Samsung A16')
  expect(created?.price).toBe('$209')
  expect(created?.generatedBy).toBe('deterministic')
  expect(created?.scenes).toBeGreaterThanOrEqual(6)
  evidence.created = created

  // (23) Existing workflows still operational.
  await page.getByRole('button', { name: 'Música', exact: true }).click()
  await expect(page.getByTestId('music-library')).toBeVisible()
  await page.getByRole('button', { name: 'Mis comerciales' }).click()
  await expect(page.getByTestId('commercial-card')).toHaveCount(1)
  await app.close()

  // (9) Restart: the accepted plan persists.
  app = await launch(userData)
  page = await app.firstWindow()
  await expect(page.getByTestId('current-commercial')).toBeVisible({ timeout: 60_000 })
  const afterRestart = await firstPlan(page)
  expect(afterRestart?.product).toBe('Samsung A16')
  expect(afterRestart?.price).toBe('$209')
  evidence.afterRestart = afterRestart

  // eslint-disable-next-line no-console
  console.info('\n=== PACKAGED ASSISTANT EVIDENCE ===\n' + JSON.stringify({ exe: packagedExe, ...evidence }, null, 2) + '\n===================================\n')
  await app.close()
})
