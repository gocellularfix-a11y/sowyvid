import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test'
import { mkdtempSync, existsSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Real-Electron preview test (Section 10–11). Imports a real image through IPC,
 * compiles a commercial (Northstar → FrameLogic VisualPlan), and verifies the
 * controlled media protocol serves the imported asset to the renderer (which is
 * exactly how the Remotion <Player> loads it) — while rejecting invalid IDs.
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

test('imported media loads via the controlled protocol; the visual plan is real', async () => {
  expect(existsSync(mainEntry), 'run `npm run build` first').toBe(true)
  const userData = mkdtempSync(join(tmpdir(), 'sowyvid-preview-'))
  const src = join(mkdtempSync(join(tmpdir(), 'sowyvid-psrc-')), 'photo.png')
  writeFileSync(src, PNG_1x1)

  const app = await launch(userData)
  const win = await app.firstWindow()

  const out = await win.evaluate(async (pngPath) => {
    const bridge = window.sowyvid
    if (!bridge) throw new Error('preload bridge missing')
    const created = await bridge.projects.create({
      name: 'Preview',
      brief: { productOrService: 'reparación de pantallas' },
    })
    if (!created.ok) throw new Error('create failed')
    const projectId = created.value.id

    const imported = await bridge.media.import({ projectId, paths: [pngPath] })
    if (!imported.ok) throw new Error('import failed')
    const asset = imported.value.project.media[0]
    if (!asset) throw new Error('no asset')

    const concepts = await bridge.engine.developConcepts({ projectId, count: 1 })
    if (!concepts.ok) throw new Error('develop failed')
    const compiled = await bridge.engine.compile({
      projectId,
      conceptId: concepts.value[0]!.conceptId,
    })
    if (!compiled.ok) throw new Error('compile failed')

    // Fetch the imported asset through the controlled protocol (as the Player does).
    const goodUrl = `sowyvid-media://asset/${projectId}/${asset.id}/original`
    const good = await fetch(goodUrl)

    // Invalid / unknown id must be rejected.
    const badUrl = `sowyvid-media://asset/${projectId}/media_${'0'.repeat(64)}/original`
    const bad = await fetch(badUrl).then((r) => r.status).catch(() => 0)

    return {
      assetId: asset.id,
      goodOk: good.ok,
      goodStatus: good.status,
      badStatus: bad,
      sceneCount: compiled.value.visualPlan.scenes.length,
      finalRole: compiled.value.visualPlan.scenes[compiled.value.visualPlan.scenes.length - 1]?.role,
      visualEngine: compiled.value.visualPlan.visualEngineName,
    }
  }, src)

  expect(out.assetId).toMatch(/^media_[a-f0-9]{64}$/)
  expect(out.goodOk).toBe(true)
  expect(out.goodStatus).toBe(200)
  expect(out.badStatus).toBe(404)
  expect(out.sceneCount).toBeGreaterThan(0)
  expect(out.finalRole).toBe('cta')
  expect(out.visualEngine).toContain('framelogic')

  await app.close()
})
