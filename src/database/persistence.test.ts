import { describe, it, expect, beforeEach } from 'vitest'
import { createSqlJsDatabase } from './sqljs'
import { runMigrations, currentSchemaVersion, MIGRATIONS } from './migrations'
import { ProjectRepository } from './projectRepository'
import { resolveWasmPath } from './index'
import type { Database } from './port'

const wasmPath = resolveWasmPath()

async function freshDb(bytes?: Uint8Array): Promise<Database> {
  const db = await createSqlJsDatabase({ wasmPath, initialBytes: bytes })
  runMigrations(db)
  return db
}

describe('migrations', () => {
  it('applies to the latest version and are idempotent', async () => {
    const db = await freshDb()
    // Track the migration list itself, so adding a migration cannot silently
    // leave this test asserting an old version.
    const latest = MIGRATIONS[MIGRATIONS.length - 1]!.version
    expect(currentSchemaVersion(db)).toBe(latest)
    // Running again must not error or duplicate.
    const applied = runMigrations(db)
    expect(applied).toBe(latest)
    expect(currentSchemaVersion(db)).toBe(latest)
  })
})

describe('ProjectRepository', () => {
  let db: Database
  let repo: ProjectRepository

  beforeEach(async () => {
    db = await freshDb()
    repo = new ProjectRepository(db)
  })

  it('creates and reads a project with defaults', () => {
    const project = repo.create({ name: 'Mi comercial' })
    expect(project.id).toMatch(/^proj_/)
    expect(project.status).toBe('draft')
    expect(project.video.aspectRatio).toBe('9:16')

    const loaded = repo.get(project.id)
    expect(loaded).toEqual(project)
  })

  it('lists projects newest-first', () => {
    const a = repo.create({ name: 'A' })
    const b = repo.create({ name: 'B' })
    const saved = repo.save({ ...a, name: 'A updated' })
    const list = repo.list()
    expect(list.map((p) => p.id)).toContain(b.id)
    expect(list.map((p) => p.id)).toContain(saved.id)
    expect(list[0]?.id).toBe(saved.id) // most recently updated first
  })

  it('saves edits and preserves createdAt', () => {
    const project = repo.create({ name: 'Original' })
    const edited = repo.save({
      ...project,
      name: 'Editado',
      brief: { ...project.brief, offer: '2x1' },
    })
    expect(edited.createdAt).toBe(project.createdAt)
    const loaded = repo.get(project.id)
    expect(loaded?.name).toBe('Editado')
    expect(loaded?.brief.offer).toBe('2x1')
  })

  it('deletes a project and cascades versions', () => {
    const project = repo.create({ name: 'Temp' })
    repo.saveVersion(project.id, 'v1')
    expect(repo.listVersions(project.id).length).toBe(1)
    expect(repo.delete(project.id)).toBe(true)
    expect(repo.get(project.id)).toBeUndefined()
    expect(repo.listVersions(project.id).length).toBe(0)
  })

  it('records and restores version history', () => {
    const project = repo.create({ name: 'Con historial' })
    repo.save({ ...project, name: 'V1' })
    const versioned = repo.get(project.id)!
    const version = repo.saveVersion(project.id, 'antes de regenerar')
    repo.save({ ...versioned, name: 'V2 (regenerado)' })
    expect(repo.get(project.id)?.name).toBe('V2 (regenerado)')

    const restored = repo.restoreVersion(version.id)
    expect(restored.name).toBe('V1')
    expect(repo.get(project.id)?.name).toBe('V1')
  })

  it('tracks the full export lifecycle: begin → complete', () => {
    const project = repo.create({ name: 'Exportado' })
    const started = repo.beginExport({
      projectId: project.id,
      preset: 'instagram-reel',
      outputPath: 'C:\\Users\\owner\\Videos\\comercial.mp4',
      fingerprint: 'fp_abc',
    })
    expect(started.status).toBe('rendering')
    expect(started.completedAt).toBeNull()

    const done = repo.completeExport(started.id, {
      width: 1080,
      height: 1920,
      fps: 30,
      durationSec: 20,
      bytes: 4_500_000,
      videoCodec: 'h264',
      audioCodec: 'aac',
      fingerprint: 'fp_abc',
      outputPath: 'C:\\Users\\owner\\Videos\\comercial.mp4',
    })
    expect(done?.status).toBe('completed')
    expect(done?.completedAt).not.toBeNull()
    expect(done?.videoCodec).toBe('h264')
    expect(done?.audioCodec).toBe('aac')
    expect(done?.fingerprint).toBe('fp_abc')
    expect(done?.bytes).toBe(4_500_000)

    const exports = repo.listExports(project.id)
    expect(exports.length).toBe(1)
    expect(exports[0]?.outputPath).toBe('C:\\Users\\owner\\Videos\\comercial.mp4')
  })

  it('records failures and cancellations with stable diagnostic codes', () => {
    const project = repo.create({ name: 'Fallido' })
    const a = repo.beginExport({ projectId: project.id, preset: 'tiktok', outputPath: 'X:\\out.mp4', fingerprint: null })
    const failed = repo.failExport(a.id, 'output-unavailable')
    expect(failed?.status).toBe('failed')
    expect(failed?.failureCode).toBe('output-unavailable')

    const b = repo.beginExport({ projectId: project.id, preset: 'tiktok', outputPath: 'C:\\out.mp4', fingerprint: null })
    const canceled = repo.failExport(b.id, 'canceled')
    expect(canceled?.status).toBe('canceled')
    // Both attempts stay in history — it tells the truth, not just successes.
    expect(repo.listExports(project.id).length).toBe(2)
  })

  it('repairs phantom in-progress jobs on startup (app died mid-render)', () => {
    const project = repo.create({ name: 'Interrumpido' })
    repo.beginExport({ projectId: project.id, preset: 'youtube', outputPath: 'C:\\out.mp4', fingerprint: null })
    const repaired = repo.markInterruptedExports()
    expect(repaired).toBe(1)
    const [record] = repo.listExports(project.id)
    expect(record?.status).toBe('failed')
    expect(record?.failureCode).toBe('interrupted')
    // Idempotent: a second pass finds nothing.
    expect(repo.markInterruptedExports()).toBe(0)
  })
})

