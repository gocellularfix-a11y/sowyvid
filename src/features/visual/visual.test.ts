import { describe, it, expect } from 'vitest'
import { buildVisualPlan, validateVisualPlan } from './index'
import { developProjectConcepts, compileProjectConcept } from '@features/creative'
import { goCellularProject } from '@shared/fixtures/goCellular'
import type { CommercialRenderPlan } from '@jorge-engines/northstar-creative'

function renderPlanFor(): CommercialRenderPlan {
  const concept = developProjectConcepts(goCellularProject, 1)[0]!
  return compileProjectConcept(goCellularProject, concept.conceptId).renderPlan
}

function build(rp = renderPlanFor()) {
  return buildVisualPlan({
    renderPlan: rp,
    brand: goCellularProject.brand,
    media: goCellularProject.media,
    industry: goCellularProject.brief.category,
  })
}

describe('FrameLogic → VisualPlan adapter', () => {
  it('produces a schema-valid visual plan ending on a CTA', () => {
    const vp = build()
    expect(validateVisualPlan(vp).ok).toBe(true)
    expect(vp.scenes.at(-1)?.role).toBe('cta')
    expect(vp.visualEngineName).toContain('framelogic')
    expect(vp.visualProfileVersion).toBeGreaterThan(0)
  })

  it('adapts aspect ratio + canvas from the render plan platform', () => {
    const vp = build()
    expect(vp.width).toBe(1080)
    expect(vp.height).toBe(1920)
    expect(vp.aspectRatio).toBe('9:16')
    expect(vp.fps).toBeGreaterThan(0)
  })

  it('is deterministic for the same render plan', () => {
    const rp = renderPlanFor()
    expect(JSON.stringify(build(rp))).toBe(JSON.stringify(build(rp)))
  })

  it('has a continuous frame timeline that sums to the total', () => {
    const vp = build()
    let cursor = 0
    for (const s of vp.scenes) {
      expect(s.startFrame).toBe(cursor)
      expect(s.durationInFrames).toBeGreaterThan(0)
      cursor += s.durationInFrames
    }
    expect(vp.totalDurationInFrames).toBe(cursor)
  })

  it('keeps the motion profile within bounded behavior', () => {
    const vp = build()
    expect(vp.motion.zoomEnd).toBeLessThanOrEqual(1.12)
    expect(vp.motion.maxRotationDeg).toBeLessThanOrEqual(1.2)
  })

  it('keeps text frames inside a safe width', () => {
    const vp = build()
    for (const s of vp.scenes) {
      expect(s.textFrame.maxWidth).toBeGreaterThanOrEqual(Math.round(vp.width * 0.42))
      expect(s.textFrame.maxWidth).toBeLessThanOrEqual(Math.round(vp.width * 0.92))
    }
  })

  it('avoids adjacent media layout repetition (layout rhythm)', () => {
    const vp = build()
    const withMedia = vp.scenes.filter((s) => s.placement !== null)
    for (let i = 1; i < withMedia.length; i++) {
      // adjacency is enforced across the full scene sequence by FrameLogic
      if (withMedia[i]!.order === withMedia[i - 1]!.order + 1) {
        expect(withMedia[i]!.placement).not.toBe(withMedia[i - 1]!.placement)
      }
    }
    expect(true).toBe(true)
  })

  it('rejects an invalid visual plan (CTA not final)', () => {
    const vp = build()
    const broken = { ...vp, scenes: [...vp.scenes].reverse() }
    expect(validateVisualPlan(broken).ok).toBe(false)
  })
})
