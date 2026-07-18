import { z } from 'zod'
import type { CommercialPlan, ProductFact, SalesAngle } from '@shared/domain/commercialPlan'
import { SalesAngle as SalesAngleSchema, SceneRole } from '@shared/domain/commercialPlan'
import { scanUnsupportedClaims } from './validator'
import { validateCommercialPlanContent } from './validator'
import { PRICE_ANGLES, PROMO_ANGLES } from './salesAngle'
import { hasClaimableFact } from './factResolver'

/**
 * PromptGate — the provider-neutral text-AI boundary.
 *
 * A `TextAIProvider` receives ONLY a sanitized `CreativeRequest` (text context,
 * never media/paths/keys/records) and returns a strict, Zod-parsed `AIProposal`.
 * The proposal may improve wording/structure but can NEVER mint a product fact:
 * `applyProposal` runs every proposed line through the fact-safety validator and
 * repairs or rejects anything unsupported — a partially invalid plan is never
 * applied. When no provider is available/enabled, the DeterministicFallback
 * keeps SowyVid fully usable.
 */

/** The EXACT shape sent to a provider — text only. This is the privacy preview. */
export const CreativeRequest = z.object({
  requestText: z.string(),
  locale: z.enum(['es', 'en']),
  product: z.string(),
  objective: z.string(),
  /** Claimable facts as "Label: value" strings only — no ids, no sources. */
  knownFacts: z.array(z.string()),
  /** Labels of facts the owner has not provided. */
  missingFacts: z.array(z.string()),
})
export type CreativeRequest = z.infer<typeof CreativeRequest>

/** Strict structured AI output. Parsed through Zod; extra keys are stripped. */
export const AIProposalNarration = z.object({
  role: SceneRole,
  spoken: z.string().max(240),
  overlay: z.string().max(120),
})
export const AIProposal = z.object({
  concept: z.string().max(400).optional(),
  hook: z.string().max(240).optional(),
  objective: z.string().max(120).optional(),
  targetAudience: z.string().max(200).optional(),
  tone: z.string().max(120).optional(),
  salesAngle: SalesAngleSchema.optional(),
  narration: z.array(AIProposalNarration).max(12).default([]),
  assumptions: z.array(z.string().max(200)).max(8).default([]),
  avoid: z.array(z.string().max(120)).max(12).default([]),
})
export type AIProposal = z.infer<typeof AIProposal>

/**
 * Build the sanitized request from a plan. NEVER includes media, filesystem
 * paths, keys, records, export history, or unrelated metadata.
 */
export function sanitizeCreativeRequest(plan: CommercialPlan): CreativeRequest {
  return CreativeRequest.parse({
    requestText: plan.request.text,
    locale: plan.locale,
    product: plan.product.displayName,
    objective: plan.objective,
    knownFacts: plan.knownFacts.filter((f) => f.claimable).map((f) => `${f.label}: ${f.value}`),
    missingFacts: plan.missingFacts.map((m) => m.label),
  })
}

export interface TextAIProvider {
  id: string
  /** Owner-facing label. */
  label: string
  /** True only when a real, authorized call can be made right now. */
  available: boolean
  /** Receives ONLY the sanitized request; returns a strict proposal. */
  propose(request: CreativeRequest): Promise<AIProposal>
}

/**
 * The deterministic fallback masquerading as a provider: it proposes nothing new
 * (the deterministic plan already exists), so applying it is a no-op. Present so
 * the pipeline always has a working provider and the UI can offer "sin AI".
 */
export const DeterministicFallbackProvider: TextAIProvider = {
  id: 'deterministic',
  label: 'Sin AI (versión automática)',
  available: true,
  propose: (): Promise<AIProposal> => Promise.resolve(AIProposal.parse({})),
}

const REGISTRY = new Map<string, TextAIProvider>([[DeterministicFallbackProvider.id, DeterministicFallbackProvider]])

