import { describe, it, expect } from 'vitest'
import { buildAudioPlan, sceneWindowsFrom } from './soundWeaveAdapter'
import { validateAudioPlan, planHasAudio, AudioPlanSchema } from './audioPlan'
import { buildVisualPlan } from '@features/visual'
import { developProjectConcepts, compileProjectConcept } from '@features/creative'
import { goCellularProject, aud } from '@shared/fixtures/goCellular'
import type { Project } from '@shared/domain/project'
import type { MediaAsset } from '@shared/domain/media'
import type { AudioConfig } from '@shared/domain/project'

function planFor(project: Project) {
  const concept = developProjectConcepts(project, 1)[0]!
  const { renderPlan } = compileProjectConcept(project, concept.conceptId)
  return buildVisualPlan({
    renderPlan,
    brand: project.brand,
    media: project.media,
    industry: project.brief.category,
  })
}

const visualPlan = planFor(goCellularProject)

const MUSIC = aud('gc_music', 'fondo.mp3', { durationSec: 8 })
const LONG_MUSIC = aud('gc_music_long', 'largo.mp3', { durationSec: 600 })
const VOICE = aud('gc_voice', 'locucion.mp3', { durationSec: 4 })

function audioCfg(over: Partial<AudioConfig> = {}): AudioConfig {
  return {
    musicId: null,
    narrationEnabled: false,
    narrationMediaId: null,
    useSourceAudio: false,
    musicVolume: 0.8,
    narrationVolume: 1,
    ...over,
  }
}

function build(audio: Partial<AudioConfig>, media: MediaAsset[] = []) {
  return buildAudioPlan({
    projectId: goCellularProject.id,
    audio: audioCfg(audio),
    visualPlan,
    media: [...goCellularProject.media, ...media],
  })
}

describe('scene windows are frame-exact with the picture', () => {
  it('derives seconds from the VisualPlan frame counts', () => {
    const windows = sceneWindowsFrom(visualPlan)
    expect(windows.length).toBe(visualPlan.scenes.length)
    windows.forEach((w, i) => {
      const scene = visualPlan.scenes[i]!
      expect(w.id).toBe(scene.id)
      expect(w.durationSeconds).toBeCloseTo(scene.durationInFrames / visualPlan.fps, 10)
    })
  })

  it('round-trips through SoundWeave without drifting from the picture', () => {
    // SoundWeave recomputes round(seconds x fps); converting FROM frames means
    // sound and picture cannot disagree by a rounding error.
    const plan = build({ musicId: MUSIC.id }, [MUSIC])
    expect(plan.totalDurationInFrames).toBe(visualPlan.totalDurationInFrames)
    expect(plan.music!.endFrame).toBe(visualPlan.totalDurationInFrames)
  })
})

describe('AudioPlan carries what SoundWeave cannot', () => {
  it('records the engine that decided the timing', () => {
    const plan = build({ musicId: MUSIC.id }, [MUSIC])
    expect(plan.audioEngineName).toBe('@jorge-engines/soundweave-audio')
    expect(plan.audioEngineVersion).toBe('1.0.0')
  })

  it('validates against the schema and is JSON-serializable for persistence', () => {
    const plan = build({ musicId: MUSIC.id }, [MUSIC])
    expect(validateAudioPlan(plan).ok).toBe(true)
    expect(JSON.parse(JSON.stringify(plan))).toEqual(plan)
  })

  it('is deterministic — same inputs, identical plan', () => {
    const a = build({ musicId: MUSIC.id }, [MUSIC])
    const b = build({ musicId: MUSIC.id }, [MUSIC])
    expect(a).toEqual(b)
  })
})

