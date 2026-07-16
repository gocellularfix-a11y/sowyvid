import type { PacingProfileName, TextDensity } from './contracts.js';

export interface PacingProfile {
  name: PacingProfileName;
  targetDurationSec: number;
  sceneCountRange: readonly [number, number];
  minSceneSec: number;
  maxSceneSec: number;
  hookSec: number;
  proofHoldSec: number;
  ctaSec: number;
  motionIntensity: number;
  transitionFrequency: number;
  textDensity: TextDensity;
  note: string;
}

export const PACING_PROFILE_TABLE: Record<PacingProfileName, PacingProfile> = {
  social_fast: {
    name: 'social_fast',
    targetDurationSec: 15,
    sceneCountRange: [5, 7],
    minSceneSec: 1,
    maxSceneSec: 3,
    hookSec: 1.2,
    proofHoldSec: 1.8,
    ctaSec: 2,
    motionIntensity: 0.95,
    transitionFrequency: 0.7,
    textDensity: 'high',
    note: 'Fast short-form rhythm with frequent visual resets.',
  },
  retail_energy: {
    name: 'retail_energy',
    targetDurationSec: 24,
    sceneCountRange: [6, 8],
    minSceneSec: 1.5,
    maxSceneSec: 4,
    hookSec: 2,
    proofHoldSec: 2.6,
    ctaSec: 3,
    motionIntensity: 0.72,
    transitionFrequency: 0.45,
    textDensity: 'medium',
    note: 'Lively retail pacing with readable offer holds.',
  },
  transformation: {
    name: 'transformation',
    targetDurationSec: 20,
    sceneCountRange: [6, 8],
    minSceneSec: 1.2,
    maxSceneSec: 5,
    hookSec: 1.6,
    proofHoldSec: 3.4,
    ctaSec: 2.5,
    motionIntensity: 0.55,
    transitionFrequency: 0.35,
    textDensity: 'low',
    note: 'Quick setup followed by meaningful reveal and proof holds.',
  },
  trust_precision: {
    name: 'trust_precision',
    targetDurationSec: 30,
    sceneCountRange: [6, 8],
    minSceneSec: 2.5,
    maxSceneSec: 6,
    hookSec: 2.8,
    proofHoldSec: 4,
    ctaSec: 3.5,
    motionIntensity: 0.4,
    transitionFrequency: 0.22,
    textDensity: 'low',
    note: 'Composed pacing with long proof and process holds.',
  },
  premium_controlled: {
    name: 'premium_controlled',
    targetDurationSec: 26,
    sceneCountRange: [5, 7],
    minSceneSec: 2.8,
    maxSceneSec: 6,
    hookSec: 2.8,
    proofHoldSec: 3.6,
    ctaSec: 3.2,
    motionIntensity: 0.36,
    transitionFrequency: 0.2,
    textDensity: 'low',
    note: 'Long intentional holds with limited camera motion.',
  },
};

export function getPacingProfile(name: PacingProfileName): PacingProfile {
  return PACING_PROFILE_TABLE[name];
}

export interface DurationDistributionOptions {
  targetDurationSec?: number;
  precisionSec?: number;
}

/**
 * Bounded weighted allocation using integer precision units.
 * The result always sums exactly to the target and every scene remains inside
 * the profile min/max limits. It throws when the requested target is infeasible.
 */
export function distributeBeatDurations(
  weights: readonly number[],
  profile: PacingProfile,
  options: DurationDistributionOptions = {},
): number[] {
  if (weights.length === 0) return [];
  if (weights.some((weight) => !Number.isFinite(weight) || weight <= 0)) {
    throw new Error('Every pacing weight must be a positive finite number');
  }

  const precisionSec = options.precisionSec ?? 0.1;
  if (!Number.isFinite(precisionSec) || precisionSec <= 0) {
    throw new Error('precisionSec must be a positive finite number');
  }

  const toUnits = (seconds: number): number => Math.round(seconds / precisionSec);
  const minUnits = toUnits(profile.minSceneSec);
  const maxUnits = toUnits(profile.maxSceneSec);
  const targetUnits = toUnits(options.targetDurationSec ?? profile.targetDurationSec);
  const minimumFeasible = minUnits * weights.length;
  const maximumFeasible = maxUnits * weights.length;

  if (targetUnits < minimumFeasible || targetUnits > maximumFeasible) {
    throw new Error(
      `Target duration ${(targetUnits * precisionSec).toFixed(2)}s is infeasible for ${weights.length} scenes; ` +
      `allowed range is ${(minimumFeasible * precisionSec).toFixed(2)}s–${(maximumFeasible * precisionSec).toFixed(2)}s`,
    );
  }

  const units = weights.map(() => minUnits);
  const capacities = weights.map(() => maxUnits - minUnits);
  let remaining = targetUnits - minimumFeasible;

  while (remaining > 0) {
    const active = capacities
      .map((capacity, index) => ({ capacity, index, weight: weights[index] as number }))
      .filter((entry) => entry.capacity > 0);
    if (active.length === 0) throw new Error('Internal pacing allocation exhausted capacity');

    const totalWeight = active.reduce((sum, entry) => sum + entry.weight, 0);
    const proposals = active.map((entry) => {
      const exact = (remaining * entry.weight) / totalWeight;
      return {
        ...entry,
        exact,
        grant: Math.min(entry.capacity, Math.floor(exact)),
        remainder: exact - Math.floor(exact),
      };
    });

    let granted = proposals.reduce((sum, proposal) => sum + proposal.grant, 0);
    if (granted === 0) {
      proposals.sort((a, b) => b.remainder - a.remainder || b.weight - a.weight || a.index - b.index);
      const winner = proposals[0];
      if (!winner) throw new Error('Internal pacing allocation could not choose a recipient');
      winner.grant = 1;
      granted = 1;
    }

    if (granted > remaining) {
      let excess = granted - remaining;
      proposals.sort((a, b) => a.remainder - b.remainder || a.weight - b.weight || b.index - a.index);
      for (const proposal of proposals) {
        if (excess <= 0) break;
        const removable = Math.min(proposal.grant, excess);
        proposal.grant -= removable;
        excess -= removable;
      }
      granted = remaining;
    }

    for (const proposal of proposals) {
      if (proposal.grant <= 0) continue;
      units[proposal.index] = (units[proposal.index] as number) + proposal.grant;
      capacities[proposal.index] = (capacities[proposal.index] as number) - proposal.grant;
    }
    remaining -= granted;
  }

  const durations = units.map((value) => Number((value * precisionSec).toFixed(6)));
  const total = durations.reduce((sum, value) => sum + value, 0);
  const target = targetUnits * precisionSec;
  if (Math.abs(total - target) > precisionSec / 100) {
    throw new Error(`Internal pacing allocation produced ${total}s instead of ${target}s`);
  }
  return durations;
}

export function feasibleDurationRange(sceneCount: number, profile: PacingProfile): readonly [number, number] {
  return [sceneCount * profile.minSceneSec, sceneCount * profile.maxSceneSec];
}

export function clampDurationToProfile(target: number, sceneCount: number, profile: PacingProfile): number {
  const [minimum, maximum] = feasibleDurationRange(sceneCount, profile);
  return Math.min(maximum, Math.max(minimum, target));
}
