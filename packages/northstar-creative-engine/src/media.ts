import type {
  AssignedMedia,
  MediaAsset,
  MediaRole,
  PlatformIntent,
  SceneDirective,
} from './contracts.js';
import { hashToUnitInterval } from './hash.js';

const ROLE_COMPATIBILITY: Record<MediaRole, MediaRole[]> = {
  product: ['product', 'result', 'after', 'any'],
  process: ['process', 'person', 'any'],
  result: ['result', 'after', 'product', 'any'],
  person: ['person', 'process', 'any'],
  store: ['store', 'person', 'any'],
  proof: ['proof', 'testimonial', 'result', 'after', 'any'],
  testimonial: ['testimonial', 'proof', 'person', 'any'],
  logo: ['logo'],
  before: ['before', 'product', 'any'],
  after: ['after', 'result', 'product', 'any'],
  any: ['any', 'product', 'process', 'result', 'person', 'store', 'proof', 'logo', 'before', 'after'],
};

function targetOrientation(platform: PlatformIntent): 'portrait' | 'landscape' | 'square' | 'unknown' {
  switch (platform) {
    case 'vertical_social':
    case 'story':
    case 'portrait_video':
      return 'portrait';
    case 'square_social':
      return 'square';
    case 'landscape_video':
      return 'landscape';
    case 'generic':
      return 'unknown';
  }
}

function inferredRoles(asset: MediaAsset): Set<MediaRole> {
  const roles = new Set(asset.roles);
  if (asset.kind === 'logo') roles.add('logo');
  const normalizedTags = new Set(asset.tags.map((tag) => tag.trim().toLowerCase()));
  for (const role of Object.keys(ROLE_COMPATIBILITY) as MediaRole[]) {
    if (normalizedTags.has(role)) roles.add(role);
  }
  return roles;
}

export interface MediaScoreContext {
  slotRole: MediaRole;
  platformIntent: PlatformIntent;
  sceneDurationSec: number;
  useCount: number;
  seed: string;
  sceneKey: string;
}

export interface MediaScore {
  eligible: boolean;
  score: number;
  reasons: string[];
}

export function scoreMediaAsset(asset: MediaAsset, context: MediaScoreContext): MediaScore {
  const roles = inferredRoles(asset);
  const compatible = ROLE_COMPATIBILITY[context.slotRole];
  const reasons: string[] = [];

  if (context.slotRole === 'logo' && !roles.has('logo')) {
    return { eligible: false, score: Number.NEGATIVE_INFINITY, reasons: ['rejected: logo slot requires a logo asset'] };
  }
  if (asset.kind === 'logo' && context.slotRole !== 'logo' && context.slotRole !== 'any') {
    return { eligible: false, score: Number.NEGATIVE_INFINITY, reasons: ['rejected: logo asset cannot fill a photographic slot'] };
  }

  let roleScore = 0;
  if (roles.has(context.slotRole)) {
    roleScore = 55;
    reasons.push(`exact role ${context.slotRole} +55`);
  } else {
    const compatibilityIndex = compatible.findIndex((role) => roles.has(role));
    if (compatibilityIndex >= 0) {
      roleScore = Math.max(8, 35 - compatibilityIndex * 7);
      reasons.push(`compatible role ${compatible[compatibilityIndex]} +${roleScore}`);
    } else if (context.slotRole === 'any') {
      roleScore = 10;
      reasons.push('generic slot +10');
    } else {
      roleScore = 2;
      reasons.push('weak fallback +2');
    }
  }

  let score = roleScore;
  const desiredOrientation = targetOrientation(context.platformIntent);
  if (desiredOrientation === 'unknown' || asset.orientation === 'unknown') {
    score += 2;
    reasons.push('orientation unknown/neutral +2');
  } else if (asset.orientation === desiredOrientation) {
    score += 18;
    reasons.push(`orientation ${asset.orientation} matches +18`);
  } else if (asset.orientation === 'square') {
    score += 9;
    reasons.push('square crop flexibility +9');
  } else {
    score -= 6;
    reasons.push(`orientation mismatch ${asset.orientation} -6`);
  }

  if (context.slotRole === 'process' && asset.kind === 'video') {
    score += 12;
    reasons.push('video preferred for process +12');
  }
  if ((context.slotRole === 'person' || context.slotRole === 'proof') && asset.kind === 'video') {
    score += 5;
    reasons.push('video adds credibility/motion +5');
  }
  if (asset.kind === 'video' && asset.durationSec !== undefined) {
    if (asset.durationSec + 0.05 >= context.sceneDurationSec) {
      score += 6;
      reasons.push('video is long enough +6');
    } else {
      score -= 12;
      reasons.push('video shorter than scene -12');
    }
  }

  const qualityPoints = Math.round(asset.qualityScore * 15);
  score += qualityPoints;
  reasons.push(`quality +${qualityPoints}`);

  if (asset.width !== undefined && asset.height !== undefined) {
    const pixels = asset.width * asset.height;
    const resolutionPoints = pixels >= 1920 * 1080 ? 8 : pixels >= 1280 * 720 ? 5 : pixels >= 640 * 480 ? 2 : -5;
    score += resolutionPoints;
    reasons.push(`resolution ${resolutionPoints >= 0 ? '+' : ''}${resolutionPoints}`);
  }

  if (context.useCount > 0) {
    const reusePenalty = Math.min(30, context.useCount * 12);
    score -= reusePenalty;
    reasons.push(`reuse -${reusePenalty}`);
  }

  const tieBreak = hashToUnitInterval(`${context.seed}|${context.sceneKey}|${context.slotRole}|${asset.id}`) * 0.001;
  score += tieBreak;

  return { eligible: true, score, reasons };
}

export interface MediaAssignmentResult {
  scenes: SceneDirective[];
  warnings: string[];
}

export function assignMediaToScenes(
  scenes: readonly SceneDirective[],
  media: readonly MediaAsset[],
  platformIntent: PlatformIntent,
  seed: string,
): MediaAssignmentResult {
  const useCounts = new Map<string, number>();
  const warnings: string[] = [];

  const assignedScenes = scenes.map((scene, sceneIndex): SceneDirective => {
    const assignedMedia: AssignedMedia[] = [];
    const sceneAssetIds = new Set<string>();

    for (const slotRole of scene.mediaSlots) {
      const candidates = media
        .filter((asset) => !sceneAssetIds.has(asset.id))
        .map((asset) => {
          const scored = scoreMediaAsset(asset, {
            slotRole,
            platformIntent,
            sceneDurationSec: scene.durationSec,
            useCount: useCounts.get(asset.id) ?? 0,
            seed,
            sceneKey: `${sceneIndex}:${scene.beatPurpose}`,
          });
          return { asset, ...scored };
        })
        .filter((candidate) => candidate.eligible)
        .sort((a, b) => b.score - a.score || a.asset.id.localeCompare(b.asset.id));

      const winner = candidates[0];
      const minimumScore = slotRole === 'logo' ? 40 : 4;
      if (!winner || winner.score < minimumScore) {
        warnings.push(`No suitable media for scene '${scene.beatPurpose}' slot '${slotRole}'`);
        continue;
      }

      assignedMedia.push({
        slotRole,
        assetId: winner.asset.id,
        score: Number(winner.score.toFixed(3)),
        reasons: winner.reasons,
      });
      sceneAssetIds.add(winner.asset.id);
      useCounts.set(winner.asset.id, (useCounts.get(winner.asset.id) ?? 0) + 1);
    }

    return { ...scene, assignedMedia };
  });

  return { scenes: assignedScenes, warnings };
}
