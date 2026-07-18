import type {
  StoryboardScene,
  ProductIdentity,
  CanonicalShotInstruction,
  VideoGenerationPrompt,
  Locale,
} from '@shared/domain/commercialPlan'

/**
 * VideoPromptAdapter — provider-NEUTRAL shot instructions and image-to-video
 * prompts. It never mentions any provider and never asks the generator to add
 * captions, price, specs, logos or branding — SowyVid adds those locally. The
 * shot preserves the exact source product and lasts ~4s with no generated audio.
 *
 * `ViduPromptAdapter` maps a canonical shot to a Vidu-ready prompt STRING only;
 * it knows nothing of Vidu's API shapes (that lives behind the provider layer).
 */

/** Things the generator must never do — the whole safety of image-to-video. */
export const FORBIDDEN: string[] = [
  'no on-screen text or captions',
  'no price or numbers',
  'no specifications text',
  'no invented logos or branding changes',
  'do not replace or change the product',
  'no severe deformation',
  'no extra or unrealistic hands',
  'no scene replacement',
  'no generated audio',
]

const NEGATIVE_PROMPT = FORBIDDEN.join(', ')

export function buildShotInstruction(
  scene: StoryboardScene,
  product: ProductIdentity,
  aspect: string,
): CanonicalShotInstruction {
  const vertical = aspect === '9:16'
  return {
    sceneId: scene.sceneId,
    subject: `The exact product from the source image: ${product.displayName}`,
    action: 'the product rests or is gently held; subtle, realistic motion only',
    camera: 'slow subtle push-in or gentle parallax; steady, no fast moves',
    lighting: 'clean, controlled studio-style lighting; realistic reflections',
    composition: vertical ? 'vertical social framing, product centered' : 'balanced framing, product centered',
    materials: 'true-to-source materials and colors; realistic glass and metal',
    durationSec: 4,
    preserveSource: true,
    avoid: FORBIDDEN,
  }
}

export function buildVideoPrompt(shot: CanonicalShotInstruction, aspect: string): VideoGenerationPrompt {
  const prompt = [
    shot.subject + '.',
    shot.action + '.',
    `${shot.camera}. ${shot.lighting}. ${shot.composition}. ${shot.materials}.`,
    'Keep the product identical to the source image; photorealistic, high fidelity.',
  ].join(' ')
  return {
    sceneId: shot.sceneId,
    prompt,
    negativePrompt: NEGATIVE_PROMPT,
    durationSec: shot.durationSec,
    aspect,
    audio: false,
    requiresSourceImage: true,
  }
}

/** A Vidu-ready prompt string (text only). No API knowledge here. */
export function toViduPrompt(prompt: VideoGenerationPrompt, locale: Locale): {
  prompt: string
  negativePrompt: string
  durationSec: number
  aspect: string
} {
  // The provider adapter later maps duration/aspect/model to Vidu params; this
  // only shapes the human-readable prompt. Locale kept for future tuning.
  void locale
  return {
    prompt: prompt.prompt,
    negativePrompt: prompt.negativePrompt,
    durationSec: prompt.durationSec,
    aspect: prompt.aspect,
  }
}
