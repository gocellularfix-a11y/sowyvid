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
export {
  buildAudioPlan,
  sceneWindowsFrom,
  type BuildAudioPlanInput,
  type ResolvedMusicTrack,
} from './soundWeaveAdapter'
export {
  buildMusicPrompt,
  buildMusicBriefDetail,
  visualEnergyFrom,
  SUNO_CREATE_URL,
  type MusicBriefDetail,
  type MusicPromptInput,
} from './musicProviders'

import { buildAudioPlan, type ResolvedMusicTrack } from './soundWeaveAdapter'
import type { AudioPlan } from './audioPlan'
import type { Project } from '@shared/domain/project'
import type { VisualPlan } from '@features/visual/visualPlan'

/**
 * Project + its VisualPlan → the commercial's AudioPlan. `resolveMusicTrack`
 * lets the main process resolve a selected GLOBAL Music Center track; when
 * omitted (browser preview / legacy) only the project-scoped music path runs.
 */
export function audioPlanForProject(
  project: Project,
  visualPlan: VisualPlan,
  resolveMusicTrack?: (trackId: string) => ResolvedMusicTrack | null,
): AudioPlan {
  return buildAudioPlan({
    projectId: project.id,
    audio: project.audio,
    visualPlan,
    media: project.media,
    ...(resolveMusicTrack ? { resolveMusicTrack } : {}),
  })
}
