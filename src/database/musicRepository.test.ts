import { describe, it, expect, beforeEach } from 'vitest'
import { createSqlJsDatabase } from './sqljs'
import { runMigrations } from './migrations'
import { ProjectRepository } from './projectRepository'
import { MusicRepository, usagesForTrack } from './musicRepository'
import { resolveWasmPath } from './index'
import type { Database } from './port'
import { MusicTrack } from '@shared/domain/music'

const wasmPath = resolveWasmPath()
const HASH_A = 'a'.repeat(64)
const HASH_B = 'b'.repeat(64)

async function freshDb(): Promise<Database> {
  const db = await createSqlJsDatabase({ wasmPath })
  runMigrations(db)
  return db
}

function trackInput(hash: string, over: Partial<MusicTrack> = {}): unknown {
  const now = '2026-01-01T00:00:00.000Z'
  return {
    id: `music_${hash}`,
    relPath: `files/${hash}.mp3`,
    originalName: 'fondo.mp3',
    bytes: 1000,
    hash,
    createdAt: now,
    updatedAt: now,
    ...over,
  }
}

describe('MusicRepository — global catalog', () => {
  let db: Database
  let repo: MusicRepository

  beforeEach(async () => {
    db = await freshDb()
    repo = new MusicRepository(db)
  })

  it('saves and reads a track with honest metadata defaults', () => {
    const track = repo.save(trackInput(HASH_A))
    const read = repo.get(track.id)!
    expect(read.id).toBe(`music_${HASH_A}`)
    // Never claims rights or content it was not told about.
    expect(read.source).toBe('imported')
    expect(read.licenseStatus).toBe('unknown')
    expect(read.commercialUseConfirmed).toBe(false)
    expect(read.vocal).toBe('unknown')
    expect(read.title).toBe('')
  })

  it('deduplicates by content hash — identical bytes are one catalog track', () => {
    repo.save(trackInput(HASH_A, { title: 'Primero' }))
    const existing = repo.getByHash(HASH_A)
    expect(existing?.title).toBe('Primero')
    // A second import of the same bytes finds the existing track, not a copy.
    expect(repo.list()).toHaveLength(1)
    expect(repo.getByHash(HASH_B)).toBeUndefined()
  })

  it('updates metadata progressively without losing identity or bytes', () => {
    const t = repo.save(trackInput(HASH_A))
    const updated = repo.save({ ...t, title: 'Mi jingle', licenseStatus: 'commercial-confirmed', commercialUseConfirmed: true })
    expect(updated.id).toBe(t.id)
    expect(updated.hash).toBe(HASH_A)
    const read = repo.get(t.id)!
    expect(read.title).toBe('Mi jingle')
    expect(read.licenseStatus).toBe('commercial-confirmed')
  })

  it('deletes a track', () => {
    const t = repo.save(trackInput(HASH_A))
    expect(repo.delete(t.id)).toBe(true)
    expect(repo.get(t.id)).toBeUndefined()
    expect(repo.delete(t.id)).toBe(false)
  })
})

describe('usage counting across commercials', () => {
  it('counts every commercial whose selection points at the track', async () => {
    const db = await freshDb()
    const projects = new ProjectRepository(db)
    const trackId = `music_${HASH_A}`
    const a = projects.create({ name: 'Comercial A' })
    const b = projects.create({ name: 'Comercial B' })
    const c = projects.create({ name: 'Comercial C' })
    projects.save({ ...a, audio: { ...a.audio, musicTrackId: trackId } })
    projects.save({ ...b, audio: { ...b.audio, musicTrackId: trackId } })
    // C selects nothing.
    void c

    const usages = usagesForTrack(trackId, projects.list())
    expect(usages).toHaveLength(2)
    expect(usages.map((u) => u.projectName).sort()).toEqual(['Comercial A', 'Comercial B'])
  })
})
