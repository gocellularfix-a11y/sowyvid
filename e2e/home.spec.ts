import { test, expect } from '@playwright/test'

/**
 * Smoke test for the SowyVid interface shell, driven against the standalone
 * renderer (Vite) in plain-browser preview mode. This verifies the mockup's
 * primary regions render and the core guided-flow interactions work without
 * booting the Electron main process.
 */
test.describe('SowyVid home', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('renders the four guided steps and trust bar', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Cuéntanos qué quieres promocionar' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Agrega tu material' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Elige tu estilo' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Tu comercial está listo' })).toBeVisible()
    await expect(page.getByText('Hecho con tu material')).toBeVisible()
    await expect(page.getByText('Sin experiencia necesaria')).toBeVisible()
  })

  test('style selection is a working radio group', async ({ page }) => {
    const trust = page.getByRole('radio', { name: /Confianza y calidad/ })
    await trust.click()
    await expect(trust).toHaveAttribute('aria-checked', 'true')
  })

  test('describe + continue drives the real creative engine end-to-end', async ({ page }) => {
    await page.getByRole('heading', { name: 'Tu comercial está listo' })
    await expect(page.getByText('Aún no está listo')).toBeVisible()

    await page.getByLabel('Cuéntanos qué quieres promocionar').fill('Reparación de pantallas el mismo día')
    await page.getByRole('button', { name: /Continuar/ }).click()

    // The engine (Northstar) actually ran: a compiled plan summary is shown.
    const summary = page.getByTestId('commercial-summary')
    await expect(summary).toBeVisible({ timeout: 5000 })
    await expect(summary).toHaveText(/\d+ escenas · \d+s/)
    // A real Remotion <Player> preview mounts (FrameLogic visual plan).
    await expect(page.getByTestId('preview-player')).toBeVisible()
    await expect(page.getByRole('button', { name: /Descargar video/ })).toBeVisible()
  })

  test('the preview exposes real audio controls without crushing the player', async ({ page }) => {
    await page.getByLabel('Cuéntanos qué quieres promocionar').fill('Reparación de pantallas el mismo día')
    await page.getByRole('button', { name: /Continuar/ }).click()
    await expect(page.getByTestId('commercial-summary')).toBeVisible({ timeout: 5000 })

    await expect(page.getByTestId('audio-controls')).toBeVisible()
    await expect(page.getByTestId('master-volume')).toBeVisible()
    await expect(page.getByTestId('source-audio-toggle')).toBeVisible()

    // Regression guard: the step column is a flex column, so adding controls
    // beside the player once shrank it to zero height. The player must keep a
    // real box.
    const box = await page.getByTestId('preview-player').boundingBox()
    expect(box).not.toBeNull()
    expect(box!.height).toBeGreaterThan(100)

    // This project has no music selected, so nothing is missing and no warning shows.
    await expect(page.getByTestId('audio-warning')).toHaveCount(0)
  })

  test('sidebar navigation switches sections', async ({ page }) => {
    await page.getByRole('button', { name: 'Mis comerciales' }).click()
    await expect(page.getByRole('heading', { name: 'Mis comerciales' })).toBeVisible()
  })
})
