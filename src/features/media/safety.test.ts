import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createHash } from 'node:crypto'
import { mkdtempSync, existsSync, writeFileSync, rmSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveManagedMediaPath, isValidMediaId } from './managedPath'
import { findMediaReferences, markMissingMedia } from './mediaReferences'
import { importMedia, removeMedia } from './mediaImport.node'
import { Project, type ProjectVersion } from '@shared/domain/project'
import type { MediaAsset } from '@shared/domain/media'
import { goCellularProject } from '@shared/fixtures/goCellular'
import { developProjectConcepts, compileProjectConcept } from '@features/creative'

const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)
const PNG_HASH = createHash('sha256').update(PNG_1x1).digest('hex')

function fakeAsset(id: string, relPath: string): MediaAsset {
  return {
    id,
    kind: 'image',
    relPath,
    originalName: 'x.png',
    mimeType: 'image/png',
    hash: 'h',
    bytes: 1,
    width: 10,
    height: 10,
    orientation: 'square',
    durationSec: null,
    fps: null,
    hasAudio: false,
    container: null,
    videoCodec: null,
    audioCodec: null,
    audioSampleRate: null,
    audioChannels: null,
    thumbRelPath: null,
    posterRelPath: null,
    audioMeta: null,
    analysisStatus: 'ready',
    analysisError: null,
    valid: true,
    importedAt: '2026-01-01T00:00:00.000Z',
  }
}

describe('managed-path resolution (Section 11 security)', () => {
  const projectDir = process.platform === 'win32' ? 'C:\\data\\proj_1' : '/data/proj_1'
  const validId = `media_${'a'.repeat(64)}`

  it('accepts only well-formed media ids', () => {
    expect(isValidMediaId(validId)).toBe(true)
    expect(isValidMediaId('media_short')).toBe(false)
    expect(isValidMediaId('../../etc/passwd')).toBe(false)
    expect(isValidMediaId('gc_store')).toBe(false)
  })

  it('resolves a valid managed original within the media dir', () => {
    const asset = fakeAsset(validId, `media/files/${'a'.repeat(64)}.png`)
    const abs = resolveManagedMediaPath(projectDir, asset, 'original')
    expect(abs).toBeTruthy()
    expect(abs).toContain('files')
  })

  it('rejects path traversal in relPath', () => {
    const asset = fakeAsset(validId, '../../../../etc/passwd')
    expect(resolveManagedMediaPath(projectDir, asset, 'original')).toBeNull()
  })

  it('rejects an invalid media id even with a valid path', () => {
    const asset = fakeAsset('gc_store', 'media/files/x.png')
    expect(resolveManagedMediaPath(projectDir, asset, 'original')).toBeNull()
  })

  it('returns null when the requested variant is absent', () => {
    const asset = fakeAsset(validId, `media/files/${'a'.repeat(64)}.png`)
    expect(resolveManagedMediaPath(projectDir, asset, 'poster')).toBeNull()
  })
})

describe('media reference safety (Section 6)', () => {
  it('flags media used as the brand logo', () => {
    const project = Project.parse({
      ...goCellularProject,
      brand: { ...goCellularProject.brand, logoMediaId: 'gc_store' },
    })
    const refs = findMediaReferences('gc_store', { project })
    expect(refs.some((r) => r.kind === 'logo')).toBe(true)
  })

  it('flags media used by the compiled creative plan', () => {
    const concept = developProjectConcepts(goCellularProject, 1)[0]!
    const { selection, renderPlan } = compileProjectConcept(goCellularProject, concept.conceptId)
    const assignedId = renderPlan.scenes.flatMap((s) => s.media.map((m) => m.assetId))[0]
    expect(assignedId).toBeTruthy()
    const project = Project.parse({ ...goCellularProject, creative: selection })
    const refs = findMediaReferences(assignedId!, { project })
    expect(refs.some((r) => r.kind === 'creative-plan')).toBe(true)
  })

  it('flags media used by a saved project version', () => {
    const version: ProjectVersion = {
      id: 'ver_1',
      projectId: goCellularProject.id,
      label: 'v1',
      createdAt: '2026-01-01T00:00:00.000Z',
      snapshot: goCellularProject,
    }
    const bare = Project.parse({ ...goCellularProject, media: [] })
    const refs = findMediaReferences('gc_store', { project: bare, versions: [version] })
    expect(refs.some((r) => r.kind === 'project-version')).toBe(true)
  })

  it('reports no references for unused media', () => {
    expect(findMediaReferences('media_unused', { project: goCellularProject })).toEqual([])
  })

  it('marks media whose managed file is missing', () => {
    const asset = fakeAsset(`media_${'b'.repeat(64)}`, 'media/files/x.png')
    const [flagged] = markMissingMedia([asset], () => false)
    expect(flagged?.valid).toBe(false)
    expect(flagged?.analysisError).toBe('missing-managed-file')
    const [ok] = markMissingMedia([asset], () => true)
    expect(ok?.valid).toBe(true)
  })
})

describe('removal removes derivatives + keeps project valid', () => {
  let root: string
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'sowyvid-safety-'))
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  it('removes the source and its poster/thumbnail derivatives', async () => {
    const { media } = await importMedia(root, [], [
      { kind: 'bytes', originalName: 'a.png', bytes: PNG_1x1 },
    ])
    const id = media[0]!.id
    // Simulate generated derivatives.
    mkdirSync(join(root, 'posters'), { recursive: true })
    mkdirSync(join(root, 'thumbnails'), { recursive: true })
    writeFileSync(join(root, 'posters', `${PNG_HASH}.jpg`), 'x')
    writeFileSync(join(root, 'thumbnails', `${PNG_HASH}.jpg`), 'x')

    const remaining = await removeMedia(root, media, id)
    expect(remaining).toHaveLength(0)
    expect(existsSync(join(root, 'files', `${PNG_HASH}.png`))).toBe(false)
    expect(existsSync(join(root, 'posters', `${PNG_HASH}.jpg`))).toBe(false)
    expect(existsSync(join(root, 'thumbnails', `${PNG_HASH}.jpg`))).toBe(false)
  })

  it('leaves the project valid after a safe deletion', async () => {
    const first = await importMedia(root, [], [
      { kind: 'bytes', originalName: 'a.png', bytes: PNG_1x1 },
    ])
    const media = await removeMedia(root, first.media, first.media[0]!.id)
    const project = Project.parse({ ...goCellularProject, media })
    expect(project.media).toHaveLength(0)
  })
})
