import { describe, expect, it } from 'vitest'
import { clipVolumeAt, duckSegmentsFromNarration, musicVolumeAt, reconcileNarration, resolveAudioMix, type ResolvedAudioAsset } from '../src/index.js'

const assets: Record<string, ResolvedAudioAsset> = {
  music: { file: 'music.mp3', kind: 'audio', durationMs: 5_000 },
  voice1: { file: 'voice1.wav', kind: 'audio', durationMs: 2_500 },
  voice2: { file: 'voice2.wav', kind: 'audio', durationMs: 1_000 },
  clip: { file: 'clip.wav', kind: 'audio', durationMs: 1_500 },
}
const resolve = (id: string) => assets[id]
const scenes = [{ id: 's1', durationSeconds: 2 }, { id: 's2', durationSeconds: 2 }]

describe('SoundWeave', () => {
  it('builds a deterministic render-neutral mix', () => {
    const input = {
      audioEnabled: true,
      masterVolume: 0.8,
      duckMusicUnderVoice: true,
      music: { assetId: 'music', volume: 0.5, loop: true },
      voice: { mode: 'generated' as const, segments: [{ sceneId: 's1', assetId: 'voice1', durationMs: 2_500 }], volume: 1 },
      clips: [{ assetId: 'clip', startSec: 2.5, volume: 0.6, fadeInSec: 0.2, fadeOutSec: 0.2 }],
    }
    const a = resolveAudioMix(input, scenes, 30, resolve)
    const b = resolveAudioMix(input, scenes, 30, resolve)
    expect(a).toEqual(b)
    expect(a?.totalFrames).toBe(120)
    expect(a?.narration[0]?.durationFrames).toBe(75)
    expect(a?.duckSegments).toEqual([{ fromFrame: 0, toFrame: 75 }])
    expect(JSON.parse(JSON.stringify(a))).toEqual(a)
  })

  it('applies fades and ducking without clipping', () => {
    const plan = resolveAudioMix({ audioEnabled: true, music: { assetId: 'music', fadeInSec: 1, fadeOutSec: 1 }, voice: { mode: 'generated', segments: [{ sceneId: 's1', assetId: 'voice1' }] } }, scenes, 30, resolve)!
    expect(musicVolumeAt(0, plan)).toBe(0)
    expect(musicVolumeAt(15, plan)).toBeGreaterThan(0)
    expect(musicVolumeAt(15, plan)).toBeLessThan(0.5)
    expect(musicVolumeAt(119, plan)).toBe(0)
    const clip = { file: 'x', fromFrame: 0, durationFrames: 30, volume: 1, fadeInFrames: 10, fadeOutFrames: 10 }
    expect(clipVolumeAt(0, clip, 1)).toBe(0)
    expect(clipVolumeAt(15, clip, 1)).toBe(1)
  })

  it('merges overlapping duck intervals', () => {
    expect(duckSegmentsFromNarration([
      { file: 'a', fromFrame: 0, durationFrames: 20, volume: 1, sceneId: 'a' },
      { file: 'b', fromFrame: 15, durationFrames: 20, volume: 1, sceneId: 'b' },
    ], 100)).toEqual([{ fromFrame: 0, toFrame: 35 }])
  })

  it('reports narration that cannot fit instead of silently hiding it', () => {
    const report = reconcileNarration(scenes, [{ sceneId: 's1', assetId: 'voice1', durationMs: 10_000 }], 30)
    expect(report.ok).toBe(false)
    expect(report.tooLongCount).toBe(1)
    expect(report.options).toContain('shorten_script')
  })

  it('rejects invalid plans at the boundary', () => {
    expect(() => resolveAudioMix({ audioEnabled: true, masterVolume: 3 } as never, scenes, 30, resolve)).toThrow()
  })
})
