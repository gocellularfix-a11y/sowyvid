import { describe, it, expect } from 'vitest'
import { sanitizeBaseName, defaultExportFileName, numberedIfTaken } from './fileNaming'
import { EXPORT_PRESETS, defaultPresetFor, presetIsRenderable, toRenderPreset } from './exportPresets'
import { evaluateRenderReadiness } from './readiness'
import { buildVisualPlan } from '@features/visual'
import { buildAudioPlan } from '@features/audio'
import { developProjectConcepts, compileProjectConcept } from '@features/creative'
import { goCellularProject, aud } from '@shared/fixtures/goCellular'
import type { Project } from '@shared/domain/project'

describe('filename sanitizing', () => {
  it('keeps normal Spanish names, accents included', () => {
    expect(sanitizeBaseName('Reparación de Pantallas')).toBe('Reparación de Pantallas')
  })

  it('strips characters Windows rejects', () => {
    expect(sanitizeBaseName('Promo <Q4>: 50% "off" |ya|')).toBe('Promo Q4 50% off ya')
    expect(sanitizeBaseName('a/b\\c?d*e')).toBe('a b c d e')
  })

  it('rejects reserved device names', () => {
    expect(sanitizeBaseName('CON')).toBe('comercial')
    expect(sanitizeBaseName('lpt1')).toBe('comercial')
  })

  it('never returns an empty name', () => {
    expect(sanitizeBaseName('')).toBe('comercial')
    expect(sanitizeBaseName('???')).toBe('comercial')
    expect(sanitizeBaseName('   ')).toBe('comercial')
  })

  it('trims trailing dots and spaces (Windows rejects them)', () => {
    expect(sanitizeBaseName('Mi promo...')).toBe('Mi promo')
  })

  it('bounds the length', () => {
    expect(sanitizeBaseName('x'.repeat(500)).length).toBeLessThanOrEqual(80)
  })

  it('builds the default export filename from the project name', () => {
    expect(defaultExportFileName('Go Cellular')).toBe('comercial-Go Cellular.mp4')
    // No double "comercial-comercial".
    expect(defaultExportFileName('Comercial verano')).toBe('Comercial verano.mp4')
  })
})

describe('never overwrite silently', () => {
  it('keeps the name when free', () => {
    expect(numberedIfTaken('a.mp4', () => false)).toBe('a.mp4')
  })

  it('numbers past every taken name', () => {
    const taken = new Set(['a.mp4', 'a-2.mp4', 'a-3.mp4'])
    expect(numberedIfTaken('a.mp4', (c) => taken.has(c))).toBe('a-4.mp4')
  })

  it('the produced name is genuinely not taken', () => {
    const taken = new Set(['video.mp4'])
    const result = numberedIfTaken('video.mp4', (c) => taken.has(c))
    expect(taken.has(result)).toBe(false)
    expect(result.endsWith('.mp4')).toBe(true)
  })
})

describe('export presets', () => {
  it('offers the three simple presets plus the plan’s own shape', () => {
    expect(EXPORT_PRESETS.map((p) => p.id)).toEqual(['vertical', 'square', 'horizontal', 'original'])
    expect(EXPORT_PRESETS.find((p) => p.id === 'vertical')?.sizeLabel).toBe('1080 × 1920')
  })

  it('selects the plan’s aspect ratio by default', () => {
    expect(defaultPresetFor('9:16')).toBe('vertical')
    expect(defaultPresetFor('1:1')).toBe('square')
    expect(defaultPresetFor('16:9')).toBe('horizontal')
    // A plan shape with no simple preset (e.g. 4:5) falls back to "as designed".
    expect(defaultPresetFor('4:5')).toBe('original')
  })

  it('refuses to offer a preset that would re-crop the plan', () => {
    expect(presetIsRenderable('vertical', '9:16')).toBe(true)
    expect(presetIsRenderable('square', '9:16')).toBe(false)
    expect(presetIsRenderable('horizontal', '9:16')).toBe(false)
    expect(presetIsRenderable('original', '4:5')).toBe(true)
  })

  it('maps to the render-job preset catalog', () => {
    expect(toRenderPreset('vertical')).toEqual({ id: 'instagram-reel', resolution: 1920 })
    expect(toRenderPreset('original')).toEqual({ id: 'original', resolution: 1920 })
  })
})

// ---- readiness gate ----

function compiledPlans(project: Project) {
  const concept = developProjectConcepts(project, 1)[0]!
  const { renderPlan, selection } = compileProjectConcept(project, concept.conceptId)
  const withSelection: Project = { ...project, creative: selection }
  const visualPlan = buildVisualPlan({
    renderPlan,
    brand: project.brand,
    media: project.media,
    industry: project.brief.category,
  })
  const audioPlan = buildAudioPlan({
    projectId: project.id,
    audio: project.audio,
    visualPlan,
    media: project.media,
  })
  return { project: withSelection, visualPlan, audioPlan }
}

