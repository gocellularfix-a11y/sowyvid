import { z } from 'zod'

/**
 * The canonical, fact-safe Commercial Plan — the validated contract produced by
 * the provider-neutral Commercial Prompter (see `src/features/prompter`). It is
 * the boundary between "what the owner asked for" and the downstream creative
 * pipeline (Northstar → FrameLogic → SoundWeave → Remotion).
 *
 * ## Fact safety is the load-bearing idea
 *
 * SowyVid must NEVER invent product specifications, price, promotions, warranty,
 * stock, accessories or variant. Every claimable statement is traceable to a
 * `ProductFact` whose `source` is one of the three trusted classes. AI (when
 * enabled) may improve wording and structure but can never mint a product fact —
 * the validator strips any claim not backed by a claimable fact.
 */

export const COMMERCIAL_PLAN_VERSION = 1 as const

export const Locale = z.enum(['es', 'en'])
export type Locale = z.infer<typeof Locale>

/** Where a fact came from. Only the first three may appear as product CLAIMS. */
export const FactSource = z.enum([
  'owner_provided', // the owner typed it — always wins
  'inventory_provided', // from a connected inventory/catalog record
  'verified_catalog', // verified for the EXACT model + regional variant
  'inferred_noncritical', // generic positioning only, never a technical claim
  'unknown',
])
export type FactSource = z.infer<typeof FactSource>

/** The three sources SowyVid may state as factual product claims. */
export const CLAIMABLE_SOURCES: ReadonlySet<FactSource> = new Set<FactSource>([
  'owner_provided',
  'inventory_provided',
  'verified_catalog',
])
export function isClaimable(source: FactSource): boolean {
  return CLAIMABLE_SOURCES.has(source)
}

export const FactConfidence = z.enum(['high', 'medium', 'low'])
export type FactConfidence = z.infer<typeof FactConfidence>

/** A single product fact. `key` is a stable slug (price, storage, condition, …). */
export const ProductFact = z.object({
  key: z.string().min(1),
  /** Owner-facing label, localized. */
  label: z.string().min(1),
  /** The value verbatim as stated/derived, e.g. "$179", "128 GB", "nuevo". */
  value: z.string().min(1),
  source: FactSource,
  confidence: FactConfidence,
  /** True only when `source` is claimable — precomputed for the validator/UI. */
  claimable: z.boolean(),
})
export type ProductFact = z.infer<typeof ProductFact>

/** A fact the commercial would benefit from but the owner has not supplied. */
export const MissingFact = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  /** Short owner-facing prompt (localized) shown as an optional field. */
  prompt: z.string().min(1),
  importance: z.enum(['high', 'medium', 'low']),
})
export type MissingFact = z.infer<typeof MissingFact>

export const ProductCategory = z.enum(['phone', 'electronics', 'service', 'product', 'food', 'other'])
export type ProductCategory = z.infer<typeof ProductCategory>

export const ProductIdentity = z.object({
  /** Owner-facing display name, e.g. "Samsung A16". */
  displayName: z.string().min(1),
  brand: z.string().default(''),
  model: z.string().default(''),
  variant: z.string().default(''),
  category: ProductCategory.default('other'),
  /** The raw text the owner wrote that named the product. */
  rawText: z.string().default(''),
})
export type ProductIdentity = z.infer<typeof ProductIdentity>

export const CommercialObjective = z.enum([
  'product-promotion',
  'limited-time-sale',
  'same-day-service',
  'new-arrival',
  'business-introduction',
  'upgrade',
])
export type CommercialObjective = z.infer<typeof CommercialObjective>

export const SalesAngle = z.enum([
  'value',
  'affordability',
  'premium',
  'reliability',
  'convenience',
  'same_day_service',
  'limited_offer',
  'product_feature',
  'upgrade',
  'problem_solution',
])
export type SalesAngle = z.infer<typeof SalesAngle>

/** The owner's original request. */
export const CommercialRequest = z.object({
  text: z.string().min(1),
  locale: Locale.default('es'),
})
export type CommercialRequest = z.infer<typeof CommercialRequest>

/** What the intent parser detected from the request. */
export const DetectedIntent = z.object({
  product: ProductIdentity,
  objective: CommercialObjective,
  hasPrice: z.boolean(),
  hasPromotion: z.boolean(),
  hasAvailability: z.boolean(),
})
export type DetectedIntent = z.infer<typeof DetectedIntent>

/** The narrative role a scene plays in the commercial progression. */
export const SceneRole = z.enum(['hook', 'need', 'solution', 'benefit', 'offer', 'trust', 'cta'])
export type SceneRole = z.infer<typeof SceneRole>

/** How a scene is intended to be filled with picture. */
export const MediaPlan = z.enum(['owner-photo', 'owner-video', 'generated-video', 'text-only'])
export type MediaPlan = z.infer<typeof MediaPlan>

export const NarrationScene = z.object({
  sceneId: z.string().min(1),
  role: SceneRole,
  visualPurpose: z.string(),
  /** Spoken line — speakable within the scene's duration. */
  spokenText: z.string(),
  /** Concise on-screen text for this scene. */
  overlayText: z.string(),
  targetDurationSec: z.number().positive(),
  /** Fact keys this scene's claims rely on (traceability). Empty when generic. */
  sourceFactKeys: z.array(z.string()).default([]),
  localMediaSuitable: z.boolean(),
  generatedVideoRequired: z.boolean(),
  /** Why external video was recommended, when it was. */
  generationReason: z.string().nullable().default(null),
})
export type NarrationScene = z.infer<typeof NarrationScene>

