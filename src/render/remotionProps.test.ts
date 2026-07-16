import { describe, it, expect } from 'vitest'
import { visualPlanToCompositionProps } from './remotionProps'
import { buildVisualPlan } from '@features/visual'
import { developProjectConcepts, compileProjectConcept } from '@features/creative'
import { goCellularProject, goCellularVideoProject } from '@shared/fixtures/goCellular'
import type { Project } from '@shared/domain/project'

function visualPlanFor(project: Project) {
  const concept = developProjectConcepts(project, 1)[0]!
  const { renderPlan } = compileProjectConcept(project, concept.conceptId)
  return buildVisualPlan({
    renderPlan,
    brand: project.brand,
    media: project.media,
    industry: project.brief.category,
  })
}

function visualPlan() {
  return visualPlanFor(goCellularProject)
}

/** Composition props for the fixture project that has real clips imported. */
function videoProps() {
  return visualPlanToCompositionProps(
    visualPlanFor(goCellularVideoProject),
    goCellularVideoProject.id,
    goCellularVideoProject.media,
  )
}

function videoMedia() {
  return videoProps()
    .scenes.flatMap((s) => s.media)
    .filter((m) => m.kind === 'video' && !m.missing)
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

  it('gives images no playback window and leaves them unchanged', () => {
    const props = visualPlanToCompositionProps(visualPlan(), goCellularProject.id, goCellularProject.media)
    const images = props.scenes.flatMap((s) => s.media).filter((m) => !m.missing)
    expect(images.length).toBeGreaterThan(0)
    for (const m of images) {
      expect(m.kind).toBe('image')
      expect(m.playback).toBeNull()
      expect(m.posterUrl).toBeNull()
      expect(m.url.endsWith('/original')).toBe(true)
    }
  })
})

