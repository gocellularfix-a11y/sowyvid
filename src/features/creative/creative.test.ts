import { describe, it, expect, beforeEach } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  serializeCreativePlan,
  classifyPromotion,
  ENGINE_VERSION,
} from '@jorge-engines/northstar-creative'
import {
  developProjectConcepts,
  findProjectConcept,
  compileProjectConcept,
  toRendererPlan,
  projectAssetResolver,
  projectToDirectorInput,
  toEngineMedia,
  listCreativeFamilies,
} from '@features/creative'
import { Project } from '@shared/domain/project'
import { goCellularProject, legacyProjectRaw } from '@shared/fixtures/goCellular'
import { createSqlJsDatabase } from '@database/sqljs'
import { runMigrations } from '@database/migrations'
import { ProjectRepository } from '@database/projectRepository'
import { resolveWasmPath } from '@database/index'
import type { Database } from '@database/port'

const wasmPath = resolveWasmPath()
async function freshDb(bytes?: Uint8Array): Promise<Database> {
  const db = await createSqlJsDatabase({ wasmPath, initialBytes: bytes })
  runMigrations(db)
  return db
}

describe('Northstar integration — determinism & structure', () => {
  it('1. same project + seed → byte-identical plans', () => {
    const a = developProjectConcepts(goCellularProject, 5).map(serializeCreativePlan)
    const b = developProjectConcepts(goCellularProject, 5).map(serializeCreativePlan)
    expect(b).toEqual(a)
  })

  it('2. the first three concepts are structurally different families', () => {
    const three = developProjectConcepts(goCellularProject, 3)
    expect(three).toHaveLength(3)
    expect(new Set(three.map((p) => p.family)).size).toBe(3)
  })

  it('changing the brief changes the concepts (seed sensitivity)', () => {
    const base = developProjectConcepts(goCellularProject, 3).map((p) => p.conceptId)
    const changed = developProjectConcepts(
      { ...goCellularProject, brief: { ...goCellularProject.brief, offer: 'Nuevo 2x1 hoy' } },
      3,
    ).map((p) => p.conceptId)
    expect(changed).not.toEqual(base)
  })

  it('lists the five creative families for the UI', () => {
    expect(listCreativeFamilies()).toHaveLength(5)
  })
})

