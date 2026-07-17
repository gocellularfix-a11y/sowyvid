import { describe, it, expect } from 'vitest'
import { audioPlanToCompositionAudio, musicVolumeAtFrame } from './remotionAudio'
import { visualPlanToCompositionProps } from './remotionProps'
import { buildAudioPlan } from '@features/audio'
import { buildVisualPlan } from '@features/visual'
import { developProjectConcepts, compileProjectConcept } from '@features/creative'
import { goCellularProject, GO_CELLULAR_VIDEO_MEDIA, aud } from '@shared/fixtures/goCellular'
import type { AudioConfig } from '@shared/domain/project'

const concept = developProjectConcepts(goCellularProject, 1)[0]!
const { renderPlan } = compileProjectConcept(goCellularProject, concept.conceptId)
const visualPlan = buildVisualPlan({
  renderPlan,
  brand: goCellularProject.brand,
  media: goCellularProject.media,
  industry: goCellularProject.brief.category,
})

const MUSIC = aud('gc_music', 'fondo.mp3', { durationSec: 8 })
const VOICE = aud('gc_voice', 'locucion.mp3', { durationSec: 4 })

function audioCfg(over: Partial<AudioConfig> = {}): AudioConfig {
  return {
    musicId: null,
    narrationEnabled: false,
    narrationMediaId: null,
    useSourceAudio: false,
    musicVolume: 0.8,
    narrationVolume: 1,
    sourceAudioVolume: 1,
    ...over,
  }
}

function plan(over: Partial<AudioConfig> = {}, extra = [MUSIC, VOICE]) {
  return buildAudioPlan({
    projectId: goCellularProject.id,
    audio: audioCfg(over),
    visualPlan,
    media: [...goCellularProject.media, ...extra],
  })
}

const withMusic = () => audioPlanToCompositionAudio(plan({ musicId: MUSIC.id }))
const withVoice = () =>
  audioPlanToCompositionAudio(
    plan({ musicId: MUSIC.id, narrationEnabled: true, narrationMediaId: VOICE.id }),
  )

describe('composition audio props stay renderable by the real renderer', () => {
  it('is JSON-serializable — inputProps go through JSON on export', () => {
    // Anything not surviving JSON simply does not exist at render time. A fade
    // kept in a side-channel would work in preview and vanish in the export.
    const audio = withVoice()
    expect(JSON.parse(JSON.stringify(audio))).toEqual(audio)
  })

  it('keeps fade lengths ON the track so they survive serialization', () => {
    const audio = withMusic()
    const revived = JSON.parse(JSON.stringify(audio))
    expect(revived.music.fadeInFrames).toBe(audio.music!.fadeInFrames)
    expect(revived.music.fadeOutFrames).toBe(audio.music!.fadeOutFrames)
    expect(audio.music!.fadeInFrames).toBeGreaterThan(0)
  })

  it('carries no functions in the props', () => {
    const audio = withVoice()
    for (const v of Object.values(audio)) expect(typeof v).not.toBe('function')
  })
})

