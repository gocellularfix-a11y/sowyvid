import type { Project } from '@shared/domain/project'
import type { MediaAsset } from '@shared/domain/media'

/**
 * Pure reference surgery for owner-confirmed media operations. The MAIN process
 * applies these (the renderer never gets a force switch); being pure keeps the
 * cascade unit-testable without Electron or a filesystem.
 *
 * Plans are NOT touched here: compiled plans are always rebuilt from the
 * persisted project (media list + audio config), so fixing the references and
 * saving is exactly what "rebuild plans safely" requires.
 */

/** True when at least one remaining video still carries an audio stream. */
function anyVideoWithAudio(media: readonly MediaAsset[]): boolean {
  return media.some((m) => m.kind === 'video' && m.valid && m.hasAudio)
}

/**
 * Remove every reference to `mediaId`, given the media list that will REMAIN.
 * Clears music/narration/logo selections and switches source audio off when
 * the removed clip was the last one that could sound — a dangling reference
 * would otherwise block exports with an error the owner cannot trace.
 */
export function clearAssetReferences(
  project: Project,
  mediaId: string,
  remaining: readonly MediaAsset[],
): Project {
  const brand =
    project.brand.logoMediaId === mediaId ? { ...project.brand, logoMediaId: null } : project.brand

  let audio = project.audio
  if (audio.musicId === mediaId) audio = { ...audio, musicId: null }
  if (audio.narrationMediaId === mediaId) {
    audio = { ...audio, narrationMediaId: null, narrationEnabled: false }
  }
  if (audio.useSourceAudio && !anyVideoWithAudio(remaining)) {
    audio = { ...audio, useSourceAudio: false }
  }

  return { ...project, brand, audio, media: [...remaining] }
}

/**
 * Point references from `oldId` at `replacement` — but only when the new asset
 * can actually serve the role (music must be audio, a logo must be an image).
 * Incompatible replacements clear the reference instead of lying about it.
 */
export function retargetAssetReferences(
  project: Project,
  oldId: string,
  replacement: MediaAsset,
  remaining: readonly MediaAsset[],
): Project {
  const cleared = clearAssetReferences(project, oldId, remaining)

  const brand =
    project.brand.logoMediaId === oldId &&
    (replacement.kind === 'image' || replacement.kind === 'logo')
      ? { ...cleared.brand, logoMediaId: replacement.id }
      : cleared.brand

  let audio = cleared.audio
  if (project.audio.musicId === oldId && replacement.kind === 'audio') {
    audio = { ...audio, musicId: replacement.id }
  }
  if (project.audio.narrationMediaId === oldId && replacement.kind === 'audio') {
    audio = { ...audio, narrationMediaId: replacement.id, narrationEnabled: project.audio.narrationEnabled }
  }
  // A video-for-video swap keeps the owner's source-audio choice alive when the
  // new clip can sound.
  if (
    project.audio.useSourceAudio &&
    replacement.kind === 'video' &&
    replacement.hasAudio
  ) {
    audio = { ...audio, useSourceAudio: true }
  }

  return { ...cleared, brand, audio }
}
