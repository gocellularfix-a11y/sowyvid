import { describe, it, expect } from 'vitest'
import { mediaTileLabel, videoHasNoSound, videosWithAudio } from './mediaLabel'
import type { MediaAsset } from '@shared/domain/media'

/**
 * The tile label is the owner's ONLY way to know what SowyVid understood about
 * a file. It must describe analyzed content — an MP4 with audio is a VIDEO with
 * audio, never "music"; a video is only "Sin audio" once analysis proved it.
 */

function asset(over: Partial<MediaAsset>): MediaAsset {
  return {
    id: 'media_x',
    kind: 'image',
    relPath: 'media/files/x.jpg',
    originalName: 'x.jpg',
    mimeType: 'image/jpeg',
    hash: 'x',
    bytes: 100,
    width: 1080,
    height: 1920,
    orientation: 'portrait',
    durationSec: null,
    fps: null,
    hasAudio: false,
    container: null,
    videoCodec: null,
    audioCodec: null,
    audioSampleRate: null,
    audioChannels: null,
    thumbRelPath: null,
    posterRelPath: null,
    audioMeta: null,
    analysisStatus: 'ready',
    analysisError: null,
    valid: true,
    importedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  }
}

describe('mediaTileLabel identifies files from analyzed content', () => {
  it('labels a video WITH audio as a video, never as music', () => {
    const v = asset({
      kind: 'video',
      relPath: 'media/files/x.mp4',
      durationSec: 18.05,
      hasAudio: true,
      container: 'mov,mp4,m4a,3gp,3g2,mj2',
      audioCodec: 'aac',
    })
    expect(mediaTileLabel(v)).toBe('Video · 18 s · Con audio')
    expect(videoHasNoSound(v)).toBe(false)
  })

  it('labels an analyzed silent video as Sin audio', () => {
    const v = asset({ kind: 'video', relPath: 'media/files/x.mp4', durationSec: 8, hasAudio: false })
    expect(mediaTileLabel(v)).toBe('Video · 8 s · Sin audio')
    expect(videoHasNoSound(v)).toBe(true)
  })

  it('never claims Sin audio before analysis finished — that would be a guess', () => {
    const v = asset({ kind: 'video', relPath: 'media/files/x.mp4', analysisStatus: 'pending', hasAudio: false })
    expect(mediaTileLabel(v)).toContain('analizando')
    expect(videoHasNoSound(v)).toBe(false)
  })

  it('labels music with its format and duration', () => {
    const m = asset({ kind: 'audio', relPath: 'media/files/x.mp3', durationSec: 24.3, hasAudio: true })
    expect(mediaTileLabel(m)).toBe('Música · MP3 · 24 s')
  })

  it('labels images by orientation', () => {
    expect(mediaTileLabel(asset({}))).toBe('Imagen · Vertical')
    expect(mediaTileLabel(asset({ orientation: 'landscape' }))).toBe('Imagen · Horizontal')
    expect(mediaTileLabel(asset({ orientation: 'square' }))).toBe('Imagen · Cuadrada')
  })

  it('marks failed analysis visibly instead of guessing a kind', () => {
    const bad = asset({ kind: 'video', analysisStatus: 'failed', analysisError: 'no-video-stream' })
    expect(mediaTileLabel(bad)).toBe('Archivo no válido')
    const gone = asset({ valid: false })
    expect(mediaTileLabel(gone)).toBe('Archivo no disponible')
  })
})

describe('videosWithAudio drives the "Audio original del video" control', () => {
  it('returns only valid, analyzed videos that truly carry audio', () => {
    const withSound = asset({ id: 'media_a', kind: 'video', hasAudio: true })
    const silent = asset({ id: 'media_b', kind: 'video', hasAudio: false })
    const pending = asset({ id: 'media_c', kind: 'video', hasAudio: true, analysisStatus: 'pending' })
    const music = asset({ id: 'media_d', kind: 'audio', hasAudio: true })
    expect(videosWithAudio([withSound, silent, pending, music]).map((m) => m.id)).toEqual([
      'media_a',
    ])
  })
})
