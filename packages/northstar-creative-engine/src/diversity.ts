import { z } from 'zod';
import type { CreativePlan } from './contracts.js';

export interface DimensionScore {
  dimension: string;
  distinctness: number;
  weight: number;
}

export interface PairDiversity {
  a: string;
  b: string;
  score: number;
  dimensions: DimensionScore[];
  similarOn: string[];
}

export interface DiversityReport {
  ok: boolean;
  minPairScore: number;
  averageScore: number;
  threshold: number;
  pairs: PairDiversity[];
  failures: string[];
  scope: 'plan';
}

function multisetDistance(a: readonly string[], b: readonly string[]): number {
  const countsA = new Map<string, number>();
  const countsB = new Map<string, number>();
  for (const token of a) countsA.set(token, (countsA.get(token) ?? 0) + 1);
  for (const token of b) countsB.set(token, (countsB.get(token) ?? 0) + 1);
  const keys = new Set([...countsA.keys(), ...countsB.keys()]);
  let overlap = 0;
  let union = 0;
  for (const key of keys) {
    const countA = countsA.get(key) ?? 0;
    const countB = countsB.get(key) ?? 0;
    overlap += Math.min(countA, countB);
    union += Math.max(countA, countB);
  }
  return union === 0 ? 0 : 1 - overlap / union;
}

function sequenceDistance<T>(a: readonly T[], b: readonly T[]): number {
  const length = Math.max(a.length, b.length);
  if (length === 0) return 0;
  let mismatch = Math.abs(a.length - b.length);
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    if (a[index] !== b[index]) mismatch += 1;
  }
  return Math.min(1, mismatch / length);
}

function numericSequenceDistance(a: readonly number[], b: readonly number[]): number {
  const length = Math.max(a.length, b.length);
  if (length === 0) return 0;
  let total = 0;
  for (let index = 0; index < length; index += 1) {
    const left = a[index] ?? 0;
    const right = b[index] ?? 0;
    const scale = Math.max(1, left, right);
    total += Math.min(1, Math.abs(left - right) / scale);
  }
  return total / length;
}

function booleanDistance(different: boolean): number {
  return different ? 1 : 0;
}

function weightedAverage(dimensions: readonly DimensionScore[]): number {
  const weight = dimensions.reduce((sum, dimension) => sum + dimension.weight, 0);
  if (weight === 0) return 0;
  return dimensions.reduce((sum, dimension) => sum + dimension.distinctness * dimension.weight, 0) / weight;
}

export function comparePlans(a: CreativePlan, b: CreativePlan): PairDiversity {
  const dimensions: DimensionScore[] = [
    { dimension: 'family', distinctness: booleanDistance(a.family !== b.family), weight: 1.8 },
    { dimension: 'variant', distinctness: booleanDistance(a.variantId !== b.variantId), weight: 1 },
    { dimension: 'storyStructure', distinctness: sequenceDistance(a.storyStructure, b.storyStructure), weight: 1.8 },
    { dimension: 'roleSequence', distinctness: sequenceDistance(a.scenes.map((scene) => scene.role), b.scenes.map((scene) => scene.role)), weight: 1.6 },
    { dimension: 'sceneCount', distinctness: Math.min(1, Math.abs(a.scenes.length - b.scenes.length) / 3), weight: 0.8 },
    { dimension: 'duration', distinctness: Math.min(1, Math.abs(a.targetDurationSec - b.targetDurationSec) / 10), weight: 1 },
    { dimension: 'durationPattern', distinctness: numericSequenceDistance(a.scenes.map((scene) => scene.durationSec), b.scenes.map((scene) => scene.durationSec)), weight: 1.2 },
    { dimension: 'pacingProfile', distinctness: booleanDistance(a.pacingProfile !== b.pacingProfile), weight: 1.2 },
    { dimension: 'motionSequence', distinctness: sequenceDistance(a.scenes.map((scene) => scene.motion), b.scenes.map((scene) => scene.motion)), weight: 1.4 },
    { dimension: 'motionVocabulary', distinctness: multisetDistance(a.scenes.map((scene) => scene.motion), b.scenes.map((scene) => scene.motion)), weight: 0.8 },
    { dimension: 'shotSequence', distinctness: sequenceDistance(a.scenes.map((scene) => scene.shotBehavior), b.scenes.map((scene) => scene.shotBehavior)), weight: 1.4 },
    { dimension: 'transitionSequence', distinctness: sequenceDistance(a.scenes.map((scene) => scene.transitionIn), b.scenes.map((scene) => scene.transitionIn)), weight: 1.1 },
    { dimension: 'backgroundMotion', distinctness: booleanDistance(a.backgroundMotion !== b.backgroundMotion), weight: 0.7 },
    { dimension: 'typography', distinctness: booleanDistance(a.typography.emphasis !== b.typography.emphasis || a.typography.case !== b.typography.case || a.typography.density !== b.typography.density), weight: 0.9 },
    { dimension: 'mediaRoleSequence', distinctness: sequenceDistance(a.scenes.flatMap((scene) => scene.mediaSlots), b.scenes.flatMap((scene) => scene.mediaSlots)), weight: 1 },
    { dimension: 'assetSequence', distinctness: sequenceDistance(a.scenes.flatMap((scene) => scene.assignedMedia.map((item) => item.assetId)), b.scenes.flatMap((scene) => scene.assignedMedia.map((item) => item.assetId))), weight: 0.8 },
    { dimension: 'hookStrategy', distinctness: booleanDistance(a.hookStrategy !== b.hookStrategy), weight: 1 },
    { dimension: 'proofStrategy', distinctness: booleanDistance(a.proofStrategy !== b.proofStrategy), weight: 0.8 },
    { dimension: 'offerStrategy', distinctness: booleanDistance(a.offerStrategy !== b.offerStrategy), weight: 0.8 },
    { dimension: 'ctaStrategy', distinctness: booleanDistance(a.ctaStrategy !== b.ctaStrategy), weight: 0.8 },
    { dimension: 'emotion', distinctness: booleanDistance(a.emotionalDirection !== b.emotionalDirection), weight: 0.8 },
  ];
  const score = weightedAverage(dimensions);
  return {
    a: a.conceptId,
    b: b.conceptId,
    score,
    dimensions,
    similarOn: dimensions.filter((dimension) => dimension.distinctness < 0.25).map((dimension) => dimension.dimension),
  };
}