describe('music envelope (fades + ducking) comes from the engine', () => {
  it('is silent at the very first frame and the very last (no click)', () => {
    const audio = withMusic()
    expect(musicVolumeAtFrame(0, audio)).toBe(0)
    expect(musicVolumeAtFrame(audio.totalDurationInFrames - 1, audio)).toBe(0)
  })

  it('rises through the fade-in', () => {
    const audio = withMusic()
    const mid = Math.floor(audio.music!.fadeInFrames / 2)
    expect(musicVolumeAtFrame(mid, audio)).toBeGreaterThan(0)
    expect(musicVolumeAtFrame(mid, audio)).toBeLessThan(audio.music!.volume)
  })

  it('reaches full planned volume in the middle of the commercial', () => {
    const audio = withMusic()
    const middle = Math.floor(audio.totalDurationInFrames / 2)
    expect(musicVolumeAtFrame(middle, audio)).toBeCloseTo(audio.music!.volume, 5)
  })

  it('never exceeds 1 or drops below 0 at any frame', () => {
    const audio = withVoice()
    for (let f = 0; f < audio.totalDurationInFrames; f++) {
      const v = musicVolumeAtFrame(f, audio)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
  })

  it('returns 0 when there is no music', () => {
    const audio = audioPlanToCompositionAudio(plan({}))
    expect(musicVolumeAtFrame(0, audio)).toBe(0)
  })

  it('actually dips the music under narration', () => {
    const audio = withVoice()
    expect(audio.ducking.enabled).toBe(true)
    const duck = audio.ducking.segments[0]!
    // Compare a frame inside the duck window against one well outside it, both
    // clear of the fades so only ducking can explain the difference.
    const inside = Math.floor((duck.fromFrame + duck.toFrame) / 2)
    const outside = audio.totalDurationInFrames - audio.music!.fadeOutFrames - 5
    expect(outside).toBeGreaterThan(duck.toFrame)
    expect(musicVolumeAtFrame(inside, audio)).toBeLessThan(musicVolumeAtFrame(outside, audio))
  })

  it('does not dip when there is no narration', () => {
    const audio = withMusic()
    expect(audio.ducking.enabled).toBe(false)
    const a = Math.floor(audio.totalDurationInFrames * 0.4)
    const b = Math.floor(audio.totalDurationInFrames * 0.5)
    expect(musicVolumeAtFrame(a, audio)).toBeCloseTo(musicVolumeAtFrame(b, audio), 5)
  })
})

describe('preview controls modulate the plan without re-planning it', () => {
  it('master volume scales the mix', () => {
    const half = audioPlanToCompositionAudio(plan({ musicId: MUSIC.id }), { masterVolume: 0.5 })
    const full = withMusic()
    const mid = Math.floor(full.totalDurationInFrames / 2)
    expect(musicVolumeAtFrame(mid, half)).toBeCloseTo(musicVolumeAtFrame(mid, full) * 0.5, 5)
  })

  it('music volume can be overridden', () => {
    const audio = audioPlanToCompositionAudio(plan({ musicId: MUSIC.id }), { musicVolume: 0.2 })
    expect(audio.music!.volume).toBe(0.2)
  })

  it('turning narration off also lifts the duck — music must not dip under silence', () => {
    const audio = audioPlanToCompositionAudio(
      plan({ musicId: MUSIC.id, narrationEnabled: true, narrationMediaId: VOICE.id }),
      { narrationEnabled: false },
    )
    expect(audio.narration).toEqual([])
    expect(audio.ducking.enabled).toBe(false)
    expect(audio.ducking.segments).toEqual([])
  })

  it('source audio can be toggled on and off independently', () => {
    const on = audioPlanToCompositionAudio(plan({}), { sourceAudioEnabled: true })
    expect(on.sourceAudio.enabled).toBe(true)
    expect(on.sourceAudio.volume).toBeGreaterThan(0)
    const off = audioPlanToCompositionAudio(
      plan({ useSourceAudio: true }, [MUSIC, VOICE, ...GO_CELLULAR_VIDEO_MEDIA]),
      { sourceAudioEnabled: false },
    )
    expect(off.sourceAudio.enabled).toBe(false)
    expect(off.sourceAudio.volume).toBe(0)
  })

  it('keeps the plan itself untouched — controls are playback-time only', () => {
    const p = plan({ musicId: MUSIC.id })
    const before = JSON.parse(JSON.stringify(p))
    audioPlanToCompositionAudio(p, { masterVolume: 0.1, musicVolume: 0.1, narrationEnabled: false })
    expect(p).toEqual(before)
  })
})

describe('missing audio warns without breaking the composition', () => {
  it('surfaces an owner-facing warning instead of failing', () => {
    const audio = audioPlanToCompositionAudio(plan({ musicId: 'gone' }, []))
    expect(audio.warnings.length).toBe(1)
    expect(audio.warnings[0]!.role).toBe('music')
    expect(audio.warnings[0]!.message).toMatch(/Música/)
    // Still a usable composition.
    expect(audio.music).toBeNull()
    expect(audio.silent).toBe(true)
  })

  it('has no warnings when nothing was asked for', () => {
    expect(audioPlanToCompositionAudio(plan({})).warnings).toEqual([])
  })
})

describe('the AudioPlan governs source-video audio', () => {
  const props = (audioOver: Partial<AudioConfig>, extra = [MUSIC, VOICE]) =>
    visualPlanToCompositionProps(visualPlan, goCellularProject.id, goCellularProject.media, {
      audio: audioPlanToCompositionAudio(plan(audioOver, extra)),
    })

  it('mutes clips when the plan says source audio is off', () => {
    expect(props({}).audio!.sourceAudio.enabled).toBe(false)
  })

  it('enables clip audio when the plan says so — one source of truth', () => {
    // The picture and the mix must never disagree about source audio.
    expect(
      props({ useSourceAudio: true }, [MUSIC, VOICE, ...GO_CELLULAR_VIDEO_MEDIA]).audio!
        .sourceAudio.enabled,
    ).toBe(true)
  })

  it('a composition with no audio at all is a valid, explicit state', () => {
    const p = visualPlanToCompositionProps(visualPlan, goCellularProject.id, goCellularProject.media)
    expect(p.audio).toBeNull()
  })
})
