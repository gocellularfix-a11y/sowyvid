import { z } from 'zod';
import {
  CampaignObjectiveSchema,
  CreativePlanSchema,
  ENGINE_VERSION,
  MediaAssetSchema,
  PlatformIntentSchema,
  SupportedLocaleSchema,
  CREATIVE_PLAN_VERSION,
  type CampaignObjective,
  type ClassificationResult,
  type CreativeFamily,
  type CreativePlan,
  type MediaAsset,
  type PlatformIntent,
  type SupportedLocale,
} from './contracts.js';
import { classifyPromotion, rankFamilies } from './classification.js';
import { ALL_FAMILIES, getFamilyRecipe, materializeFamilyVariant } from './families.js';
import { fnv1aHex } from './hash.js';
import { assignMediaToScenes } from './media.js';
import { clampDurationToProfile, distributeBeatDurations, getPacingProfile } from './pacing.js';
import { createSeededRandom } from './random.js';

export const CREATIVE_MODE_LABEL = 'Deterministic Creative Mode';

export const DirectorInputSchema = z.object({
  productOrService: z.string().trim().min(1),
  offer: z.string().trim().optional(),
  businessName: z.string().trim().min(1),
  locale: SupportedLocaleSchema.default('en'),
  industry: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  objective: CampaignObjectiveSchema.optional(),
  media: z.array(MediaAssetSchema).default([]),
  seed: z.string().min(1).optional(),
  platformIntent: PlatformIntentSchema.default('vertical_social'),
  requestedDurationSec: z.number().positive().max(90).optional(),
});
export type DirectorInput = z.input<typeof DirectorInputSchema>;
type ParsedDirectorInput = z.output<typeof DirectorInputSchema>;

const DEFAULT_OFFER: Record<SupportedLocale, string> = {
  en: 'available today',
  es: 'disponible hoy',
  pt: 'disponível hoje',
};

function fill(template: string, input: ParsedDirectorInput): string {
  const offer = input.offer?.trim() || DEFAULT_OFFER[input.locale];
  return template
    .replaceAll('{product}', input.productOrService.trim())
    .replaceAll('{offer}', offer)
    .replaceAll('{business}', input.businessName.trim());
}

function normalizedSeed(input: ParsedDirectorInput): string {
  return input.seed ?? fnv1aHex([
    input.businessName,
    input.productOrService,
    input.offer ?? '',
    input.industry ?? '',
    input.objective ?? '',
    input.platformIntent,
  ].join('|'));
}

function parseDirectorInput(input: DirectorInput): ParsedDirectorInput {
  return DirectorInputSchema.parse(input);
}

export interface BuildCreativePlanOptions {
  family: CreativeFamily;
  variantId: string;
  input: DirectorInput;
  seed?: string;
  classification?: ClassificationResult;
}

export function buildCreativePlan(options: BuildCreativePlanOptions): CreativePlan {
  const input = parseDirectorInput(options.input);
  const seed = options.seed ?? normalizedSeed(input);
  const classification = options.classification ?? classifyPromotion(input);
  const materialized = materializeFamilyVariant(options.family, options.variantId, input.locale);
  const profile = getPacingProfile(materialized.recipe.pacingProfile);
  const requestedTarget = input.requestedDurationSec
    ?? profile.targetDurationSec + (materialized.variant.targetDurationDeltaSec ?? 0);
  const feasibleTarget = clampDurationToProfile(requestedTarget, materialized.beats.length, profile);
  const durations = distributeBeatDurations(
    materialized.beats.map((beat) => beat.holdBias),
    profile,
    { targetDurationSec: feasibleTarget },
  );

  const scenes = materialized.beats.map((beat, index) => ({
    role: beat.role,
    beatPurpose: beat.beatPurpose,
    shotBehavior: beat.shotBehavior,
    motion: beat.motion,
    transitionIn: beat.transitionIn,
    textDensity: beat.textDensity,
    holdBias: beat.holdBias,
    durationSec: durations[index] as number,
    mediaSlots: [...beat.mediaSlots],
    assignedMedia: [],
    emphasis: beat.emphasis,
  }));

  const assignment = assignMediaToScenes(
    scenes,
    input.media,
    input.platformIntent,
    `${seed}|${options.family}|${options.variantId}`,
  );
  const targetDurationSec = Number(
    assignment.scenes.reduce((sum, scene) => sum + scene.durationSec, 0).toFixed(6),
  );
  const conceptId = `${options.family}.${options.variantId}.${fnv1aHex(`${seed}|${options.family}|${options.variantId}`)}`;
  const requiredRoles = Array.from(new Set(materialized.beats.flatMap((beat) => beat.mediaSlots)));
  const minItems = requiredRoles.length;

  const candidate: CreativePlan = {
    version: CREATIVE_PLAN_VERSION,
    engineVersion: ENGINE_VERSION,
    conceptId,
    seed,
    family: options.family,
    variantId: options.variantId,
    ownerName: materialized.ownerName,
    ownerDescription: materialized.ownerDescription,
    promise: fill(materialized.recipe.promiseTemplate[input.locale], input),
    objective: input.objective ?? materialized.recipe.objective,
    audienceIntent: materialized.recipe.audienceIntent,
    hookStrategy: materialized.hookStrategy,
    emotionalDirection: materialized.recipe.emotionalDirection,
    storyStructure: assignment.scenes.map((scene) => scene.beatPurpose),
    scenes: assignment.scenes,
    pacingProfile: materialized.recipe.pacingProfile,
    motionProfile: materialized.recipe.motionProfile,
    artDirection: materialized.recipe.artDirection,
    backgroundMotion: materialized.recipe.backgroundMotion,
    transitionStyle: materialized.transitionStyle,
    typography: materialized.recipe.typography,
    proofStrategy: materialized.proofStrategy,
    offerStrategy: materialized.offerStrategy,
    ctaStrategy: materialized.ctaStrategy,
    targetDurationSec,
    platformIntent: input.platformIntent,
    classification,
    mediaRequirements: { minItems, roles: requiredRoles },
    mediaWarnings: assignment.warnings,
    musicDirection: materialized.recipe.musicDirection,
    narrationDirection: materialized.recipe.narrationDirection,
  };

  return CreativePlanSchema.parse(candidate);
}