export interface DiversityOptions {
  threshold?: number;
  requireUniqueFamilies?: boolean;
}

export function evaluatePlanDiversity(
  plans: readonly CreativePlan[],
  options: DiversityOptions = {},
): DiversityReport {
  const threshold = options.threshold ?? 0.42;
  const requireUniqueFamilies = options.requireUniqueFamilies ?? plans.length <= 5;
  const pairs: PairDiversity[] = [];
  for (let left = 0; left < plans.length; left += 1) {
    for (let right = left + 1; right < plans.length; right += 1) {
      pairs.push(comparePlans(plans[left] as CreativePlan, plans[right] as CreativePlan));
    }
  }

  const failures = pairs
    .filter((pair) => pair.score < threshold)
    .map((pair) => `${pair.a} vs ${pair.b}: ${(pair.score * 100).toFixed(0)}% plan diversity; similar on [${pair.similarOn.join(', ')}]`);

  if (requireUniqueFamilies) {
    const families = plans.map((plan) => plan.family);
    if (new Set(families).size !== families.length) failures.push('option set contains repeated creative families');
  }

  const scores = pairs.map((pair) => pair.score);
  return {
    ok: failures.length === 0,
    minPairScore: scores.length > 0 ? Math.min(...scores) : 1,
    averageScore: scores.length > 0 ? scores.reduce((sum, score) => sum + score, 0) / scores.length : 1,
    threshold,
    pairs,
    failures,
    scope: 'plan',
  };
}

/**
 * Optional renderer-produced fingerprint. This exists because plan diversity is
 * not proof that two final videos look different. A renderer or visual-analysis
 * step can provide these measurable features after preview generation.
 */
export const RenderFingerprintSchema = z.object({
  conceptId: z.string().min(1),
  shotChangeTimesSec: z.array(z.number().nonnegative()),
  layoutTokens: z.array(z.string()),
  motionEnergySamples: z.array(z.number().min(0).max(1)),
  textAreaRatioSamples: z.array(z.number().min(0).max(1)),
  dominantColorTokens: z.array(z.string()),
  assetSequence: z.array(z.string()),
});
export type RenderFingerprint = z.infer<typeof RenderFingerprintSchema>;

export interface RenderFingerprintComparison {
  a: string;
  b: string;
  score: number;
  dimensions: DimensionScore[];
}

export function compareRenderFingerprints(
  leftCandidate: RenderFingerprint,
  rightCandidate: RenderFingerprint,
): RenderFingerprintComparison {
  const left = RenderFingerprintSchema.parse(leftCandidate);
  const right = RenderFingerprintSchema.parse(rightCandidate);
  const dimensions: DimensionScore[] = [
    { dimension: 'shotTiming', distinctness: numericSequenceDistance(left.shotChangeTimesSec, right.shotChangeTimesSec), weight: 1.5 },
    { dimension: 'layout', distinctness: sequenceDistance(left.layoutTokens, right.layoutTokens), weight: 1.5 },
    { dimension: 'motionEnergy', distinctness: numericSequenceDistance(left.motionEnergySamples, right.motionEnergySamples), weight: 1.2 },
    { dimension: 'textArea', distinctness: numericSequenceDistance(left.textAreaRatioSamples, right.textAreaRatioSamples), weight: 1 },
    { dimension: 'dominantColors', distinctness: multisetDistance(left.dominantColorTokens, right.dominantColorTokens), weight: 0.7 },
    { dimension: 'assets', distinctness: sequenceDistance(left.assetSequence, right.assetSequence), weight: 1.1 },
  ];
  return { a: left.conceptId, b: right.conceptId, score: weightedAverage(dimensions), dimensions };
}
