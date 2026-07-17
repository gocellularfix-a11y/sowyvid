import { describe, it, expect } from 'vitest'
import {
  autoTextLayout,
  clampToSafe,
  isUnsafe,
  safeArea,
  snapLayout,
  resolveSceneTextLayouts,
  upsertOverride,
  resetElement,
  resetScene,
  copyLayoutToScenes,
  SNAP_THRESHOLD,
  type SceneTextInput,
  type TextLayout,
} from './textLayout'
import { TextLayoutOverride } from '@shared/domain/textLayout'
import { Project } from '@shared/domain/project'

const BASE_PROJECT = {
  id: 'proj_1',
  name: 'Comercial',
  brief: {},
  brand: {},
  video: {},
  audio: {},
  render: {},
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const FRAME = { justifyContent: 'flex-end' as const, textAlign: 'center' as const, maxWidth: 800, translateYPercent: 0, canvasWidth: 1080 }

function scene(): SceneTextInput {
  return {
    sceneId: 'sc1',
    texts: { subtitle: 'Oferta', headline: 'Título grande', offer: 'Detalle' },
    frame: FRAME,
  }
}

describe('automatic layout is deterministic and stacks roles', () => {
  it('gives identical output for identical input', () => {
    expect(autoTextLayout('headline', FRAME)).toEqual(autoTextLayout('headline', FRAME))
  })

  it('stacks subtitle above headline above offer', () => {
    const sub = autoTextLayout('subtitle', FRAME)
    const head = autoTextLayout('headline', FRAME)
    const offer = autoTextLayout('offer', FRAME)
    expect(sub.y).toBeLessThan(head.y)
    expect(head.y).toBeLessThan(offer.y)
    expect(head.x).toBe(0.5)
    expect(head.alignment).toBe('center')
  })

  it('normalizes width from the frame maxWidth', () => {
    expect(autoTextLayout('headline', FRAME).width).toBeCloseTo(800 / 1080)
  })
})

describe('safe areas and clamping', () => {
  it('vertical format keeps a taller bottom margin', () => {
    const s = safeArea('9:16')
    expect(s.bottom).toBeGreaterThan(s.top)
  })

  it('clamps a center pushed past the safe area back inside', () => {
    const layout: TextLayout = { x: 0.99, y: 0.99, width: 0.5, scale: 1, alignment: 'center' }
    const clamped = clampToSafe(layout, '9:16')
    const s = safeArea('9:16')
    expect(clamped.x).toBeLessThanOrEqual(1 - s.right)
    expect(clamped.y).toBeLessThanOrEqual(1 - s.bottom)
  })

  it('flags a block whose edge leaves the safe area', () => {
    expect(isUnsafe({ x: 0.5, y: 0.5, width: 0.99, scale: 1, alignment: 'center' }, '9:16')).toBe(true)
    expect(isUnsafe({ x: 0.5, y: 0.5, width: 0.4, scale: 1, alignment: 'center' }, '9:16')).toBe(false)
  })
})

describe('snapping is gentle and optional', () => {
  const base: TextLayout = { x: 0.5 + SNAP_THRESHOLD / 2, y: 0.4, width: 0.5, scale: 1, alignment: 'center' }

  it('snaps x to the horizontal center when close', () => {
    const { layout, guides } = snapLayout(base, '9:16')
    expect(layout.x).toBe(0.5)
    expect(guides.vertical).toContain(0.5)
  })

  it('does nothing when snapping is disabled (modifier held)', () => {
    const { layout, guides } = snapLayout(base, '9:16', [], false)
    expect(layout.x).toBe(base.x)
    expect(guides.vertical).toHaveLength(0)
  })

  it('snaps to a nearby sibling x for alignment', () => {
    const sib = 0.44 // clear of center and both safe-edge targets
    const near: TextLayout = { ...base, x: sib + SNAP_THRESHOLD / 2, width: 0.4 }
    expect(snapLayout(near, '9:16', [sib]).layout.x).toBe(sib)
  })
})

describe('resolution merges automatic layout with overrides', () => {
  it('uses automatic layout when there is no override', () => {
    const els = resolveSceneTextLayouts(scene(), [], '9:16')
    expect(els.map((e) => e.role)).toEqual(['subtitle', 'headline', 'offer'])
    expect(els.every((e) => !e.custom)).toBe(true)
  })

  it('applies a custom override only to its element', () => {
    const override = TextLayoutOverride.parse({
      sceneId: 'sc1', role: 'headline', aspectRatio: '9:16', x: 0.3, y: 0.3, width: 0.5, scale: 1.5, alignment: 'left',
    })
    const els = resolveSceneTextLayouts(scene(), [override], '9:16')
    const head = els.find((e) => e.role === 'headline')!
    expect(head.custom).toBe(true)
    expect(head.layout.x).toBeCloseTo(0.3)
    expect(head.layout.scale).toBe(1.5)
    // Untouched elements stay automatic.
    expect(els.find((e) => e.role === 'subtitle')!.custom).toBe(false)
  })

  it('isolates overrides per aspect ratio', () => {
    const override = TextLayoutOverride.parse({
      sceneId: 'sc1', role: 'headline', aspectRatio: '9:16', x: 0.2, y: 0.2, width: 0.5, scale: 1, alignment: 'center',
    })
    // Same scene, different format → automatic, not the 9:16 custom position.
    const square = resolveSceneTextLayouts(scene(), [override], '1:1')
    expect(square.find((e) => e.role === 'headline')!.custom).toBe(false)
  })

  it('skips roles with no text', () => {
    const noOffer: SceneTextInput = { ...scene(), texts: { headline: 'Solo título' } }
    const els = resolveSceneTextLayouts(noOffer, [], '9:16')
    expect(els.map((e) => e.role)).toEqual(['headline'])
  })
})

describe('override editing: upsert, reset, copy', () => {
  const key = { sceneId: 'sc1', role: 'headline' as const, aspectRatio: '9:16' }
  const layout: TextLayout = { x: 0.4, y: 0.3, width: 0.6, scale: 1.2, alignment: 'left' }

  it('upserts and replaces rather than duplicating', () => {
    let ovs = upsertOverride([], key, layout)
    ovs = upsertOverride(ovs, key, { ...layout, x: 0.6 })
    expect(ovs).toHaveLength(1)
    expect(ovs[0]!.x).toBeCloseTo(0.6)
  })

  it('clamps an out-of-range upsert into safe bounds', () => {
    const ovs = upsertOverride([], key, { x: 2, y: -1, width: 5, scale: 9, alignment: 'center' })
    expect(ovs[0]!.x).toBeLessThanOrEqual(1)
    expect(ovs[0]!.width).toBeLessThanOrEqual(0.96)
    expect(ovs[0]!.scale).toBeLessThanOrEqual(2.5)
  })

  it('reset removes only the targeted element', () => {
    const ovs = [
      TextLayoutOverride.parse({ ...key, ...layout }),
      TextLayoutOverride.parse({ sceneId: 'sc1', role: 'offer', aspectRatio: '9:16', x: 0.5, y: 0.6, width: 0.5, scale: 1, alignment: 'center' }),
    ]
    const after = resetElement(ovs, key)
    expect(after).toHaveLength(1)
    expect(after[0]!.role).toBe('offer')
  })

  it('resetScene clears the whole scene for that format only', () => {
    const ovs = [
      TextLayoutOverride.parse({ ...key, ...layout }),
      TextLayoutOverride.parse({ sceneId: 'sc1', role: 'offer', aspectRatio: '9:16', x: 0.5, y: 0.6, width: 0.5, scale: 1, alignment: 'center' }),
      TextLayoutOverride.parse({ sceneId: 'sc2', role: 'headline', aspectRatio: '9:16', x: 0.5, y: 0.6, width: 0.5, scale: 1, alignment: 'center' }),
    ]
    const after = resetScene(ovs, 'sc1', '9:16')
    expect(after.map((o) => o.sceneId)).toEqual(['sc2'])
  })

  it('copies placement (not text) to target scenes for the same role', () => {
    const after = copyLayoutToScenes([], key, layout, ['sc2', 'sc3'])
    expect(after.map((o) => o.sceneId).sort()).toEqual(['sc2', 'sc3'])
    expect(after.every((o) => o.role === 'headline')).toBe(true)
    expect(after[0]!.x).toBeCloseTo(0.4)
  })
})

describe('project persistence, backward compatibility and duplication', () => {
  it('a legacy project with no textLayouts loads with an empty list', () => {
    const project = Project.parse(BASE_PROJECT)
    expect(project.textLayouts).toEqual([])
  })

  it('round-trips custom text layouts through the schema', () => {
    const override = { sceneId: 'sc1', role: 'headline', aspectRatio: '9:16', x: 0.3, y: 0.4, width: 0.5, scale: 1.2, alignment: 'left', locked: false }
    const project = Project.parse({ ...BASE_PROJECT, textLayouts: [override] })
    const reparsed = Project.parse(JSON.parse(JSON.stringify(project)))
    expect(reparsed.textLayouts).toEqual([override])
  })

  it('duplication copies the layouts (spread → new id keeps textLayouts)', () => {
    const override = { sceneId: 'sc1', role: 'offer', aspectRatio: '1:1', x: 0.6, y: 0.7, width: 0.4, scale: 1, alignment: 'right', locked: false }
    const source = Project.parse({ ...BASE_PROJECT, textLayouts: [override] })
    const copy = Project.parse({ ...source, id: 'proj_2', name: 'Copia' })
    expect(copy.textLayouts).toEqual(source.textLayouts)
    expect(copy.id).toBe('proj_2')
  })
})
