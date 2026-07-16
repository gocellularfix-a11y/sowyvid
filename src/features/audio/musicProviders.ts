import type { CreativePlan } from '@jorge-engines/northstar-creative'
import type { VisualPlan } from '@features/visual/visualPlan'

/**
 * Music-generation providers.
 *
 * SowyVid does not generate music. It writes a good BRIEF and hands it to the
 * owner, who creates the track in their own account, on their own terms, and
 * imports the result.
 *
 * ## Why there is no Suno API here
 *
 * Suno has no official public API SowyVid is authorized to use. The available
 * options are unofficial reverse-engineered endpoints and third-party resellers
 * — using either would mean driving the owner's account through an unsanctioned
 * channel, against Suno's terms, with the owner's credentials, and with no
 * stable contract. So `SunoProvider.generateTrack` is deliberately absent, and
 * `available` is permanently false until an official, authorized API exists.
 *
 * This file is the seam that makes that switch a small change: another provider
 * with a real API implements the optional `generateTrack` and everything else —
 * brief generation, import, SoundWeave sync — is unchanged.
 *
 * NOT permitted, by design and by policy:
 *   - automating or scripting Suno's website
 *   - scraping Suno
 *   - unofficial/third-party Suno API services
 */

export interface MusicPromptInput {
  /** What the business is promoting. */
  businessName: string
  industry: string
  productOrService: string
  /** Northstar's creative intent for this commercial. */
  tone: string
  /** FrameLogic's visual energy, so music matches the cut. */
  visualEnergy: 'calm' | 'balanced' | 'energetic'
  /** SoundWeave's timeline: how long the bed must be. */
  durationSec: number
  /** Owner-facing language for the brief text. */
  mood: string
}

export interface MusicPromptResult {
  /** The prompt the owner pastes into the generator. */
  prompt: string
  /** Short style tags, where the tool supports them separately. */
  styleTags: string[]
  /** Human-readable summary shown next to the copy button. */
  summary: string
  /** Always instrumental — narration and the owner's message carry the words. */
  instrumental: true
  durationSec: number
}

export interface MusicGenerationInput extends MusicPromptInput {
  prompt: string
}

export interface GeneratedTrack {
  /** Local path of the produced audio, ready for MediaVault import. */
  filePath: string
  title: string
  /** Where it came from, recorded verbatim as provenance. */
  source: string
}

export interface MusicGenerationProvider {
  id: string
  /** Owner-facing name. */
  label: string
  /**
   * True only when this provider can legitimately generate a track from within
   * SowyVid. Manual providers are always false.
   */
  available: boolean
  /** Every provider can write a brief. This is the part SowyVid always owns. */
  generatePrompt(input: MusicPromptInput): MusicPromptResult
  /**
   * Optional. Present ONLY for providers with an official, authorized API.
   * Its absence is the point for manual workflows.
   */
  generateTrack?(input: MusicGenerationInput): Promise<GeneratedTrack>
}

/** Map FrameLogic's motion profile to a musical energy. */
export function visualEnergyFrom(plan: VisualPlan): MusicPromptInput['visualEnergy'] {
  const zoom = Math.abs(plan.motion.zoomEnd - plan.motion.zoomStart)
  const cutsPerSecond = plan.scenes.length / (plan.totalDurationInFrames / plan.fps)
  if (cutsPerSecond > 0.45 || zoom > 0.12) return 'energetic'
  if (cutsPerSecond < 0.25 && zoom < 0.05) return 'calm'
  return 'balanced'
}

const ENERGY_WORDS: Record<MusicPromptInput['visualEnergy'], string> = {
  calm: 'calm, warm, unhurried',
  balanced: 'confident, steady, upbeat',
  energetic: 'high-energy, punchy, driving',
}

const ENERGY_BPM: Record<MusicPromptInput['visualEnergy'], string> = {
  calm: '70-90 BPM',
  balanced: '95-115 BPM',
  energetic: '120-140 BPM',
}

/**
 * Build the music brief. Deterministic: the same commercial always yields the
 * same prompt, so an owner who regenerates gets a consistent result.
 */
export function buildMusicPrompt(input: MusicPromptInput): MusicPromptResult {
  const energy = ENERGY_WORDS[input.visualEnergy]
  const bpm = ENERGY_BPM[input.visualEnergy]
  const seconds = Math.max(1, Math.round(input.durationSec))

  const styleTags = [
    'instrumental',
    input.visualEnergy,
    input.mood,
    'commercial',
    'advertising background',
  ].filter((t) => t.length > 0)

  // Written in English on purpose: music generators respond best to English
  // prompts, even though SowyVid's interface is Spanish.
  const prompt = [
    `Instrumental background music for a ${seconds}-second ${input.industry} advertisement.`,
    `Mood: ${energy}, ${input.mood}.`,
    `Tone: ${input.tone}.`,
    `Tempo: ${bpm}.`,
    `Purpose: background bed for a short commercial promoting ${input.productOrService}.`,
    `The music must sit UNDER a voice and on-screen text: no vocals, no lyrics, no sudden drops,`,
    `no long silence, and a clean loopable structure with a clear ending.`,
    `Keep the mix light in the midrange so speech stays intelligible.`,
  ].join(' ')

  return {
    prompt,
    styleTags,
    summary: `${seconds}s · ${input.visualEnergy} · ${input.mood} · instrumental`,
    instrumental: true,
    durationSec: seconds,
  }
}

/** Where the owner goes to create the track themselves. */
export const SUNO_CREATE_URL = 'https://suno.com/create'

/**
 * The manual Suno workflow.
 *
 * SowyVid writes the brief and opens Suno. The owner creates and downloads the
 * track under their OWN account, then imports it. SowyVid never touches Suno
 * programmatically.
 */
export const ManualSunoWorkflow: MusicGenerationProvider = {
  id: 'suno-manual',
  label: 'Suno (manual)',
  /**
   * Permanently false until an official, authorized API exists. This is not a
   * feature flag to be flipped on with an unofficial endpoint — `generateTrack`
   * is absent entirely, so there is nothing to enable.
   */
  available: false,
  generatePrompt: buildMusicPrompt,
  // generateTrack is intentionally NOT implemented. See the file header.
}

/**
 * A provider registry, so an official music API can be added later without
 * touching the brief, import or SoundWeave paths.
 */
export const MUSIC_PROVIDERS: MusicGenerationProvider[] = [ManualSunoWorkflow]

export function getMusicProvider(id: string): MusicGenerationProvider | null {
  return MUSIC_PROVIDERS.find((p) => p.id === id) ?? null
}

/** Providers that can actually generate from inside SowyVid right now. */
export function availableGenerators(): MusicGenerationProvider[] {
  return MUSIC_PROVIDERS.filter((p) => p.available && typeof p.generateTrack === 'function')
}

export interface MusicBriefInput {
  businessName: string
  industry: string
  productOrService: string
  creative: CreativePlan
  visualPlan: VisualPlan
  mood?: string
}

/** Northstar intent + FrameLogic energy + SoundWeave duration → a music brief. */
export function musicBriefFor(input: MusicBriefInput): MusicPromptResult {
  const { visualPlan } = input
  return buildMusicPrompt({
    businessName: input.businessName,
    industry: input.industry,
    productOrService: input.productOrService,
    tone: visualPlan.artDirection.name,
    visualEnergy: visualEnergyFrom(visualPlan),
    // The bed must cover the whole commercial — SoundWeave's timeline decides.
    durationSec: visualPlan.totalDurationInFrames / visualPlan.fps,
    mood: input.mood ?? visualPlan.artDirection.name.replace(/-/g, ' '),
  })
}
