import { describe, it, expect } from 'vitest'
import {
  computeVideoPlayback,
  shortClipBehaviorFor,
  sourceDurationInFrames,
  SOURCE_AUDIO_OFF,
} from './videoPlayback'
import { vid } from '@shared/fixtures/goCellular'

const FPS = 30

describe('short-clip behavior is plan-defined', () => {
  it('loops only for rapid_montage, whose intent is repeated motion', () => {
    expect(shortClipBehaviorFor('rapid_montage')).toBe('loop')
  })

  it('freezes for considered holds/pushes, where a jump-cut would read as a glitch', () => {
    for (const shot of ['static', 'full_frame_hold', 'subtle_push', 'pull_back', 'detail_crop']) {
      expect(shortClipBehaviorFor(shot)).toBe('freeze')
    }
  })

  it('freezes for unknown behaviors — a still is always safe, a surprise loop is not', () => {
    expect(shortClipBehaviorFor('some_future_shot')).toBe('freeze')
  })
})

describe('source duration → composition frames', () => {
  it('converts seconds at the composition fps', () => {
    expect(sourceDurationInFrames(vid('v', 'v.mp4', { durationSec: 2 }), FPS)).toBe(60)
  })

  it('floors, so we never claim a frame the source may not contain', () => {
    expect(sourceDurationInFrames(vid('v', 'v.mp4', { durationSec: 2.99 }), FPS)).toBe(89)
  })

  it('reports null (not a guess) when analysis produced no duration', () => {
    expect(sourceDurationInFrames(vid('v', 'v.mp4', { durationSec: null }), FPS)).toBeNull()
  })

  it('treats a zero/negative duration as unknown rather than a 0-frame clip', () => {
    expect(sourceDurationInFrames(vid('v', 'v.mp4', { durationSec: 0 }), FPS)).toBeNull()
  })
})

describe('long clips are trimmed to the scene', () => {
  const asset = vid('long', 'long.mp4', { durationSec: 30 }) // 900 frames

  it('consumes exactly the scene window and no more', () => {
    const p = computeVideoPlayback({
      asset,
      sceneDurationInFrames: 90,
      fps: FPS,
      shotBehavior: 'subtle_push',
    })
    expect(p.trimStartFrame).toBe(0)
    expect(p.trimEndFrame).toBe(90)
    expect(p.playableFrames).toBe(90)
    expect(p.shorterThanScene).toBe(false)
    expect(p.loopTimes).toBe(1)
  })

  it('never reads past the end of the source', () => {
    const p = computeVideoPlayback({
      asset,
      sceneDurationInFrames: 90,
      fps: FPS,
      shotBehavior: 'static',
    })
    expect(p.trimEndFrame).toBeLessThanOrEqual(p.sourceDurationInFrames!)
  })

  it('honors a head trim and still ends at the scene boundary', () => {
    const p = computeVideoPlayback({
      asset,
      sceneDurationInFrames: 90,
      fps: FPS,
      shotBehavior: 'static',
      sourceStartFrame: 100,
    })
    expect(p.trimStartFrame).toBe(100)
    expect(p.trimEndFrame).toBe(190)
    expect(p.playableFrames).toBe(90)
    expect(p.shorterThanScene).toBe(false)
  })
})

describe('playback always begins at a valid source position', () => {
  it('clamps a start offset past the end back to a real frame', () => {
    const asset = vid('short', 'short.mp4', { durationSec: 1 }) // 30 frames
    const p = computeVideoPlayback({
      asset,
      sceneDurationInFrames: 60,
      fps: FPS,
      shotBehavior: 'static',
      sourceStartFrame: 9_999,
    })
    expect(p.trimStartFrame).toBe(29)
    expect(p.trimStartFrame).toBeLessThan(p.sourceDurationInFrames!)
    expect(p.playableFrames).toBeGreaterThan(0)
  })

  it('clamps a negative start to zero', () => {
    const p = computeVideoPlayback({
      asset: vid('v', 'v.mp4', { durationSec: 10 }),
      sceneDurationInFrames: 60,
      fps: FPS,
      shotBehavior: 'static',
      sourceStartFrame: -50,
    })
    expect(p.trimStartFrame).toBe(0)
  })
})

