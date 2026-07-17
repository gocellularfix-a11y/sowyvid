import { describe, it, expect } from 'vitest'
import { clearAssetReferences, retargetAssetReferences } from './referenceEdits'
import { goCellularProject, GO_CELLULAR_VIDEO_MEDIA, aud } from '@shared/fixtures/goCellular'
import type { Project } from '@shared/domain/project'
import type { MediaAsset } from '@shared/domain/media'

/**
 * The owner-confirmed remove/replace cascade must always leave a project that
 * still compiles: no dangling music id, no source audio pointing at a clip that
 * no longer exists, no logo id that was deleted.
 */

const MUSIC = aud('gc_music', 'fondo.mp3', { durationSec: 8 })
const OTHER_MUSIC = aud('gc_music2', 'otra.mp3', { durationSec: 10 })

function projectWith(over: Partial<Project['audio']>, media: MediaAsset[]): Project {
  return {
    ...goCellularProject,
    media,
    audio: { ...goCellularProject.audio, ...over },
  }
}

describe('clearAssetReferences removes every dangling pointer', () => {
  it('clears the music selection when the removed asset was the music', () => {
    const project = projectWith({ musicId: MUSIC.id }, [...goCellularProject.media, MUSIC])
    const remaining = project.media.filter((m) => m.id !== MUSIC.id)
    const next = clearAssetReferences(project, MUSIC.id, remaining)
    expect(next.audio.musicId).toBeNull()
  })

  it('disables source audio when the last audible video is removed', () => {
    const [videoWithSound] = GO_CELLULAR_VIDEO_MEDIA
    const project = projectWith({ useSourceAudio: true }, [videoWithSound!])
    const next = clearAssetReferences(project, videoWithSound!.id, [])
    expect(next.audio.useSourceAudio).toBe(false)
  })

  it('keeps source audio on when another audible video remains', () => {
    const withSound = GO_CELLULAR_VIDEO_MEDIA.filter((m) => m.hasAudio)
    // Two audible clips: remove one, the other still justifies source audio.
    const clipA = withSound[0]!
    const clipB = { ...clipA, id: 'media_clipB' }
    const project = projectWith({ useSourceAudio: true }, [clipA, clipB])
    const next = clearAssetReferences(project, clipA.id, [clipB])
    expect(next.audio.useSourceAudio).toBe(true)
  })

  it('clears the logo reference and drops the asset from media', () => {
    const project: Project = {
      ...goCellularProject,
      brand: { ...goCellularProject.brand, logoMediaId: 'logo_1' },
      media: [{ ...MUSIC, id: 'logo_1', kind: 'logo' }],
    }
    const next = clearAssetReferences(project, 'logo_1', [])
    expect(next.brand.logoMediaId).toBeNull()
    expect(next.media).toHaveLength(0)
  })
})

describe('retargetAssetReferences points references at the replacement', () => {
  it('moves the music selection to a compatible replacement', () => {
    const project = projectWith({ musicId: MUSIC.id }, [MUSIC])
    const next = retargetAssetReferences(project, MUSIC.id, OTHER_MUSIC, [OTHER_MUSIC])
    expect(next.audio.musicId).toBe(OTHER_MUSIC.id)
  })

  it('does not point music at an incompatible (non-audio) replacement', () => {
    const image: MediaAsset = { ...MUSIC, id: 'media_img', kind: 'image' }
    const project = projectWith({ musicId: MUSIC.id }, [MUSIC])
    const next = retargetAssetReferences(project, MUSIC.id, image, [image])
    expect(next.audio.musicId).toBeNull()
  })

  it('keeps source audio alive across a video-for-video swap that can sound', () => {
    const withSound = GO_CELLULAR_VIDEO_MEDIA.filter((m) => m.hasAudio)
    const oldClip = withSound[0]!
    const newClip: MediaAsset = { ...oldClip, id: 'media_new', hasAudio: true }
    const project = projectWith({ useSourceAudio: true }, [oldClip])
    const next = retargetAssetReferences(project, oldClip.id, newClip, [newClip])
    expect(next.audio.useSourceAudio).toBe(true)
  })
})
