import { describe, it, expect } from 'vitest'
import { ScenePlan } from '@shared/domain/scenePlan'
import { goCellularProject } from '@shared/fixtures/goCellular'
import { generateScenePlan } from './planner'
import { listTemplates, requireTemplate } from './templates'
import { ENGINE_VERSION, FPS, resolveDimensions } from './dimensions'
import { hashInputs } from './hash'

describe('template registry', () => {
  it('provides at least six valid templates', () => {
    const templates = listTemplates()
    expect(templates.length).toBeGreaterThanOrEqual(6)
  })

  it('templates are structurally distinct (not recolored clones)', () => {
    const templates = listTemplates()
    const signatures = new Set(
      templates.map((t) =>
        JSON.stringify({
          profile: t.motionProfile,
          types: t.sceneStructure.map((s) => s.type),
          upper: t.typography.uppercaseHeadline,
          weight: t.typography.headlineWeight,
        }),
      ),
    )
    // Every template must have a unique structural signature.
    expect(signatures.size).toBe(templates.length)
  })
})

describe('resolveDimensions', () => {
  it('produces even, correctly-oriented dimensions', () => {
    expect(resolveDimensions('9:16', 1920)).toEqual({ width: 1080, height: 1920 })
    expect(resolveDimensions('16:9', 1920)).toEqual({ width: 1920, height: 1080 })
    expect(resolveDimensions('1:1', 1080)).toEqual({ width: 1080, height: 1080 })
    for (const r of ['9:16', '16:9', '1:1', '4:5'] as const) {
      const { width, height } = resolveDimensions(r, 1921)
      expect(width % 2).toBe(0)
      expect(height % 2).toBe(0)
    }
  })
})

describe('generateScenePlan', () => {
  const template = requireTemplate('direct-fast')

  it('produces a schema-valid plan', () => {
    const plan = generateScenePlan(goCellularProject, template)
    expect(() => ScenePlan.parse(plan)).not.toThrow()
    expect(plan.scenes.length).toBeGreaterThan(0)
    expect(plan.fps).toBe(FPS)
    expect(plan.engineVersion).toBe(ENGINE_VERSION)
    expect(plan.width).toBe(1080)
    expect(plan.height).toBe(1920)
  })

  it('is deterministic — identical inputs yield identical plans', () => {
    const a = generateScenePlan(goCellularProject, template)
    const b = generateScenePlan(goCellularProject, template)
    expect(hashInputs(a)).toBe(hashInputs(b))
    expect(a).toEqual(b)
  })

  it('changes the plan when inputs change', () => {
    const a = generateScenePlan(goCellularProject, template)
    const modified = { ...goCellularProject, brief: { ...goCellularProject.brief, offer: 'Nueva oferta 2x1' } }
    const b = generateScenePlan(modified, template)
    expect(a.inputsHash).not.toBe(b.inputsHash)
  })

  it('ends on a call-to-action scene', () => {
    const plan = generateScenePlan(goCellularProject, template)
    const last = plan.scenes[plan.scenes.length - 1]
    expect(last?.type).toBe('cta')
  })

  it('every template generates a valid, non-empty plan for the fixture', () => {
    for (const t of listTemplates()) {
      const plan = generateScenePlan({ ...goCellularProject, templateId: t.id }, t)
      expect(() => ScenePlan.parse(plan)).not.toThrow()
      expect(plan.scenes.length).toBeGreaterThan(0)
      expect(plan.totalFrames).toBeGreaterThan(0)
    }
  })

  it('produces meaningfully different plans across templates', () => {
    const plans = listTemplates().map((t) => generateScenePlan(goCellularProject, t))
    const shapes = new Set(plans.map((p) => p.scenes.map((s) => s.type).join('>')))
    expect(shapes.size).toBeGreaterThan(1)
  })

  it('respects text limits (headline never exceeds the template max)', () => {
    const plan = generateScenePlan(goCellularProject, template)
    for (const scene of plan.scenes) {
      for (const layer of scene.textLayers) {
        if (layer.role === 'headline') {
          expect(layer.text.length).toBeLessThanOrEqual(template.textLimits.headlineMaxChars)
        }
      }
    }
  })

  it('falls back to a valid plan with no media', () => {
    const noMedia = { ...goCellularProject, media: [] }
    const plan = generateScenePlan(noMedia, template)
    expect(plan.scenes.length).toBeGreaterThan(0)
    // With no media, no scene should reference a media id.
    expect(plan.scenes.every((s) => s.mediaId === null)).toBe(true)
  })
})
