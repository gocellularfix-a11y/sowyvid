import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test'
import { mkdtempSync, existsSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Real-Electron MediaVault test (Section 7). Imports a genuine file through the
 * actual preload → IPC → MediaVault → managed storage → SQLite path, then
 * restarts the app and confirms the managed media persists.
 */

const repoRoot = resolve(fileURLToPath(import.meta.url), '..', '..')
const mainEntry = join(repoRoot, 'out', 'main', 'index.js')
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)

async function launch(userDataDir: string): Promise<ElectronApplication> {
  return electron.launch({
    args: [mainEntry],
    env: { ...process.env, SOWYVID_USER_DATA: userDataDir },
  })
}

test('managed media import persists across a real Electron restart', async () => {
  expect(existsSync(mainEntry), 'run `npm run build` first').toBe(true)
  const userData = mkdtempSync(join(tmpdir(), 'sowyvid-media-e2e-'))
  const sourcePng = join(mkdtempSync(join(tmpdir(), 'sowyvid-src-')), 'foto.png')
  writeFileSync(sourcePng, PNG_1x1)

  // ---- Session 1: import through real IPC ----
  const app1 = await launch(userData)
  const win1 = await app1.firstWindow()
  const imported = await win1.evaluate(async (pngPath) => {
    const bridge = window.sowyvid
    if (!bridge) throw new Error('preload bridge missing')
    const created = await bridge.projects.create({
      name: 'Media E2E',
      brief: { productOrService: 'reparación de pantallas' },
    })
    if (!created.ok) throw new Error('create failed')
    const projectId = created.value.id
    const result = await bridge.media.import({ projectId, paths: [pngPath] })
    if (!result.ok) throw new Error('import failed')
    return {
      projectId,
      status: result.value.outcomes[0]?.status,
      media: result.value.project.media,
    }
  }, sourcePng)

  expect(imported.status).toBe('imported')
  expect(imported.media).toHaveLength(1)
  const asset = imported.media[0]!
  expect(asset.id).toMatch(/^media_[a-f0-9]{64}$/)
  expect(asset.relPath).toMatch(/^media\/files\//)
  await app1.close()

  // Managed copy exists under the project's app-data folder (not the source).
  const hash = asset.id.replace('media_', '')
  const managed = join(userData, 'projects', imported.projectId, 'media', 'files', `${hash}.png`)
  expect(existsSync(managed)).toBe(true)

  // ---- Session 2: relaunch, confirm the media persisted ----
  const app2 = await launch(userData)
  const win2 = await app2.firstWindow()
  const reopened = await win2.evaluate(async (projectId) => {
    const bridge = window.sowyvid
    if (!bridge) throw new Error('preload bridge missing')
    const got = await bridge.projects.get(projectId)
    if (!got.ok) throw new Error('reopen failed')
    return got.value?.media ?? []
  }, imported.projectId)

  expect(reopened).toHaveLength(1)
  expect(reopened[0]?.id).toBe(asset.id)
  await app2.close()
})
