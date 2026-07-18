import { nanoid } from 'nanoid'
import {
  CommercialPlan,
  COMMERCIAL_PLAN_VERSION,
  type CommercialRequest,
  type ProductFact,
  type NarrationScene,
  type OverlayCue,
  type CanonicalShotInstruction,
  type VideoGenerationPrompt,
} from '@shared/domain/commercialPlan'
import { parseCommercialRequest } from './intentParser'
import { resolveFacts } from './factResolver'
import { selectSalesAngle } from './salesAngle'
import { planScenes } from './copywriter'
import { buildStoryboard } from './storyboard'
import { buildShotInstruction, buildVideoPrompt } from './videoPrompt'
import { validateCommercialPlanContent } from './validator'

/**
 * CommercialBriefBuilder + orchestrator: turns a request (plus any owner-edited
 * facts) into a validated, fact-safe CommercialPlan. Deterministic copy; ids and
 * timestamps are injectable so regeneration keeps a stable plan id.
 */

export interface BuildPlanOptions {
  /** Owner-edited facts (from the missing-fact UI). Owner-provided, they win. */
  ownerFacts?: readonly ProductFact[]
  /**
   * When true, `ownerFacts` is the COMPLETE, authoritative fact set — the text
   * is not re-parsed for extra facts. Regeneration uses this so REMOVING a fact
   * actually drops it (merging over re-parsed text could never remove one).
   */
  factsAuthoritative?: boolean
  /** Keep an existing plan id across regeneration. */
  id?: string
  /** Deterministic clock for tests/demo. */
  now?: string
  /** Which engine produced this (deterministic fallback vs an AI provider). */
  generatedBy?: string
}

const AUDIENCE: Record<string, { es: string; en: string }> = {
  phone: { es: 'Personas que buscan un buen teléfono a un precio justo', en: 'People looking for a good phone at a fair price' },
  service: { es: 'Clientes locales que necesitan un servicio confiable', en: 'Local customers who need a reliable service' },
  default: { es: 'Clientes locales interesados en tu producto', en: 'Local customers interested in your product' },
}

const DEFAULT_ASPECT = '9:16'

export function buildCommercialPlan(request: CommercialRequest, options: BuildPlanOptions = {}): CommercialPlan {
  const { intent, ownerFacts: parsedFacts } = parseCommercialRequest(request)

  // Owner-edited facts win, by key. Authoritative mode (regeneration) replaces
  // the parsed set entirely so a removed fact is truly gone; additive mode
  // (initial build) layers owner edits on top of what the text stated.
  const mergedByKey = new Map<string, ProductFact>()
  if (!options.factsAuthoritative) for (const f of parsedFacts) mergedByKey.set(f.key, f)
  for (const f of options.ownerFacts ?? []) mergedByKey.set(f.key, { ...f, source: 'owner_provided', claimable: true })
  const ownerFacts = [...mergedByKey.values()]

  const resolved = resolveFacts(intent, ownerFacts, request.locale)
  const angle = selectSalesAngle(intent, resolved.knownFacts)
  const planned = planScenes(intent.product, angle, resolved, request.locale)
  const storyboard = buildStoryboard(planned)

  const narrationScenes: NarrationScene[] = planned.map((s) => {
    const story = storyboard.find((b) => b.sceneId === s.id)!
    return {
      sceneId: s.id,
      role: s.role,
      visualPurpose: s.visualPurpose,
      spokenText: s.spoken,
      overlayText: s.overlay,
      targetDurationSec: s.durationSec,
      sourceFactKeys: s.sourceFactKeys,
      localMediaSuitable: story.mediaPlan !== 'generated-video',
      generatedVideoRequired: story.mediaPlan === 'generated-video',
      generationReason: story.generationReason,
    }
  })

  const overlayCues: OverlayCue[] = planned
    .filter((s) => s.overlay.trim().length > 0)
    .map((s) => ({ sceneId: s.id, role: s.overlayRole, text: s.overlay }))

  const shotInstructions: CanonicalShotInstruction[] = []
  const videoPrompts: VideoGenerationPrompt[] = []
  for (const b of storyboard) {
    if (b.mediaPlan !== 'generated-video') continue
    const shot = buildShotInstruction(b, intent.product, DEFAULT_ASPECT)
    shotInstructions.push(shot)
    videoPrompts.push(buildVideoPrompt(shot, DEFAULT_ASPECT))
  }

  const offerScene = planned.find((s) => s.role === 'offer')
  const ctaScene = planned.find((s) => s.role === 'cta')
  const audience = (AUDIENCE[intent.product.category] ?? AUDIENCE.default!)[request.locale]
  const durationTarget = planned.reduce((sum, s) => sum + s.durationSec, 0)

  const content = validateCommercialPlanContent({
    product: intent.product,
    knownFacts: resolved.knownFacts,
    narrationScenes,
    overlayCues,
    selectedAngle: angle,
    cta: ctaScene?.spoken ?? '',
  })

  const now = options.now ?? new Date().toISOString()
  const warnings: string[] = [...content.warnings]
  if (resolved.missingFacts.some((m) => m.importance === 'high')) {
    warnings.push(request.locale === 'es'
      ? 'Faltan datos importantes (como el precio). Complétalos para un comercial más fuerte.'
      : 'Some important facts are missing (like price). Add them for a stronger commercial.')
  }

  return CommercialPlan.parse({
    planVersion: COMMERCIAL_PLAN_VERSION,
    id: options.id ?? `cplan_${nanoid(10)}`,
    request,
    locale: request.locale,
    product: intent.product,
    knownFacts: resolved.knownFacts,
    missingFacts: resolved.missingFacts,
    assumptions: resolved.assumptions,
    objective: intent.objective,
    targetAudience: audience,
    selectedAngle: angle,
    durationTarget,
    narrationScenes,
    overlayCues,
    storyboardScenes: storyboard,
    shotInstructions,
    videoPrompts,
    offer: offerScene?.spoken ?? '',
    cta: ctaScene?.spoken ?? (request.locale === 'es' ? 'Ven hoy.' : 'Come by today.'),
    warnings,
    validationStatus: content.status,
    generatedBy: options.generatedBy ?? 'deterministic',
    createdAt: now,
    updatedAt: now,
  })
}