describe('short clips get an intentional fallback', () => {
  const short = vid('short', 'short.mp4', { durationSec: 1 }) // 30 frames

  it('freezes the final real frame for hold-type shots', () => {
    const p = computeVideoPlayback({
      asset: short,
      sceneDurationInFrames: 90,
      fps: FPS,
      shotBehavior: 'full_frame_hold',
    })
    expect(p.shorterThanScene).toBe(true)
    expect(p.behavior).toBe('freeze')
    expect(p.playableFrames).toBe(30)
    expect(p.trimEndFrame).toBe(30)
    expect(p.loopTimes).toBe(1)
  })

  it('loops a bounded number of times for montage shots — enough to cover, never unbounded', () => {
    const p = computeVideoPlayback({
      asset: short,
      sceneDurationInFrames: 90,
      fps: FPS,
      shotBehavior: 'rapid_montage',
    })
    expect(p.behavior).toBe('loop')
    expect(p.loopTimes).toBe(3)
    expect(p.loopTimes * p.playableFrames).toBeGreaterThanOrEqual(p.sceneDurationInFrames)
    expect(Number.isFinite(p.loopTimes)).toBe(true)
  })

  it('rounds the loop count up so the scene is never left uncovered', () => {
    const p = computeVideoPlayback({
      asset: short,
      sceneDurationInFrames: 100, // 30 does not divide 100
      fps: FPS,
      shotBehavior: 'rapid_montage',
    })
    expect(p.loopTimes).toBe(4)
    expect(p.loopTimes * p.playableFrames).toBeGreaterThanOrEqual(100)
  })

  it('covers a clip made short by its head trim, not just a short source', () => {
    const p = computeVideoPlayback({
      asset: vid('v', 'v.mp4', { durationSec: 2 }), // 60 frames
      sceneDurationInFrames: 60,
      fps: FPS,
      shotBehavior: 'static',
      sourceStartFrame: 45, // only 15 frames left
    })
    expect(p.shorterThanScene).toBe(true)
    expect(p.playableFrames).toBe(15)
    expect(p.trimEndFrame).toBe(60)
  })
})

describe('unknown source duration is handled without guessing', () => {
  it('asks for the scene window and does not claim a short-clip fallback', () => {
    const p = computeVideoPlayback({
      asset: vid('v', 'v.mp4', { durationSec: null, analysisStatus: 'failed' }),
      sceneDurationInFrames: 75,
      fps: FPS,
      shotBehavior: 'static',
    })
    expect(p.sourceDurationInFrames).toBeNull()
    expect(p.shorterThanScene).toBe(false)
    expect(p.playableFrames).toBe(75)
    expect(p.trimEndFrame).toBe(75)
  })
})

describe('source audio is silent unless explicitly enabled', () => {
  const noisy = vid('noisy', 'noisy.mp4', { durationSec: 30, hasAudio: true })

  it('mutes by default — no clip starts making noise by accident', () => {
    const p = computeVideoPlayback({
      asset: noisy,
      sceneDurationInFrames: 60,
      fps: FPS,
      shotBehavior: 'static',
    })
    expect(p.muted).toBe(true)
    expect(p.volume).toBe(0)
  })

  it('mutes when the policy is explicitly OFF', () => {
    const p = computeVideoPlayback({
      asset: noisy,
      sceneDurationInFrames: 60,
      fps: FPS,
      shotBehavior: 'static',
      sourceAudio: SOURCE_AUDIO_OFF,
    })
    expect(p.muted).toBe(true)
    expect(p.volume).toBe(0)
  })

  it('unmutes only when explicitly enabled on a clip that has audio', () => {
    const p = computeVideoPlayback({
      asset: noisy,
      sceneDurationInFrames: 60,
      fps: FPS,
      shotBehavior: 'static',
      sourceAudio: { enabled: true, volume: 0.5 },
    })
    expect(p.muted).toBe(false)
    expect(p.volume).toBe(0.5)
  })

  it('stays muted when enabled on a clip that has no audio track', () => {
    const p = computeVideoPlayback({
      asset: vid('silent', 'silent.mp4', { durationSec: 30, hasAudio: false }),
      sceneDurationInFrames: 60,
      fps: FPS,
      shotBehavior: 'static',
      sourceAudio: { enabled: true, volume: 1 },
    })
    expect(p.muted).toBe(true)
    expect(p.volume).toBe(0)
  })

  it('clamps volume into 0..1', () => {
    const loud = computeVideoPlayback({
      asset: noisy,
      sceneDurationInFrames: 60,
      fps: FPS,
      shotBehavior: 'static',
      sourceAudio: { enabled: true, volume: 9 },
    })
    expect(loud.volume).toBe(1)
  })
})
