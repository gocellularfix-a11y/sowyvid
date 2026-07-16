import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createHash } from 'node:crypto'
import { mkdtempSync, existsSync, writeFileSync, rmSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { importMedia, removeMedia } from './mediaImport.node'
import { MAX_FILE_BYTES } from './limits'
import { toEngineMedia } from '@features/creative'
import { Project } from '@shared/domain/project'
import { goCellularProject } from '@shared/fixtures/goCellular'

// A minimal valid 1x1 PNG.
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)
const PNG_HASH = createHash('sha256').update(PNG_1x1).digest('hex')

let root: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'sowyvid-media-'))
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('MediaVault import — validation', () => {
  it('imports a real PNG by byte signature and copies it into managed storage', async () => {
    const { outcomes, media } = await importMedia(root, [], [
      { kind: 'bytes', originalName: 'photo.png', bytes: PNG_1x1 },
    ])
    expect(outcomes[0]?.status).toBe('imported')
    expect(media).toHaveLength(1)
    // Managed copy exists at <root>/files/<hash>.png — content-addressed.
    expect(existsSync(join(root, 'files', `${PNG_HASH}.png`))).toBe(true)
    // Record JSON persisted atomically.
    expect(existsSync(join(root, 'records', `media_${PNG_HASH}.json`))).toBe(true)
    // Asset references a project-relative path, never an absolute source path.
    expect(media[0]?.relPath).toBe(`media/files/${PNG_HASH}.png`)
    expect(media[0]?.width).toBe(1)
    expect(media[0]?.height).toBe(1)
  })

  it('rejects an extension-spoofed file (PNG bytes named .jpg)', async () => {
    const { outcomes } = await importMedia(root, [], [
      { kind: 'bytes', originalName: 'fake.jpg', bytes: PNG_1x1 },
    ])
    expect(outcomes[0]?.status).toBe('unsupported')
  })

  it('rejects an unsupported format', async () => {
    const { outcomes } = await importMedia(root, [], [
      { kind: 'bytes', originalName: 'notes.txt', bytes: Buffer.from('hello') },
    ])
    expect(outcomes[0]?.status).toBe('unsupported')
  })

  it('rejects an empty file', async () => {
    const { outcomes } = await importMedia(root, [], [
      { kind: 'bytes', originalName: 'empty.png', bytes: Buffer.alloc(0) },
    ])
    expect(outcomes[0]?.status).toBe('empty')
  })

  it('rejects an oversized file before hashing', async () => {
    const big = Buffer.alloc(MAX_FILE_BYTES + 1)
    const { outcomes } = await importMedia(root, [], [
      { kind: 'bytes', originalName: 'huge.png', bytes: big },
    ])
    expect(outcomes[0]?.status).toBe('oversized')
  })
})

describe('MediaVault import — content addressing', () => {
  it('detects duplicate content by SHA-256 and uses a stable media id', async () => {
    const first = await importMedia(root, [], [
      { kind: 'bytes', originalName: 'a.png', bytes: PNG_1x1 },
    ])
    expect(first.outcomes[0]?.status).toBe('imported')
    expect(first.media[0]?.id).toBe(`media_${PNG_HASH}`)

    const second = await importMedia(root, first.media, [
      { kind: 'bytes', originalName: 'a-copy.png', bytes: PNG_1x1 },
    ])
    expect(second.outcomes[0]?.status).toBe('duplicate')
    expect(second.media).toHaveLength(1) // not duplicated in the project list
    // Only one managed file on disk.
    expect(readdirSync(join(root, 'files'))).toHaveLength(1)
  })

  it('sanitizes filenames and never writes the original name to disk', async () => {
    const { media } = await importMedia(root, [], [
      { kind: 'bytes', originalName: '../../evil/../name.png', bytes: PNG_1x1 },
    ])
    // Stored file is content-addressed; only the hash appears on disk.
    expect(readdirSync(join(root, 'files'))).toEqual([`${PNG_HASH}.png`])
    // Original name is preserved as metadata only (basename, no traversal).
    expect(media[0]?.originalName).toBe('name.png')
  })
})

describe('MediaVault import — durability & isolation', () => {
  it('imported media survives deletion of the original source file', async () => {
    const original = join(root, 'source.png')
    writeFileSync(original, PNG_1x1)
    const { media } = await importMedia(root, [], [{ kind: 'path', path: original }])
    rmSync(original, { force: true }) // user deletes the original
    expect(existsSync(original)).toBe(false)
    // The managed copy is untouched.
    expect(existsSync(join(root, 'files', `${PNG_HASH}.png`))).toBe(true)
    expect(media[0]?.relPath).toBe(`media/files/${PNG_HASH}.png`)
  })

  it('keeps projects isolated (separate managed roots)', async () => {
    const rootB = mkdtempSync(join(tmpdir(), 'sowyvid-media-b-'))
    try {
      await importMedia(root, [], [{ kind: 'bytes', originalName: 'x.png', bytes: PNG_1x1 }])
      await importMedia(rootB, [], [{ kind: 'bytes', originalName: 'x.png', bytes: PNG_1x1 }])
      expect(existsSync(join(root, 'files', `${PNG_HASH}.png`))).toBe(true)
      expect(existsSync(join(rootB, 'files', `${PNG_HASH}.png`))).toBe(true)
      // Removing from one project does not affect the other.
      await removeMedia(root, [], `media_${PNG_HASH}`)
      expect(existsSync(join(root, 'files', `${PNG_HASH}.png`))).toBe(false)
      expect(existsSync(join(rootB, 'files', `${PNG_HASH}.png`))).toBe(true)
    } finally {
      rmSync(rootB, { recursive: true, force: true })
    }
  })
})

describe('MediaVault ↔ project ↔ Northstar', () => {
  it('imported media flows into the project and reaches the engine as metadata', async () => {
    const { media } = await importMedia(root, [], [
      { kind: 'bytes', originalName: 'product.png', bytes: PNG_1x1 },
    ])
    // Attach to a project and confirm it persists through the Project schema.
    const project = Project.parse({ ...goCellularProject, media })
    expect(project.media.map((m) => m.id)).toContain(`media_${PNG_HASH}`)
    // Northstar receives abstract metadata + stable IDs (not paths).
    const engineMedia = toEngineMedia(project.media)
    expect(engineMedia.find((m) => m.id === `media_${PNG_HASH}`)).toBeTruthy()
  })

  it('a project with managed media re-validates (stays loadable)', async () => {
    const { media } = await importMedia(root, [], [
      { kind: 'bytes', originalName: 'a.png', bytes: PNG_1x1 },
    ])
    const raw = JSON.parse(JSON.stringify({ ...goCellularProject, media }))
    expect(() => Project.parse(raw)).not.toThrow()
  })
})