/** Register a real provider (done in the main process once a key exists). */
export function registerTextAIProvider(provider: TextAIProvider): void {
  REGISTRY.set(provider.id, provider)
}
export function getTextAIProvider(id: string): TextAIProvider | null {
  return REGISTRY.get(id) ?? null
}
export function availableTextAIProviders(): TextAIProvider[] {
  return [...REGISTRY.values()].filter((p) => p.available && p.id !== 'deterministic')
}

export interface ApplyProposalResult {
  plan: CommercialPlan
  accepted: boolean
  /** True when unsafe content was found and stripped before applying. */
  repaired: boolean
  removedClaims: string[]
}

function angleIsHonest(angle: SalesAngle, facts: readonly ProductFact[]): boolean {
  if (PRICE_ANGLES.has(angle) && !hasClaimableFact(facts, 'price')) return false
  if (PROMO_ANGLES.has(angle) && !hasClaimableFact(facts, 'promotion')) return false
  return true
}

/**
 * Merge an AI proposal into a base plan WITHOUT ever letting it introduce a
 * product claim. Each proposed line replaces the matching scene's wording only
 * if it is fact-safe; otherwise the deterministic wording is kept (repair). The
 * merged plan is re-validated and returned only if valid — never partially.
 */
export function applyProposal(basePlan: CommercialPlan, proposal: AIProposal): ApplyProposalResult {
  const facts = basePlan.knownFacts
  const removedClaims: string[] = []
  let repaired = false

  const byRole = new Map<string, { spoken: string; overlay: string }>()
  for (const n of proposal.narration) {
    const unsafe = scanUnsupportedClaims(`${n.spoken} ${n.overlay}`, facts)
    if (unsafe.length > 0) {
      removedClaims.push(...unsafe)
      repaired = true
      continue // drop this line; keep the deterministic scene wording
    }
    if (!byRole.has(n.role)) byRole.set(n.role, { spoken: n.spoken, overlay: n.overlay })
  }

  const narrationScenes = basePlan.narrationScenes.map((s) => {
    const repl = byRole.get(s.role)
    return repl ? { ...s, spokenText: repl.spoken, overlayText: repl.overlay } : s
  })
  const overlayCues = basePlan.overlayCues.map((c) => {
    const scene = narrationScenes.find((s) => s.sceneId === c.sceneId)
    return scene ? { ...c, text: scene.overlayText } : c
  })

  const selectedAngle = proposal.salesAngle && angleIsHonest(proposal.salesAngle, facts)
    ? proposal.salesAngle
    : basePlan.selectedAngle

  const ctaScene = narrationScenes.find((s) => s.role === 'cta')
  const content = validateCommercialPlanContent({
    product: basePlan.product,
    knownFacts: facts,
    narrationScenes,
    overlayCues,
    selectedAngle,
    cta: ctaScene?.spokenText ?? basePlan.cta,
  })

  if (content.status === 'invalid') {
    // Never apply a partially invalid plan — fall back to the deterministic one.
    return { plan: basePlan, accepted: false, repaired, removedClaims }
  }

  const merged: CommercialPlan = {
    ...basePlan,
    narrationScenes,
    overlayCues,
    selectedAngle,
    assumptions: proposal.assumptions.length > 0 ? proposal.assumptions : basePlan.assumptions,
    targetAudience: proposal.targetAudience ?? basePlan.targetAudience,
    cta: ctaScene?.spokenText ?? basePlan.cta,
    warnings: [...content.warnings, ...(repaired ? [basePlan.locale === 'es' ? 'Se quitaron afirmaciones sin respaldo de la propuesta de AI.' : 'Unsupported claims were removed from the AI proposal.'] : [])],
    validationStatus: content.status,
    generatedBy: 'ai-assisted',
    updatedAt: basePlan.updatedAt,
  }
  return { plan: merged, accepted: true, repaired, removedClaims }
}