/** On-screen text cue mapped to a scene + text role (for the layout editor). */
export const OverlayCue = z.object({
  sceneId: z.string().min(1),
  role: z.enum(['headline', 'subtitle', 'offer', 'cta', 'business-name']),
  text: z.string(),
})
export type OverlayCue = z.infer<typeof OverlayCue>

export const StoryboardScene = z.object({
  sceneId: z.string().min(1),
  order: z.number().int().nonnegative(),
  role: SceneRole,
  visualPurpose: z.string(),
  mediaPlan: MediaPlan,
  /** Owner-facing hint for what local photo/video to use, when applicable. */
  localMediaInstruction: z.string().nullable().default(null),
  generationReason: z.string().nullable().default(null),
  durationSec: z.number().positive(),
})
export type StoryboardScene = z.infer<typeof StoryboardScene>

/** Provider-NEUTRAL shot instruction (never mentions Vidu/any provider). */
export const CanonicalShotInstruction = z.object({
  sceneId: z.string().min(1),
  subject: z.string(),
  action: z.string(),
  camera: z.string(),
  lighting: z.string(),
  composition: z.string(),
  materials: z.string(),
  durationSec: z.number().positive(),
  /** The source product must be preserved, not reinvented. */
  preserveSource: z.literal(true),
  /** Things the generator must NOT do (text/branding/deformation/etc.). */
  avoid: z.array(z.string()),
})
export type CanonicalShotInstruction = z.infer<typeof CanonicalShotInstruction>

/** A provider-neutral image-to-video prompt derived from a shot instruction. */
export const VideoGenerationPrompt = z.object({
  sceneId: z.string().min(1),
  prompt: z.string().min(1),
  negativePrompt: z.string().min(1),
  durationSec: z.number().positive(),
  aspect: z.string(),
  /** Generated audio is never used. */
  audio: z.literal(false),
  /** The owner must select a real local image of the exact product. */
  requiresSourceImage: z.literal(true),
})
export type VideoGenerationPrompt = z.infer<typeof VideoGenerationPrompt>

export const ValidationStatus = z.enum(['valid', 'valid_with_warnings', 'invalid'])
export type ValidationStatus = z.infer<typeof ValidationStatus>

export const CommercialPlan = z.object({
  planVersion: z.literal(COMMERCIAL_PLAN_VERSION),
  id: z.string().min(1),
  request: CommercialRequest,
  locale: Locale,
  product: ProductIdentity,
  knownFacts: z.array(ProductFact).default([]),
  missingFacts: z.array(MissingFact).default([]),
  /** Generic, non-technical positioning statements (never product claims). */
  assumptions: z.array(z.string()).default([]),
  objective: CommercialObjective,
  targetAudience: z.string(),
  selectedAngle: SalesAngle,
  durationTarget: z.number().positive(),
  narrationScenes: z.array(NarrationScene).min(1),
  overlayCues: z.array(OverlayCue).default([]),
  storyboardScenes: z.array(StoryboardScene).min(1),
  shotInstructions: z.array(CanonicalShotInstruction).default([]),
  videoPrompts: z.array(VideoGenerationPrompt).default([]),
  offer: z.string().default(''),
  cta: z.string().min(1),
  warnings: z.array(z.string()).default([]),
  validationStatus: ValidationStatus,
  /** Which engine produced this plan — deterministic fallback or an AI provider. */
  generatedBy: z.string().default('deterministic'),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
export type CommercialPlan = z.infer<typeof CommercialPlan>

/** A single validation violation with a stable code for the UI/logs. */
export const PlanViolation = z.object({
  code: z.enum([
    'unsupported-claim',
    'price-angle-without-price',
    'promo-angle-without-promotion',
    'empty-narration',
    'name-over-repeated',
    'fact-not-traceable',
    'missing-cta',
  ]),
  message: z.string(),
  sceneId: z.string().nullable().default(null),
  factKey: z.string().nullable().default(null),
})
export type PlanViolation = z.infer<typeof PlanViolation>

export const CommercialPlanValidationResult = z.object({
  status: ValidationStatus,
  violations: z.array(PlanViolation).default([]),
  warnings: z.array(z.string()).default([]),
})
export type CommercialPlanValidationResult = z.infer<typeof CommercialPlanValidationResult>

/** Records a regeneration triggered by a fact change (partial, traceable). */
export const CommercialPlanRevision = z.object({
  revisionId: z.string().min(1),
  planId: z.string().min(1),
  changedFactKeys: z.array(z.string()),
  regeneratedSections: z.array(z.string()),
  /** Manual text-layout overrides that could NOT be preserved (scene/role changed). */
  droppedLayoutKeys: z.array(z.string()).default([]),
  createdAt: z.string().datetime(),
})
export type CommercialPlanRevision = z.infer<typeof CommercialPlanRevision>

export function validateCommercialPlan(candidate: unknown): { ok: boolean; errors: string[] } {
  const result = CommercialPlan.safeParse(candidate)
  return result.success
    ? { ok: true, errors: [] }
    : { ok: false, errors: result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`) }
}
