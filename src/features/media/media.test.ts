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

// A minimal valid-enough WAV (RIFF/WAVE header + PCM data) of `dataBytes` payload.
function makeWav(dataBytes: number): Buffer {
  const header = Buffer.alloc(44)
  header.write('RIFF', 0, 'ascii')
  header.writeUInt32LE(36 + dataBytes, 4)
  header.write('WAVE', 8, 'ascii')
  header.write('fmt ', 12, 'ascii')
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(44100, 24)
  header.writeUInt32LE(88200, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36, 'ascii')
  header.writeUInt32LE(dataBytes, 40)
  return Buffer.concat([header, Buffer.alloc(dataBytes)])
}

describe('MediaVault import — hardening', () => {
  it('rejects SVG files (disabled for security)', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')
    const { outcomes } = await importMedia(root, [], [
      { kind: 'bytes', originalName: 'logo.svg', bytes: svg },
    ])
    expect(outcomes[0]?.status).toBe('unsupported')
    // Nothing was written to managed storage.
    expect(existsSync(join(root, 'files'))).toBe(false)
  })

  it('streams a multi-megabyte file into managed storage (bounded memory)', async () => {
    // 5 MB WAV written to disk, imported via the streaming path (never buffered
    // whole by the importer — see streamingImport.node.ts).
    const wav = makeWav(5 * 1024 * 1024)
    const source = join(root, 'big.wav')
    writeFileSync(source, wav)
    const { outcomes, media } = await importMedia(root, [], [{ kind: 'path', path: source }])
    expect(outcomes[0]?.status).toBe('imported')
    expect(media[0]?.kind).toBe('audio')
    expect(media[0]?.bytes).toBe(wav.length)
    const hash = media[0]!.id.replace('media_', '')
    expect(existsSync(join(root, 'files', `${hash}.wav`))).toBe(true)
    // No leftover temp parts after a successful import.
    expect(readdirSync(join(root, 'temp'))).toHaveLength(0)
  })

  it('cleans up temp files when a streamed file fails validation', async () => {
    // PNG bytes with a .mp4 name → signature mismatch mid-stream → rejected.
    const source = join(root, 'fake.mp4')
    writeFileSync(source, PNG_1x1)
    const { outcomes } = await importMedia(root, [], [{ kind: 'path', path: source }])
    expect(outcomes[0]?.status).toBe('unsupported')
    // The temp dir exists but holds no orphaned .part files.
    const temp = join(root, 'temp')
    if (existsSync(temp)) expect(readdirSync(temp)).toHaveLength(0)
  })
})
