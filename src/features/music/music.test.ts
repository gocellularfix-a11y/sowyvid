import { describe, it, expect } from 'vitest'
import { resolve } from 'node:path'
import { resolveMusicVaultPath } from './musicPath'
import { musicUrl } from './musicUrl'
import { isMusicExtension, MUSIC_EXTENSIONS } from './musicVault.node'
import { isValidMusicTrackId } from '@shared/domain/music'
import { buildAudioPlan } from '@features/audio/soundWeaveAdapter'
import { buildMusicBriefDetail } from '@features/audio'
import { goCellularProject } from '@shared/fixtures/goCellular'
import { buildVisualPlan } from '@features/visual'
import { developProjectConcepts, compileProjectConcept } from '@features/creative'
import type { AudioConfig } from '@shared/domain/project'

const HASH = 'c'.repeat(64)
const TRACK_ID = `music_${HASH}`

describe('music vault path is guarded and controlled', () => {
  it('resolves a valid track inside the vault', () => {
    const abs = resolveMusicVaultPath('/data/music', { id: TRACK_ID, relPath: `files/${HASH}.mp3` })
    expect(abs).toBe(resolve('/data/music', `files/${HASH}.mp3`))
  })

  it('rejects a traversal relPath and a malformed id', () => {
    expect(resolveMusicVaultPath('/data/music', { id: TRACK_ID, relPath: '../../etc/passwd' })).toBeNull()
    expect(resolveMusicVaultPath('/data/music', { id: 'music_bad', relPath: `files/${HASH}.mp3` })).toBeNull()
  })

  it('builds a project-independent controlled URL — never a filesystem path', () => {
    const url = musicUrl(TRACK_ID)
    expect(url).toBe(`sowyvid-media://music/${TRACK_ID}/original`)
    expect(url).not.toMatch(/^file:/)
    expect(url).not.toMatch(/[A-Za-z]:\\/)
  })
})

describe('music content identity', () => {
  it('only MP3/WAV are music candidates this milestone', () => {
    expect([...MUSIC_EXTENSIONS]).toEqual(['mp3', 'wav'])
    expect(isMusicExtension('MP3')).toBe(true)
    expect(isMusicExtension('wav')).toBe(true)
    expect(isMusicExtension('mp4')).toBe(false)
  })

  it('a music track id must be music_<64 hex>', () => {
    expect(isValidMusicTrackId(TRACK_ID)).toBe(true)
    expect(isValidMusicTrackId('media_' + HASH)).toBe(false)
    expect(isValidMusicTrackId('music_short')).toBe(false)
  })
})

describe('AudioPlan resolves a GLOBAL Music Center track', () => {
  const visualPlan = (() => {
    const concept = developProjectConcepts(goCellularProject, 1)[0]!
    const { renderPlan } = compileProjectConcept(goCellularProject, concept.conceptId)
    return buildVisualPlan({
      renderPlan,
      brand: goCellularProject.brand,
      media: goCellularProject.media,
      industry: goCellularProject.brief.category,
    })
  })()

  function cfg(over: Partial<AudioConfig> = {}): AudioConfig {
    return {
      musicId: null,
      musicTrackId: null,
      narrationEnabled: false,
      narrationMediaId: null,
      useSourceAudio: false,
      musicVolume: 0.8,
      narrationVolume: 1,
      sourceAudioVolume: 1,
      ...over,
    }
  }

  it('plays the catalog track through the music:// URL at the commercial volume', () => {
    const plan = buildAudioPlan({
      projectId: goCellularProject.id,
      audio: cfg({ musicTrackId: TRACK_ID, musicVolume: 0.5 }),
      visualPlan,
      media: goCellularProject.media,
      resolveMusicTrack: (id) => (id === TRACK_ID ? { id, durationSec: 8, valid: true } : null),
    })
    expect(plan.music).not.toBeNull()
    expect(plan.music!.assetId).toBe(TRACK_ID)
    expect(plan.music!.url).toBe(`sowyvid-media://music/${TRACK_ID}/original`)
    // The commercial's background-music volume — distinct from any preview control.
    expect(plan.music!.volume).toBe(0.5)
    expect(plan.silent).toBe(false)
  })

  it('reports a selected-but-missing catalog track instead of silence', () => {
    const plan = buildAudioPlan({
      projectId: goCellularProject.id,
      audio: cfg({ musicTrackId: TRACK_ID }),
      visualPlan,
      media: goCellularProject.media,
      resolveMusicTrack: () => null, // gone from the catalog
    })
    expect(plan.music).toBeNull()
    expect(plan.missingTracks).toEqual([{ role: 'music', assetId: TRACK_ID, reason: 'not-found' }])
  })

  it('reports a catalog track whose managed file vanished', () => {
    const plan = buildAudioPlan({
      projectId: goCellularProject.id,
      audio: cfg({ musicTrackId: TRACK_ID }),
      visualPlan,
      media: goCellularProject.media,
      resolveMusicTrack: (id) => ({ id, durationSec: 8, valid: false }),
    })
    expect(plan.music).toBeNull()
    expect(plan.missingTracks[0]!.reason).toBe('file-missing')
  })

  it('a global selection supersedes a legacy project-scoped musicId', () => {
    const plan = buildAudioPlan({
      projectId: goCellularProject.id,
      audio: cfg({ musicTrackId: TRACK_ID, musicId: 'media_legacy' }),
      visualPlan,
      media: goCellularProject.media,
      resolveMusicTrack: (id) => ({ id, durationSec: 8, valid: true }),
    })
    expect(plan.music!.url).toContain('/music/')
  })
})

describe('deterministic Suno brief', () => {
  const input = {
    businessName: 'Go Cellular',
    industry: 'phone-electronics',
    productOrService: 'reparación de pantallas',
    tone: 'bold-retail',
    visualEnergy: 'energetic' as const,
    durationSec: 18,
    mood: 'confiado',
  }

  it('is instrumental by default and fully deterministic', () => {
    const a = buildMusicBriefDetail(input)
    const b = buildMusicBriefDetail(input)
    expect(a).toEqual(b)
    expect(a.vocals).toMatch(/Instrumental/)
    expect(a.durationSec).toBe(18)
    expect(a.tempo).toMatch(/BPM/)
    expect(a.avoid).toMatch(/[Vv]oces/)
  })

  it('only adds vocals when the owner explicitly asks', () => {
    const withVocals = buildMusicBriefDetail({ ...input, wantsVocals: true })
    expect(withVocals.vocals).toMatch(/Con voz/)
  })
})