describe('persistence across restart', () => {
  it('a project survives export → reimport (simulated restart)', async () => {
    const db1 = await freshDb()
    const repo1 = new ProjectRepository(db1)
    const created = repo1.create({ name: 'Persistente' })
    const withHistory = repo1.save({ ...created, name: 'Persistente v2' })
    const started = repo1.beginExport({
      projectId: created.id,
      preset: 'tiktok',
      outputPath: 'C:\\Users\\owner\\Videos\\a.mp4',
      fingerprint: 'fp_1',
    })
    repo1.completeExport(started.id, {
      width: 1080,
      height: 1920,
      fps: 30,
      durationSec: 15,
      bytes: 1000,
      videoCodec: 'h264',
      audioCodec: 'aac',
      fingerprint: 'fp_1',
      outputPath: 'C:\\Users\\owner\\Videos\\a.mp4',
    })
    const bytes = db1.export()
    db1.close()

    // Simulate app restart: open a new DB from the persisted bytes.
    const db2 = await freshDb(bytes)
    const repo2 = new ProjectRepository(db2)
    const reopened = repo2.get(created.id)
    expect(reopened?.name).toBe('Persistente v2')
    expect(withHistory.id).toBe(created.id)
    const survived = repo2.listExports(created.id)
    expect(survived.length).toBe(1)
    // The FULL record survives restart, not just its existence.
    expect(survived[0]?.status).toBe('completed')
    expect(survived[0]?.outputPath).toBe('C:\\Users\\owner\\Videos\\a.mp4')
    expect(survived[0]?.audioCodec).toBe('aac')
  })
})
