import { describe, it, expect } from 'vitest'
import { visualPlanToCompositionProps } from './remotionProps'
import { buildVisualPlan } from '@features/visual'
import { developProjectConcepts, compileProjectConcept } from '@features/creative'
import { goCellularProject } from '@shared/fixtures/goCellular'

function visualPlan() {
  const concept = developProjectConcepts(goCellularProject, 1)[0]!
  const { renderPlan } = compileProjectConcept(goCellularProject, concept.conceptId)
  return buildVisualPlan({
    renderPlan,
    brand: goCellularProject.brand,
    media: goCellularProject.media,
    industry: goCellularProject.brief.category,
  })
}

describe('VisualPlan → composition props (Remotion adapter)', () => {
  it('converts a visual plan into composition props', () => {
    const props = visualPlanToCompositionProps(visualPlan(), goCellularProject.id, goCellularProject.media)
    expect(props.scenes.length).toBeGreaterThan(0)
    expect(props.width).toBe(1080)
    expect(props.fps).toBeGreaterThan(0)
    expect(props.motion.zoomEnd).toBeGreaterThan(1)
  })

  it('keeps scene frame ranges continuous and CTA final', () => {
    const props = visualPlanToCompositionProps(visualPlan(), goCellularProject.id, goCellularProject.media)
    let cursor = 0
    for (const s of props.scenes) {
      expect(s.from).toBe(cursor)
      cursor += s.durationInFrames
    }
    expect(cursor).toBe(props.durationInFrames)
    expect(props.scenes.at(-1)?.role).toBe('cta')
  })

  it('resolves managed media IDs to controlled protocol URLs', () => {
    const props = visualPlanToCompositionProps(visualPlan(), goCellularProject.id, goCellularProject.media)
    const withMedia = props.scenes.flatMap((s) => s.media).filter((m) => !m.missing)
    expect(withMedia.length).toBeGreaterThan(0)
    for (const m of withMedia) {
      expect(m.url.startsWith(`sowyvid-media://asset/${goCellularProject.id}/${m.assetId}/`)).toBe(true)
    }
  })

  it('flags missing media so the composition draws a placeholder', () => {
    // No media supplied → every referenced asset is missing.
    const props = visualPlanToCompositionProps(visualPlan(), goCellularProject.id, [])
    const refs = props.scenes.flatMap((s) => s.media)
    if (refs.length > 0) {
      expect(refs.every((m) => m.missing)).toBe(true)
    }
  })
})
