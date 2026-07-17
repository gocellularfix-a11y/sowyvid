import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSqlJsDatabase } from '@database/sqljs'
import { runMigrations } from '@database/migrations'
import { ProjectRepository, MusicRepository } from '@database/index'
import { resolveWasmPath } from '@database/index'
import { migrateLegacyProjectMusic } from './migrateLegacyMusic.node'
import type { Database, PersistentDatabase } from '@database/port'

/**
 * Legacy project-scoped music must migrate into the global catalog without
 * losing selections, without duplicating identical bytes, and idempotently.
 */
const wasmPath = resolveWasmPath()
const HASH = 'd'.repeat(64)

function fakePersist(db: Database): PersistentDatabase {
  return { ...db, persist: async () => undefined } as unknown as PersistentDatabase
}

describe('legacy project-music migration', () => {
  let root: string
  let db: Database
  let repo: ProjectRepository
  let musicRepo: MusicRepository

  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), 'sowyvid-mig-'))
    db = await createSqlJsDatabase({ wasmPath })
    runMigrations(db)
    repo = new ProjectRepository(db)
    musicRepo = new MusicRepository(db)
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  function seedProjectWithLegacyMusic(name: string): { projectId: string; mediaId: string } {
    const project = repo.create({ name })
    const mediaId = `media_${HASH}`
    // A real managed file in this project's media dir.
    const filesDir = join(root, 'projects', project.id, 'media', 'files')
    mkdirSync(filesDir, { recursive: true })
    writeFileSync(join(filesDir, `${HASH}.mp3`), Buffer.from('ID3 fake mp3 bytes'))
    const audioAsset = {
      id: mediaId,
      kind: 'audio' as const,
      relPath: `media/files/${HASH}.mp3`,
      originalName: 'fondo.mp3',
      mimeType: 'audio/mpeg',
      hash: HASH,
      bytes: 18,
      width: null,
      height: null,
      orientation: null,
      durationSec: 12,
      fps: null,
      hasAudio: true,
      container: null,
      videoCodec: null,
      audioCodec: null,
      audioSampleRate: null,
      audioChannels: null,
      thumbRelPath: null,
      posterRelPath: null,
      audioMeta: null,
      analysisStatus: 'ready' as const,
      analysisError: null,
      valid: true,
      importedAt: '2026-01-01T00:00:00.000Z',
    }
    repo.save({ ...project, media: [audioAsset], audio: { ...project.audio, musicId: mediaId } })
    return { projectId: project.id, mediaId }
  }

  const paths = () => ({ vaultRoot: join(root, 'music'), projectDirOf: (id: string) => join(root, 'projects', id) })

  it('registers legacy music in the catalog and preserves the selection', async () => {
    const { projectId } = seedProjectWithLegacyMusic('Comercial viejo')
    const migrated = await migrateLegacyProjectMusic({ db: fakePersist(db), repo, musicRepo }, paths())
    expect(migrated).toBe(1)

    const track = musicRepo.getByHash(HASH)
    expect(track).toBeDefined()
    expect(track!.id).toBe(`music_${HASH}`)
    expect(track!.durationSec).toBe(12)
    // Selection preserved: the global id is set AND the legacy id is kept.
    const project = repo.get(projectId)!
    expect(project.audio.musicTrackId).toBe(`music_${HASH}`)
    expect(project.audio.musicId).toBe(`media_${HASH}`)
    // The bytes were copied into the vault exactly once.
    expect(existsSync(join(root, 'music', 'files', `${HASH}.mp3`))).toBe(true)
  })

  it('deduplicates identical bytes across projects — one vault file, one track', async () => {
    seedProjectWithLegacyMusic('Comercial A')
    seedProjectWithLegacyMusic('Comercial B')
    const migrated = await migrateLegacyProjectMusic({ db: fakePersist(db), repo, musicRepo }, paths())
    expect(migrated).toBe(2)
    expect(musicRepo.list()).toHaveLength(1) // same hash → one track
    expect(readdirSync(join(root, 'music', 'files'))).toHaveLength(1)
  })

  it('is idempotent — a second run migrates nothing new', async () => {
    seedProjectWithLegacyMusic('Comercial viejo')
    await migrateLegacyProjectMusic({ db: fakePersist(db), repo, musicRepo }, paths())
    const again = await migrateLegacyProjectMusic({ db: fakePersist(db), repo, musicRepo }, paths())
    expect(again).toBe(0)
  })
})
