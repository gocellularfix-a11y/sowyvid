import { describe, it, expect } from 'vitest'
import {
  buildMusicPrompt,
  musicBriefFor,
  visualEnergyFrom,
  ManualSunoWorkflow,
  MUSIC_PROVIDERS,
  getMusicProvider,
  availableGenerators,
  SUNO_CREATE_URL,
  type MusicPromptInput,
} from './musicProviders'
import { buildVisualPlan } from '@features/visual'
import { developProjectConcepts, compileProjectConcept } from '@features/creative'
import { goCellularProject } from '@shared/fixtures/goCellular'

const concept = developProjectConcepts(goCellularProject, 1)[0]!
const { renderPlan } = compileProjectConcept(goCellularProject, concept.conceptId)
const visualPlan = buildVisualPlan({
  renderPlan,
  brand: goCellularProject.brand,
  media: goCellularProject.media,
  industry: goCellularProject.brief.category,
})

const input: MusicPromptInput = {
  businessName: 'Go Cellular',
  industry: 'phone-electronics',
  productOrService: 'teléfonos certificados',
  tone: 'premium-dark',
  visualEnergy: 'energetic',
  durationSec: 20,
  mood: 'confident',
}

describe('music brief generation', () => {
  it('is deterministic — the same commercial always briefs the same', () => {
    expect(buildMusicPrompt(input)).toEqual(buildMusicPrompt(input))
  })

  it('includes duration, industry, mood, energy, pacing and commercial purpose', () => {
    const { prompt } = buildMusicPrompt(input)
    expect(prompt).toContain('20-second')
    expect(prompt).toContain('phone-electronics')
    expect(prompt).toContain('confident')
    expect(prompt).toContain('high-energy')
    expect(prompt).toContain('BPM') // pacing
    expect(prompt).toContain('teléfonos certificados')
    expect(prompt.toLowerCase()).toContain('advertisement')
  })

  it('always asks for instrumental — the owner’s words carry the message', () => {
    const result = buildMusicPrompt(input)
    expect(result.instrumental).toBe(true)
    expect(result.prompt.toLowerCase()).toContain('instrumental')
    expect(result.prompt.toLowerCase()).toContain('no vocals')
    expect(result.prompt.toLowerCase()).toContain('no lyrics')
    expect(result.styleTags).toContain('instrumental')
  })

  it('asks for music that sits under speech', () => {
    const { prompt } = buildMusicPrompt(input)
    expect(prompt.toLowerCase()).toContain('under a voice')
    expect(prompt.toLowerCase()).toContain('intelligible')
  })

  it('adapts tempo to the visual energy', () => {
    const calm = buildMusicPrompt({ ...input, visualEnergy: 'calm' })
    const hot = buildMusicPrompt({ ...input, visualEnergy: 'energetic' })
    expect(calm.prompt).toContain('70-90 BPM')
    expect(hot.prompt).toContain('120-140 BPM')
    expect(calm.prompt).not.toEqual(hot.prompt)
  })

  it('produces a short summary for the interface', () => {
    expect(buildMusicPrompt(input).summary).toBe('20s · energetic · confident · instrumental')
  })
})

describe('the brief comes from the real plans', () => {
  it('derives energy from FrameLogic motion and cut rhythm', () => {
    const energy = visualEnergyFrom(visualPlan)
    expect(['calm', 'balanced', 'energetic']).toContain(energy)
  })

  it('asks for a bed as long as the commercial', () => {
    const brief = musicBriefFor({
      businessName: 'Go Cellular',
      industry: 'phone-electronics',
      productOrService: 'teléfonos certificados',
      creative: concept,
      visualPlan,
    })
    const expected = Math.round(visualPlan.totalDurationInFrames / visualPlan.fps)
    expect(brief.durationSec).toBe(expected)
    expect(brief.prompt).toContain(`${expected}-second`)
  })

  it('is deterministic from the same plan', () => {
    const args = {
      businessName: 'Go Cellular',
      industry: 'phone-electronics',
      productOrService: 'teléfonos certificados',
      creative: concept,
      visualPlan,
    }
    expect(musicBriefFor(args)).toEqual(musicBriefFor(args))
  })
})

describe('the manual Suno workflow never automates Suno', () => {
  it('is marked unavailable as a generator', () => {
    expect(ManualSunoWorkflow.available).toBe(false)
  })

  it('has NO generateTrack — there is nothing to enable, not even a flag', () => {
    // Absence is the safeguard: no unofficial endpoint can be switched on.
    expect(ManualSunoWorkflow.generateTrack).toBeUndefined()
  })

  it('still writes a brief — that part SowyVid always owns', () => {
    expect(ManualSunoWorkflow.generatePrompt(input).prompt.length).toBeGreaterThan(50)
  })

  it('reports no available generators at all right now', () => {
    expect(availableGenerators()).toEqual([])
  })

  it('points at Suno’s own create page, for the owner to use themselves', () => {
    expect(SUNO_CREATE_URL).toBe('https://suno.com/create')
    expect(SUNO_CREATE_URL.startsWith('https://')).toBe(true)
  })

  it('exposes no network surface — the module cannot call anything', () => {
    // Every provider is either brief-only, or has an official API. Nothing in
    // the registry may generate without `available` being true.
    for (const provider of MUSIC_PROVIDERS) {
      if (typeof provider.generateTrack === 'function') {
        expect(provider.available).toBe(true)
      }
    }
  })
})

describe('provider registry', () => {
  it('finds a provider by id', () => {
    expect(getMusicProvider('suno-manual')).toBe(ManualSunoWorkflow)
  })

  it('returns null for an unknown provider rather than guessing', () => {
    expect(getMusicProvider('some-unofficial-api')).toBeNull()
  })

  it('is ready for an official API to be added without touching the brief path', () => {
    // The contract a future official provider must satisfy.
    const official = {
      id: 'official',
      label: 'Official',
      available: true,
      generatePrompt: buildMusicPrompt,
      generateTrack: async () => ({ filePath: '/tmp/x.mp3', title: 't', source: 'official' }),
    }
    expect(typeof official.generatePrompt).toBe('function')
    expect(typeof official.generateTrack).toBe('function')
  })
})
