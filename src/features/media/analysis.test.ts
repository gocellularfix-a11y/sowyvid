import { describe, it, expect, beforeAll } from 'vitest'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtempSync, existsSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import ffmpegPath from 'ffmpeg-static'
import { importMedia } from './mediaImport.node'
import { analyzeMedia } from './analysis.node'

const execFileAsync = promisify(execFile)
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)

// These tests exercise the REAL ffprobe/ffmpeg boundary. ffmpeg-static provides
// the binary; we also use it to synthesize a genuine test clip.
const hasFfmpeg = Boolean(ffmpegPath)

describe('media analysis (real ffprobe/ffmpeg)', () => {
  let root: string
  let videoPath: string

  beforeAll(async () => {
    if (!hasFfmpeg) return
    root = mkdtempSync(join(tmpdir(), 'sowyvid-analysis-'))
    videoPath = join(mkdtempSync(join(tmpdir(), 'sowyvid-clip-')), 'clip.mp4')
    await execFileAsync(
      ffmpegPath as string,
      [
        '-y',
        '-f', 'lavfi', '-i', 'testsrc=duration=1:size=320x240:rate=30',
        '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1',
        '-pix_fmt', 'yuv420p', '-shortest', videoPath,
      ],
      { timeout: 30_000 },
    )
  }, 40_000)

  it.runIf(hasFfmpeg)('probes a real video: dimensions, duration, fps, audio, poster', async () => {
    const { media } = await importMedia(root, [], [{ kind: 'path', path: videoPath }])
    expect(media[0]?.kind).toBe('video')
    const analyzed = await analyzeMedia(root, media)
    const v = analyzed[0]!
    expect(v.analysisStatus).toBe('ready')
    expect(v.width).toBe(320)
    expect(v.height).toBe(240)
    expect(v.orientation).toBe('landscape')
    expect(v.durationSec).toBeGreaterThan(0.8)
    expect(v.fps).toBeGreaterThan(25)
    expect(v.hasAudio).toBe(true)
    // Poster generated into managed storage.
    expect(v.posterRelPath).toBeTruthy()
    expect(existsSync(join(root, 'posters', `${v.id.replace('media_', '')}.jpg`))).toBe(true)
  }, 40_000)

  it.runIf(hasFfmpeg)('generates an image thumbnail and marks analysis ready', async () => {
    const imgRoot = mkdtempSync(join(tmpdir(), 'sowyvid-analysis-img-'))
    const src = join(imgRoot, 'pic.png')
    writeFileSync(src, PNG_1x1)
    const { media } = await importMedia(imgRoot, [], [{ kind: 'path', path: src }])
    const analyzed = await analyzeMedia(imgRoot, media)
    expect(analyzed[0]?.analysisStatus).toBe('ready')
    expect(analyzed[0]?.valid).toBe(true) // thumbnail success/failure never invalidates source
  }, 40_000)
})