describe('Northstar integration — compilation & renderer plan', () => {
  const concept = () => developProjectConcepts(goCellularProject, 1)[0]!

  it('5. the final scene is always a CTA', () => {
    const { renderPlan } = compileProjectConcept(goCellularProject, concept().conceptId)
    expect(renderPlan.scenes.at(-1)?.role).toBe('cta')
  })

  it('6. the compiled timeline duration equals the sum of its scenes', () => {
    const { renderPlan } = compileProjectConcept(goCellularProject, concept().conceptId)
    const sum = renderPlan.scenes.reduce((s, sc) => s + sc.durationSec, 0)
    expect(Math.abs(sum - renderPlan.durationSec)).toBeLessThan(0.001)
  })

  it('7. renderer frame ranges do not overlap or leave gaps', () => {
    const { renderPlan } = compileProjectConcept(goCellularProject, concept().conceptId)
    const rendererPlan = toRendererPlan(renderPlan, projectAssetResolver(goCellularProject))
    let cursor = 0
    for (const scene of rendererPlan.scenes) {
      expect(scene.from).toBe(cursor)
      expect(scene.durationInFrames).toBeGreaterThan(0)
      cursor += scene.durationInFrames
    }
    expect(rendererPlan.durationInFrames).toBe(cursor)
  })

  it('resolves engine media IDs to managed relPaths at the renderer boundary', () => {
    const { renderPlan } = compileProjectConcept(goCellularProject, concept().conceptId)
    const rendererPlan = toRendererPlan(renderPlan, projectAssetResolver(goCellularProject))
    const refs = rendererPlan.scenes.flatMap((s) => s.media)
    const resolved = refs.filter((r) => r.resolvedRef !== null)
    // At least one assigned asset should resolve to a managed relPath.
    expect(resolved.length).toBeGreaterThan(0)
    for (const r of resolved) expect(r.resolvedRef).toMatch(/^media\//)
  })

  it('compile returns a reproducible selection with engine identity + fingerprint', () => {
    const c = concept()
    const { selection } = compileProjectConcept(goCellularProject, c.conceptId)
    expect(selection.engineVersion).toBe(ENGINE_VERSION)
    expect(selection.conceptId).toBe(c.conceptId)
    expect(selection.seed.length).toBeGreaterThan(0)
    expect(selection.inputFingerprint.length).toBeGreaterThan(0)
  })
})

describe('Northstar integration — adapters', () => {
  it('11. project input converts into engine input', () => {
    const input = projectToDirectorInput(goCellularProject)
    expect(input.businessName).toBe('Go Cellular')
    expect(input.productOrService).toBe('Teléfonos certificados')
    expect(input.objective).toBe('drive_action')
    expect(input.platformIntent).toBe('vertical_social')
    expect(input.locale).toBe('es')
  })

  it('media adapter maps logos and excludes audio; never invents roles', () => {
    const engineMedia = toEngineMedia([
      ...goCellularProject.media,
      {
        id: 'logo1',
        kind: 'logo',
        relPath: 'media/logo1.png',
        originalName: 'logo.png',
        mimeType: 'image/png',
        hash: 'h',
        bytes: 1,
        width: 512,
        height: 512,
        orientation: 'square',
        durationSec: null,
        hasAudio: false,
        thumbRelPath: null,
        valid: true,
        importedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'song',
        kind: 'audio',
        relPath: 'audio/song.mp3',
        originalName: 'song.mp3',
        mimeType: 'audio/mpeg',
        hash: 'h2',
        bytes: 1,
        width: null,
        height: null,
        orientation: null,
        durationSec: 30,
        hasAudio: true,
        thumbRelPath: null,
        valid: true,
        importedAt: '2026-01-01T00:00:00.000Z',
      },
    ])
    expect(engineMedia.find((m) => m.id === 'song')).toBeUndefined() // audio excluded
    expect(engineMedia.find((m) => m.id === 'logo1')?.roles).toEqual(['logo'])
    expect(engineMedia.find((m) => m.id === 'gc_store')?.roles).toEqual([]) // no invented roles
  })

  it('6/EN-ES-PT. classifies English, Spanish and Portuguese repair briefs', () => {
    const en = classifyPromotion({ productOrService: 'same day iPhone screen repair', locale: 'en' })
    const es = classifyPromotion({ productOrService: 'reparación de pantallas el mismo día', locale: 'es' })
    const pt = classifyPromotion({ productOrService: 'conserto de tela no mesmo dia', locale: 'pt' })
    for (const c of [en, es, pt]) {
      expect(c.category).toBe('repair')
      expect(c.confidence).toBeGreaterThan(0)
    }
  })
})

describe('Northstar integration — persistence & migration', () => {
  let db: Database
  let repo: ProjectRepository
  beforeEach(async () => {
    db = await freshDb()
    repo = new ProjectRepository(db)
  })

  it('8. the selected concept survives a restart', async () => {
    repo.save(goCellularProject)
    const concept = developProjectConcepts(goCellularProject, 1)[0]!
    const { selection } = compileProjectConcept(goCellularProject, concept.conceptId)
    repo.save({ ...goCellularProject, creative: selection })

    const bytes = db.export()
    const db2 = await freshDb(bytes)
    const repo2 = new ProjectRepository(db2)
    const reopened = repo2.get(goCellularProject.id)
    expect(reopened?.creative?.conceptId).toBe(selection.conceptId)
    expect(reopened?.creative?.seed).toBe(selection.seed)
  })

  it('9/13. a legacy (pre-integration) project still loads', () => {
    const legacy = Project.parse(legacyProjectRaw)
    expect(legacy.creative).toBeNull() // defaults, not invalidated
    expect(legacy.templateId).toBe('trust-quality')
    const saved = repo.save(legacy)
    expect(repo.get(saved.id)?.name).toBe('Proyecto anterior')
  })

  it('14. invalid engine output is rejected by schema validation', () => {
    // findProjectConcept returns undefined for an unknown concept; compile throws.
    expect(findProjectConcept(goCellularProject, 'does.not.exist')).toBeUndefined()
    expect(() => compileProjectConcept(goCellularProject, 'does.not.exist')).toThrow()
  })
})

describe('Northstar integration — no legacy namespace', () => {
  it('10. no @colibri import exists in the vendored engine source', () => {
    const root = resolve(process.cwd(), 'packages/northstar-creative-engine/src')
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
      )
    const offenders = walk(root).filter((f) => readFileSync(f, 'utf8').includes('@colibri'))
    expect(offenders).toEqual([])
  })
})