describe('live managed-video playback (composition props)', () => {
  it('the fixture actually exercises the video path', () => {
    expect(videoMedia().length).toBeGreaterThan(0)
  })

  it('points video at the REAL source, not the poster still', () => {
    for (const m of videoMedia()) {
      expect(m.url.endsWith('/original')).toBe(true)
      expect(m.url.endsWith('/poster')).toBe(false)
      expect(m.playback).not.toBeNull()
    }
  })

  it('keeps the poster available as the loading/failure fallback', () => {
    for (const m of videoMedia()) {
      expect(m.posterUrl).not.toBeNull()
      expect(m.posterUrl!.endsWith('/poster')).toBe(true)
    }
  })

  it('reaches managed video only through the controlled protocol — never a filesystem path', () => {
    for (const m of videoMedia()) {
      for (const url of [m.url, m.posterUrl].filter((u): u is string => u !== null)) {
        expect(url.startsWith(`sowyvid-media://asset/${goCellularVideoProject.id}/`)).toBe(true)
        expect(url).not.toMatch(/^file:/)
        expect(url).not.toMatch(/[A-Za-z]:\\/)
        expect(url).not.toContain('media/')
      }
    }
  })

  it('never lets a clip play past its scene', () => {
    for (const scene of videoProps().scenes) {
      for (const m of scene.media) {
        if (!m.playback) continue
        expect(m.playback.playableFrames).toBeLessThanOrEqual(scene.durationInFrames)
        expect(m.playback.sceneDurationInFrames).toBe(scene.durationInFrames)
      }
    }
  })

  it('never reads past the end of a clip', () => {
    for (const m of videoMedia()) {
      const p = m.playback!
      if (p.sourceDurationInFrames === null) continue
      expect(p.trimEndFrame).toBeLessThanOrEqual(p.sourceDurationInFrames)
      expect(p.trimStartFrame).toBeLessThan(p.sourceDurationInFrames)
    }
  })

  it('actually trims long clips down to their scene', () => {
    const trimmed = videoProps()
      .scenes.flatMap((s) => s.media)
      .filter((m) => m.playback && m.playback.sourceDurationInFrames !== null)
      .filter((m) => m.playback!.sourceDurationInFrames! > m.playback!.sceneDurationInFrames)
    // The fixture clips are 30s and every scene is far shorter, so this must bite.
    expect(trimmed.length).toBeGreaterThan(0)
    for (const m of trimmed) {
      const p = m.playback!
      expect(p.shorterThanScene).toBe(false)
      expect(p.trimEndFrame - p.trimStartFrame).toBe(p.sceneDurationInFrames)
      expect(p.trimEndFrame).toBeLessThan(p.sourceDurationInFrames!)
    }
  })

  it('gives every short clip an intentional, bounded fallback', () => {
    // Northstar decides which assets land in which scenes, so shorten the clips
    // explicitly instead of hoping the selector picks a short one — otherwise
    // this assertion would pass without ever running the short-clip path.
    const shortened = goCellularVideoProject.media.map((m) =>
      m.kind === 'video' ? { ...m, durationSec: 0.5 } : m,
    )
    const props = visualPlanToCompositionProps(
      visualPlanFor(goCellularVideoProject),
      goCellularVideoProject.id,
      shortened,
    )
    const shorts = props.scenes
      .flatMap((s) => s.media)
      .filter((m) => m.playback?.shorterThanScene)
    expect(shorts.length).toBeGreaterThan(0)
    for (const m of shorts) {
      const p = m.playback!
      expect(['loop', 'freeze']).toContain(p.behavior)
      expect(p.playableFrames).toBeGreaterThan(0)
      expect(p.playableFrames).toBeLessThan(p.sceneDurationInFrames)
      // Whatever the strategy, the scene must end up fully covered.
      const covered = p.behavior === 'loop' ? p.loopTimes * p.playableFrames : Infinity
      expect(covered).toBeGreaterThanOrEqual(p.sceneDurationInFrames)
    }
  })

  it('mutes source audio by default, even for clips that have an audio track', () => {
    const props = videoProps()
    const withAudio = props.scenes
      .flatMap((s) => s.media)
      .filter((m) => m.playback !== null)
    expect(withAudio.length).toBeGreaterThan(0)
    for (const m of withAudio) {
      expect(m.playback!.muted).toBe(true)
      expect(m.playback!.volume).toBe(0)
    }
  })

  it('unmutes source audio only when the caller explicitly opts in', () => {
    const props = visualPlanToCompositionProps(
      visualPlanFor(goCellularVideoProject),
      goCellularVideoProject.id,
      goCellularVideoProject.media,
      { sourceAudio: { enabled: true, volume: 0.4 } },
    )
    const audible = props.scenes
      .flatMap((s) => s.media)
      .filter((m) => m.playback && !m.playback.muted)
    // The fixture puts a clip WITH audio on screen, so opting in must unmute
    // something — otherwise this test would prove nothing.
    expect(audible.length).toBeGreaterThan(0)
    expect(audible.every((m) => m.playback!.volume === 0.4)).toBe(true)
    // ...and only clips that actually carry an audio track may become audible.
    const byId = new Map(goCellularVideoProject.media.map((a) => [a.id, a]))
    for (const m of audible) {
      expect(byId.get(m.assetId)!.hasAudio).toBe(true)
    }
    const silentClips = props.scenes
      .flatMap((s) => s.media)
      .filter((m) => m.playback && !byId.get(m.assetId)?.hasAudio)
    for (const m of silentClips) {
      expect(m.playback!.muted).toBe(true)
    }
  })

  it('flags a missing video with no playback window so the placeholder draws instead', () => {
    const props = visualPlanToCompositionProps(
      visualPlanFor(goCellularVideoProject),
      goCellularVideoProject.id,
      [],
    )
    const refs = props.scenes.flatMap((s) => s.media)
    expect(refs.length).toBeGreaterThan(0)
    for (const m of refs) {
      expect(m.missing).toBe(true)
      expect(m.playback).toBeNull()
      expect(m.posterUrl).toBeNull()
    }
  })

  it('treats an invalid asset as missing rather than trying to play it', () => {
    const broken = goCellularVideoProject.media.map((m) =>
      m.kind === 'video' ? { ...m, valid: false } : m,
    )
    const props = visualPlanToCompositionProps(
      visualPlanFor(goCellularVideoProject),
      goCellularVideoProject.id,
      broken,
    )
    const videos = props.scenes.flatMap((s) => s.media).filter((m) => m.kind === 'video')
    for (const m of videos) {
      expect(m.missing).toBe(true)
      expect(m.playback).toBeNull()
    }
  })

  it('keeps frames continuous and CTA final once video is live', () => {
    const props = videoProps()
    let cursor = 0
    for (const s of props.scenes) {
      expect(s.from).toBe(cursor)
      cursor += s.durationInFrames
    }
    expect(cursor).toBe(props.durationInFrames)
    expect(props.scenes.at(-1)?.role).toBe('cta')
  })
})
