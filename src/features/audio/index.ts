export {
  AUDIO_PLAN_VERSION,
  AudioPlanSchema,
  AudioTrackSchema,
  MissingTrackSchema,
  validateAudioPlan,
  planHasAudio,
  type AudioPlan,
  type AudioTrack,
  type AudioTrackRole,
  type MissingTrack,
  type MissingTrackReason,
} from './audioPlan'
export { buildAudioPlan, sceneWindowsFrom, type BuildAudioPlanInput } from './soundWeaveAdapter'

import { buildAudioPlan } from './soundWeaveAdapter'
import type { AudioPlan } from './audioPlan'
import type { Project } from '@shared/domain/project'
import type { VisualPlan } from '@features/visual/visualPlan'

/** Project + its VisualPlan → the commercial's AudioPlan. */
export function audioPlanForProject(project: Project, visualPlan: VisualPlan): AudioPlan {
  return buildAudioPlan({
    projectId: project.id,
    audio: project.audio,
    visualPlan,
    media: project.media,
  })
}
