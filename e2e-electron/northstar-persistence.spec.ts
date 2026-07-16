import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test'
import { mkdtempSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import initSqlJs from 'sql.js'

/**
 * Real-Electron integration test (Section 1). Exercises the ACTUAL preload
 * bridge, IPC handlers, Northstar service, and SQLite persistence — then a real
 * process restart against the same user-data directory. "Launched without
 * crashing" is explicitly NOT accepted as evidence.
 */

const repoRoot = resolve(fileURLToPath(import.meta.url), '..', '..')
const mainEntry = join(repoRoot, 'out', 'main', 'index.js')

async function launch(userDataDir: string): Promise<ElectronApplication> {
  return electron.launch({
    args: [mainEntry],
    env: { ...process.env, SOWYVID_USER_DATA: userDataDir },
  })
}

test('Northstar selection persists across a real Electron restart', async () => {
  expect(existsSync(mainEntry), 'build output missing — run `npm run build` first').toBe(true)
  const userData = mkdtempSync(join(tmpdir(), 'sowyvid-e2e-'))

  // ---- Session 1: create → develop → compile through real preload + IPC ----
  const app1 = await launch(userData)
  const win1 = await app1.firstWindow()
  const first = await win1.evaluate(async () => {
    const bridge = window.sowyvid
    if (!bridge) throw new Error('preload bridge missing')
    const created = await bridge.projects.create({
      name: 'E2E Persistencia',
      brief: { productOrService: 'reparación de pantallas el mismo día' },
    })
    if (!created.ok) throw new Error('project create failed')
    const projectId = created.value.id

    const concepts = await bridge.engine.developConcepts({ projectId, count: 3 })
    if (!concepts.ok || concepts.value.length === 0) throw new Error('developConcepts failed')

    const compiled = await bridge.engine.compile({
      projectId,
      conceptId: concepts.value[0]!.conceptId,
    })
    if (!compiled.ok) throw new Error('compile failed')

    const reread = await bridge.projects.get(projectId)
    if (!reread.ok || !reread.value) throw new Error('project get failed')
    return { projectId, selection: reread.value.creative }
  })

  // Step 5 — the persisted selection carries the full reproducibility record.
  expect(first.selection).not.toBeNull()
  const selection = first.selection!
  expect(selection.engineName).toBe('@jorge-engines/northstar-creative')
  expect(selection.engineVersion.length).toBeGreaterThan(0)
  expect(selection.family.length).toBeGreaterThan(0)
  expect(selection.variantId.length).toBeGreaterThan(0)
  expect(selection.conceptId.length).toBeGreaterThan(0)
  expect(selection.seed.length).toBeGreaterThan(0)
  expect(selection.inputFingerprint.length).toBeGreaterThan(0)

  await app1.close() // Step 6 — clean shutdown.

  // ---- Session 2: relaunch same user-data dir, reload from SQLite ----
  const app2 = await launch(userData)
  const win2 = await app2.firstWindow()
  const reopened = await win2.evaluate(async (projectId) => {
    const bridge = window.sowyvid
    if (!bridge) throw new Error('preload bridge missing')
    const got = await bridge.projects.get(projectId)
    if (!got.ok) throw new Error('reopen get failed')
    return got.value?.creative ?? null
  }, first.projectId)

  // Step 9 — the persisted creative selection matches exactly.
  expect(reopened).toEqual(selection)
  await app2.close()

  // ---- Direct SQLite verification (steps 10–11) ----
  const dbPath = join(userData, 'database', 'sowyvid.db')
  expect(existsSync(dbPath)).toBe(true)
  const SQL = await initSqlJs({
    locateFile: () => resolve(repoRoot, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'),
  })
  const db = new SQL.Database(new Uint8Array(readFileSync(dbPath)))
  try {
    // Step 10 — the creative-selection migration (v2) is applied. Later
    // migrations may exist on top of it; asserting an exact number here made
    // this test break every time an unrelated migration landed.
    const version = db.exec('SELECT MAX(version) AS v FROM schema_migrations')
    expect(Number(version[0]?.values[0]?.[0])).toBeGreaterThanOrEqual(2)

    const columns = (db.exec('PRAGMA table_info(projects)')[0]?.values ?? []).map((row) => row[1])
    expect(columns).toContain('concept_id') // Step 11
    expect(columns).toContain('seed')

    const persisted = db.exec('SELECT concept_id, seed FROM projects WHERE id = ?', [
      first.projectId,
    ])
    expect(persisted[0]?.values[0]?.[0]).toBe(selection.conceptId)
    expect(persisted[0]?.values[0]?.[1]).toBe(selection.seed)
  } finally {
    db.close()
  }
})