export function selectFamilies(input: DirectorInput): CreativeFamily[] {
  const parsed = parseDirectorInput(input);
  const classification = classifyPromotion(parsed);
  return rankFamilies(classification, parsed.objective).map((item) => item.family);
}

interface ConceptCandidate {
  family: CreativeFamily;
  variantId: string;
  familyScore: number;
  round: number;
}

function conceptCandidates(input: ParsedDirectorInput, seed: string): ConceptCandidate[] {
  const classification = classifyPromotion(input);
  const ranked = rankFamilies(classification, input.objective);
  const variantsByFamily = new Map<CreativeFamily, string[]>();

  for (const item of ranked) {
    const variants = getFamilyRecipe(item.family).variants.map((variant) => variant.id);
    variantsByFamily.set(item.family, createSeededRandom(`${seed}|${item.family}|variants`).shuffle(variants));
  }

  const maximumVariants = Math.max(...ranked.map((item) => variantsByFamily.get(item.family)?.length ?? 0));
  const candidates: ConceptCandidate[] = [];
  for (let round = 0; round < maximumVariants; round += 1) {
    for (const item of ranked) {
      const variantId = variantsByFamily.get(item.family)?.[round];
      if (!variantId) continue;
      candidates.push({ family: item.family, variantId, familyScore: item.score, round });
    }
  }
  return candidates;
}

/**
 * Produces different families first, then additional variants inside each family.
 * Five families × three variants currently yields up to fifteen deterministic concepts.
 */
export function developConcepts(
  rawInput: DirectorInput,
  count: number,
  excludeConceptIds: readonly string[] = [],
): CreativePlan[] {
  if (!Number.isInteger(count) || count < 0) throw new Error('count must be a non-negative integer');
  const input = parseDirectorInput(rawInput);
  const seed = normalizedSeed(input);
  const classification = classifyPromotion(input);
  const excluded = new Set(excludeConceptIds);
  const plans: CreativePlan[] = [];

  for (const candidate of conceptCandidates(input, seed)) {
    if (plans.length >= count) break;
    const plan = buildCreativePlan({
      family: candidate.family,
      variantId: candidate.variantId,
      input,
      seed,
      classification,
    });
    if (excluded.has(plan.conceptId)) continue;
    plans.push(plan);
  }
  return plans;
}

export function developAllConcepts(rawInput: DirectorInput): CreativePlan[] {
  return developConcepts(rawInput, Number.MAX_SAFE_INTEGER);
}

export function availableConceptCount(): number {
  return ALL_FAMILIES.reduce((total, family) => total + getFamilyRecipe(family).variants.length, 0);
}

export interface DirectorSummary {
  mode: typeof CREATIVE_MODE_LABEL;
  classification: ClassificationResult;
  rankedFamilies: Array<{ family: CreativeFamily; score: number }>;
  availableConcepts: number;
  seed: string;
  platformIntent: PlatformIntent;
  objective?: CampaignObjective;
  mediaCount: number;
}

export function summarizeDirector(rawInput: DirectorInput): DirectorSummary {
  const input = parseDirectorInput(rawInput);
  const classification = classifyPromotion(input);
  const base = {
    mode: CREATIVE_MODE_LABEL,
    classification,
    rankedFamilies: rankFamilies(classification, input.objective),
    availableConcepts: availableConceptCount(),
    seed: normalizedSeed(input),
    platformIntent: input.platformIntent,
    mediaCount: input.media.length,
  } as const;
  return input.objective ? { ...base, objective: input.objective } : base;
}

export type { MediaAsset };