const allFilesExist = () => true

describe('render readiness gate', () => {
  it('is ready for a compiled project whose files all exist', () => {
    const { project, visualPlan, audioPlan } = compiledPlans(goCellularProject)
    const r = evaluateRenderReadiness({
      project,
      visualPlan,
      audioPlan,
      renderActive: false,
      fileExists: allFilesExist,
    })
    expect(r.blockers).toEqual([])
    expect(r.ready).toBe(true)
  })

  it('blocks when there is no project', () => {
    const r = evaluateRenderReadiness({
      project: null,
      visualPlan: null,
      audioPlan: null,
      renderActive: false,
      fileExists: allFilesExist,
    })
    expect(r.ready).toBe(false)
    expect(r.blockers[0]?.code).toBe('no-project')
  })

  it('blocks before a commercial has been created, in plain Spanish', () => {
    const r = evaluateRenderReadiness({
      project: { ...goCellularProject, creative: null },
      visualPlan: null,
      audioPlan: null,
      renderActive: false,
      fileExists: allFilesExist,
    })
    expect(r.ready).toBe(false)
    expect(r.blockers[0]?.code).toBe('no-creative')
    expect(r.blockers[0]?.message).toContain('crea tu comercial')
  })

  it('blocks when a used media file disappeared from disk', () => {
    const { project, visualPlan, audioPlan } = compiledPlans(goCellularProject)
    const r = evaluateRenderReadiness({
      project,
      visualPlan,
      audioPlan,
      renderActive: false,
      fileExists: () => false, // everything gone
    })
    expect(r.ready).toBe(false)
    expect(r.blockers.some((b) => b.code === 'missing-media')).toBe(true)
  })

  it('blocks when selected music is missing — never silently ignores it', () => {
    const project: Project = {
      ...goCellularProject,
      audio: { ...goCellularProject.audio, musicId: 'gc_music_deleted' },
    }
    const { project: compiled, visualPlan, audioPlan } = compiledPlans(project)
    expect(audioPlan.missingTracks.length).toBeGreaterThan(0)
    const r = evaluateRenderReadiness({
      project: compiled,
      visualPlan,
      audioPlan,
      renderActive: false,
      fileExists: allFilesExist,
    })
    expect(r.ready).toBe(false)
    const blocker = r.blockers.find((b) => b.code === 'missing-audio')
    expect(blocker?.message).toContain('música')
  })

  it('blocks when selected music resolves in the plan but its file vanished', () => {
    const music = aud('gc_music', 'fondo.mp3', { durationSec: 8 })
    const project: Project = {
      ...goCellularProject,
      media: [...goCellularProject.media, music],
      audio: { ...goCellularProject.audio, musicId: music.id },
    }
    const { project: compiled, visualPlan, audioPlan } = compiledPlans(project)
    expect(audioPlan.music).not.toBeNull()
    const r = evaluateRenderReadiness({
      project: compiled,
      visualPlan,
      audioPlan,
      renderActive: false,
      // Only the music file is gone.
      fileExists: (rel) => !rel.includes('gc_music'),
    })
    expect(r.ready).toBe(false)
    expect(r.blockers.some((b) => b.code === 'missing-audio')).toBe(true)
  })

  it('allows an intentionally silent commercial (no music selected)', () => {
    const { project, visualPlan, audioPlan } = compiledPlans(goCellularProject)
    expect(audioPlan.silent).toBe(true)
    expect(audioPlan.missingTracks).toEqual([])
    const r = evaluateRenderReadiness({
      project,
      visualPlan,
      audioPlan,
      renderActive: false,
      fileExists: allFilesExist,
    })
    // Silence by explicit choice is a valid state, not a blocker.
    expect(r.ready).toBe(true)
  })

  it('blocks while a render is active', () => {
    const { project, visualPlan, audioPlan } = compiledPlans(goCellularProject)
    const r = evaluateRenderReadiness({
      project,
      visualPlan,
      audioPlan,
      renderActive: true,
      fileExists: allFilesExist,
    })
    expect(r.ready).toBe(false)
    expect(r.blockers[0]?.code).toBe('render-active')
    expect(r.blockers[0]?.message).toContain('exportación en curso')
  })

  it('every blocker message is owner-facing Spanish with no internals', () => {
    const cases = [
      evaluateRenderReadiness({ project: null, visualPlan: null, audioPlan: null, renderActive: false, fileExists: allFilesExist }),
      evaluateRenderReadiness({ project: { ...goCellularProject, creative: null }, visualPlan: null, audioPlan: null, renderActive: true, fileExists: () => false }),
    ]
    for (const r of cases) {
      for (const blocker of r.blockers) {
        expect(blocker.message).not.toMatch(/error|null|undefined|plan\b|ipc|render(?!izar)/i)
        expect(blocker.message.length).toBeGreaterThan(10)
      }
    }
  })
})