describe('music track', () => {
  it('plays across the whole timeline at the owner-chosen volume', () => {
    const plan = build({ musicId: MUSIC.id, musicVolume: 0.5 }, [MUSIC])
    expect(plan.music).not.toBeNull()
    expect(plan.music!.role).toBe('music')
    expect(plan.music!.assetId).toBe(MUSIC.id)
    expect(plan.music!.startFrame).toBe(0)
    expect(plan.music!.endFrame).toBe(plan.totalDurationInFrames)
    expect(plan.music!.volume).toBe(0.5)
    expect(plan.silent).toBe(false)
    expect(planHasAudio(plan)).toBe(true)
  })

  it('reaches audio only through the controlled protocol — never a filesystem path', () => {
    const plan = build({ musicId: MUSIC.id }, [MUSIC])
    expect(plan.music!.url).toBe(
      `sowyvid-media://asset/${goCellularProject.id}/${MUSIC.id}/original`,
    )
    expect(plan.music!.url).not.toMatch(/^file:/)
    expect(plan.music!.url).not.toMatch(/[A-Za-z]:\\/)
  })

  it('loops music shorter than the commercial', () => {
    // 8s of music under a ~20s commercial.
    const plan = build({ musicId: MUSIC.id }, [MUSIC])
    expect(plan.music!.loop).toBe(true)
  })

  it('does not loop music longer than the commercial — there is nothing to repeat', () => {
    const plan = build({ musicId: LONG_MUSIC.id }, [LONG_MUSIC])
    expect(plan.music!.loop).toBe(false)
  })

  it('fades in and out', () => {
    const plan = build({ musicId: MUSIC.id }, [MUSIC])
    expect(plan.music!.fadeInFrames).toBeGreaterThan(0)
    expect(plan.music!.fadeOutFrames).toBeGreaterThan(0)
  })

  it('keeps fades from overlapping — they never exceed half the timeline each', () => {
    const plan = build({ musicId: MUSIC.id }, [MUSIC])
    const half = plan.totalDurationInFrames / 2
    expect(plan.music!.fadeInFrames).toBeLessThanOrEqual(half)
    expect(plan.music!.fadeOutFrames).toBeLessThanOrEqual(half)
  })
})

describe('missing tracks are reported, not silently dropped', () => {
  it('records a selected-but-deleted music track', () => {
    // SoundWeave alone would just return null here, indistinguishable from
    // "no music requested" — the whole reason SowyVid resolves assets itself.
    const plan = build({ musicId: 'gc_music_gone' }, [])
    expect(plan.music).toBeNull()
    expect(plan.missingTracks).toEqual([
      { role: 'music', assetId: 'gc_music_gone', reason: 'not-found' },
    ])
    expect(plan.silent).toBe(true)
    expect(validateAudioPlan(plan).ok).toBe(true) // still a VALID plan
  })

  it('records a music reference that points at a non-audio asset', () => {
    const plan = build({ musicId: 'gc_store' }, [])
    expect(plan.missingTracks[0]!.reason).toBe('not-audio')
  })

  it('records an invalid audio asset', () => {
    const broken = aud('gc_broken', 'roto.mp3', { durationSec: 8, valid: false })
    const plan = build({ musicId: broken.id }, [broken])
    expect(plan.missingTracks[0]!.reason).toBe('invalid')
  })

  it('records narration switched on with nothing chosen — no TTS can conjure one', () => {
    const plan = build({ narrationEnabled: true, narrationMediaId: null })
    expect(plan.narration).toEqual([])
    expect(plan.missingTracks).toEqual([
      { role: 'narration', assetId: null, reason: 'not-selected' },
    ])
  })

  it('reports nothing missing when nothing was asked for', () => {
    const plan = build({})
    expect(plan.missingTracks).toEqual([])
    expect(plan.silent).toBe(true)
  })
})

