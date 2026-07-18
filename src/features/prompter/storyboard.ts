import type { StoryboardScene } from '@shared/domain/commercialPlan'
import type { PlannedScene } from './copywriter'

/**
 * StoryboardDirector — turns the scene plan into an ordered storyboard and
 * enforces the "at most one or two external-video scenes" rule: extras are
 * downgraded to owner photos + local SowyVid motion. Most scenes should always
 * be the owner's own photos.
 */
const MAX_GENERATED_SCENES = 2

export function buildStoryboard(scenes: readonly PlannedScene[]): StoryboardScene[] {
  let generatedUsed = 0
  return scenes.map((s, i) => {
    let mediaPlan = s.mediaPlan
    let generationReason = s.generationReason
    if (mediaPlan === 'generated-video') {
      if (generatedUsed >= MAX_GENERATED_SCENES) {
        mediaPlan = 'owner-photo'
        generationReason = null
      } else {
        generatedUsed += 1
      }
    }
    return {
      sceneId: s.id,
      order: i,
      role: s.role,
      visualPurpose: s.visualPurpose,
      mediaPlan,
      localMediaInstruction: s.localMediaInstruction,
      generationReason,
      durationSec: s.durationSec,
    }
  })
}

/** Scenes recommended for external generated video (≤ 2). */
export function generatedVideoScenes(storyboard: readonly StoryboardScene[]): StoryboardScene[] {
  return storyboard.filter((s) => s.mediaPlan === 'generated-video')
}
