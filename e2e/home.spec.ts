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

  test('describe + continue generates a preview (shell simulation)', async ({ page }) => {
    await page.getByRole('heading', { name: 'Tu comercial está listo' })
    await expect(page.getByText('Aún no está listo')).toBeVisible()

    await page.getByLabel('Cuéntanos qué quieres promocionar').fill('Reparación de pantallas el mismo día')
    await page.getByRole('button', { name: /Continuar/ }).click()

    await expect(page.getByRole('button', { name: /Descargar video/ })).toBeVisible({ timeout: 5000 })
  })

  test('sidebar navigation switches sections', async ({ page }) => {
    await page.getByRole('button', { name: 'Mis comerciales' }).click()
    await expect(page.getByRole('heading', { name: 'Mis comerciales' })).toBeVisible()
  })
})