describe('narration and ducking', () => {
  const withVoice = () => build({ musicId: MUSIC.id, narrationEnabled: true, narrationMediaId: VOICE.id }, [MUSIC, VOICE])

  it('places imported narration on the timeline', () => {
    const plan = withVoice()
    expect(plan.narration.length).toBe(1)
    expect(plan.narration[0]!.role).toBe('narration')
    expect(plan.narration[0]!.assetId).toBe(VOICE.id)
    expect(plan.narration[0]!.startFrame).toBe(0)
  })

  it('ducks music under narration', () => {
    const plan = withVoice()
    expect(plan.ducking.enabled).toBe(true)
    expect(plan.ducking.amount).toBeGreaterThan(0)
    expect(plan.ducking.rampFrames).toBeGreaterThan(0)
    expect(plan.ducking.segments.length).toBeGreaterThan(0)
  })

  it('keeps duck windows inside the timeline', () => {
    const plan = withVoice()
    for (const seg of plan.ducking.segments) {
      expect(seg.fromFrame).toBeGreaterThanOrEqual(0)
      expect(seg.toFrame).toBeLessThanOrEqual(plan.totalDurationInFrames)
      expect(seg.toFrame).toBeGreaterThan(seg.fromFrame)
    }
  })

  it('does not duck without narration', () => {
    const plan = build({ musicId: MUSIC.id }, [MUSIC])
    expect(plan.ducking.enabled).toBe(false)
    expect(plan.ducking.amount).toBe(0)
    expect(plan.ducking.segments).toEqual([])
  })

  it('does not duck without music', () => {
    const plan = build({ narrationEnabled: true, narrationMediaId: VOICE.id }, [VOICE])
    expect(plan.narration.length).toBe(1)
    expect(plan.ducking.enabled).toBe(false)
  })

  it('ignores narration audio when narration is switched off', () => {
    const plan = build({ narrationEnabled: false, narrationMediaId: VOICE.id }, [VOICE])
    expect(plan.narration).toEqual([])
    expect(plan.missingTracks).toEqual([])
  })
})

describe('source-video audio policy', () => {
  it('is off by default', () => {
    const plan = build({})
    expect(plan.sourceAudio).toEqual({ enabled: false, volume: 0 })
  })

  it('turns on only when the owner asks', () => {
    const plan = build({ useSourceAudio: true })
    expect(plan.sourceAudio.enabled).toBe(true)
    expect(plan.sourceAudio.volume).toBeGreaterThan(0)
    // Source audio alone still counts as audible.
    expect(plan.silent).toBe(false)
  })
})

describe('no track may outlive the picture', () => {
  it('clamps every track to the timeline', () => {
    const plan = build(
      { musicId: LONG_MUSIC.id, narrationEnabled: true, narrationMediaId: aud('v2', 'v.mp3', { durationSec: 600 }).id },
      [LONG_MUSIC, aud('v2', 'v.mp3', { durationSec: 600 })],
    )
    const all = [plan.music, ...plan.narration, ...plan.effects].filter((t) => t !== null)
    expect(all.length).toBeGreaterThan(0)
    for (const t of all) {
      expect(t!.endFrame).toBeLessThanOrEqual(plan.totalDurationInFrames)
      expect(t!.endFrame).toBeGreaterThan(t!.startFrame)
    }
  })
})

describe('the schema refuses plans that lie', () => {
  const good = () => build({ musicId: MUSIC.id }, [MUSIC])

  it('rejects a track running past the timeline', () => {
    const bad = { ...good(), music: { ...good().music!, endFrame: 99_999 } }
    expect(AudioPlanSchema.safeParse(bad).success).toBe(false)
  })

  it('rejects silent=true when audible tracks exist', () => {
    expect(AudioPlanSchema.safeParse({ ...good(), silent: true }).success).toBe(false)
  })

  it('rejects silent=false when nothing is audible', () => {
    const empty = build({})
    expect(AudioPlanSchema.safeParse({ ...empty, silent: false }).success).toBe(false)
  })

  it('rejects ducking without narration', () => {
    const bad = {
      ...good(),
      ducking: { enabled: true, amount: 0.6, rampFrames: 9, segments: [{ fromFrame: 0, toFrame: 10 }] },
    }
    expect(AudioPlanSchema.safeParse(bad).success).toBe(false)
  })

  it('rejects a mismatched track role', () => {
    const bad = { ...good(), music: { ...good().music!, role: 'effect' as const } }
    expect(AudioPlanSchema.safeParse(bad).success).toBe(false)
  })
})
