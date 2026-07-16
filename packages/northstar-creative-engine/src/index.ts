export * from './contracts.js';
export * from './hash.js';
export * from './stable.js';
export * from './random.js';
export * from './pacing.js';
export * from './families.js';
export * from './classification.js';
export * from './media.js';
export * from './director.js';
export * from './compiler.js';
export * from './diversity.js';
export * from './adapters.js';

import type { CreativePlan } from './contracts.js';

export function planSignature(plan: CreativePlan): Record<string, unknown> {
  return {
    conceptId: plan.conceptId,
    family: plan.family,
    variantId: plan.variantId,
    sceneCount: plan.scenes.length,
    roleSequence: plan.scenes.map((scene) => scene.role),
    storyStructure: plan.storyStructure,
    durations: plan.scenes.map((scene) => scene.durationSec),
    targetDurationSec: plan.targetDurationSec,
    pacingProfile: plan.pacingProfile,
    motionProfile: plan.motionProfile,
    artDirection: plan.artDirection,
    backgroundMotion: plan.backgroundMotion,
    shotBehaviors: plan.scenes.map((scene) => scene.shotBehavior),
    motionLanguage: plan.scenes.map((scene) => scene.motion),
    transitions: plan.scenes.map((scene) => scene.transitionIn),
    mediaRoleSequence: plan.scenes.flatMap((scene) => scene.mediaSlots),
    assignedAssetSequence: plan.scenes.flatMap((scene) => scene.assignedMedia.map((item) => item.assetId)),
    classification: plan.classification.category,
  };
}
