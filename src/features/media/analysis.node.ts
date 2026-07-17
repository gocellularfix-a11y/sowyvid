import { execFile } from 'node:child_process'
import { mkdir, access } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { MediaAsset } from '@shared/domain/media'
import { unpackedBinaryPath } from './unpackedPath'

/**
 * Media analysis via a controlled FFprobe/FFmpeg boundary. All invocations use
 * `execFile` with ARGUMENT ARRAYS (never a shell string) over validated managed
 * paths — no user input ever reaches command construction. Runs in the main
 * process as child processes, so the renderer is never blocked and the main JS
 * thread is not doing the heavy work.
 *
 * Tool availability is optional: if the ffprobe/ffmpeg binaries can't be
 * resolved, an otherwise-valid source file is NOT invalidated — analysis simply
 * reports 'failed' (video) or 'ready' with what's already known (image/audio).
 */

const execFileAsync = promisify(execFile)

interface Tools {
  ffprobe: string | null
  ffmpeg: string | null
}
let cachedTools: Tools | null = null

async function resolveTools(): Promise<Tools> {
  if (cachedTools) return cachedTools
  let ffprobe: string | null = null
  let ffmpeg: string | null = null
  try {
    const mod = await import('ffprobe-static')
    ffprobe = mod.default?.path ?? null
  } catch {
    ffprobe = process.env.SOWYVID_FFPROBE ?? null
  }
  try {
    const mod = await import('ffmpeg-static')
    ffmpeg = mod.default ?? null
  } catch {
    ffmpeg = process.env.SOWYVID_FFMPEG ?? null
  }
  // Packaged apps: the modules report a path inside app.asar, but spawn cannot
  // execute from an archive — the real binaries live in app.asar.unpacked.
  cachedTools = {
    ffprobe: ffprobe ? unpackedBinaryPath(ffprobe) : null,
    ffmpeg: ffmpeg ? unpackedBinaryPath(ffmpeg) : null,
  }
  return cachedTools
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

interface ProbeResult {
  width: number | null
  height: number | null
  durationSec: number | null
  fps: number | null
  hasAudio: boolean
  hasVideo: boolean
  container: string | null
  videoCodec: string | null
  audioCodec: string | null
  audioSampleRate: number | null
  audioChannels: number | null
}

function parseFps(rate: string | undefined): number | null {
  if (!rate) return null
  const [n, d] = rate.split('/').map(Number)
  if (!n || !d) return null
  return Number((n / d).toFixed(3))
}

export interface MusicAnalysis {
  /** Whether the analyzer could run at all. */
  analyzed: boolean
  hasAudio: boolean
  durationSec: number | null
  container: string | null
  codec: string | null
  sampleRate: number | null
  channels: number | null
}

/**
 * Analyze a candidate music file with ffprobe. Used by the global Music Center
 * import. An MP3/WAV with no decodable audio stream is NOT a valid track. When
 * ffprobe is unavailable, `analyzed` is false and the caller keeps what it knows
 * (never invalidating an otherwise-valid file).
 */
export async function analyzeMusicFile(filePath: string): Promise<MusicAnalysis> {
  const unknown: MusicAnalysis = {
    analyzed: false, hasAudio: false, durationSec: null, container: null, codec: null, sampleRate: null, channels: null,
  }
  const { ffprobe } = await resolveTools()
  if (!ffprobe) return unknown
  try {
    const meta = await probe(ffprobe, filePath)
    return {
      analyzed: true,
      hasAudio: meta.hasAudio,
      durationSec: meta.durationSec,
      container: meta.container,
      codec: meta.audioCodec,
      sampleRate: meta.audioSampleRate,
      channels: meta.audioChannels,
    }
    // A probe failure must never crash an import or the legacy migration — the
    // caller keeps what it already knows (never invalidating a valid file).
  } catch {
    return unknown
  }
}

async function probe(ffprobe: string, filePath: string): Promise<ProbeResult> {
  const { stdout } = await execFileAsync(
    ffprobe,
    ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', filePath],
    { timeout: 20_000, maxBuffer: 8 * 1024 * 1024 },
  )
  const data = JSON.parse(stdout) as {
    streams?: Array<{
      codec_type?: string
      codec_name?: string
      width?: number
      height?: number
      avg_frame_rate?: string
      duration?: string
      sample_rate?: string
      channels?: number
    }>
    format?: { duration?: string; format_name?: string }
  }
  const streams = data.streams ?? []
  const video = streams.find((s) => s.codec_type === 'video')
  const audio = streams.find((s) => s.codec_type === 'audio')
  const durationRaw = data.format?.duration ?? video?.duration ?? audio?.duration
  const durationSec = durationRaw ? Number(Number(durationRaw).toFixed(3)) : null
  const sampleRate = audio?.sample_rate ? Number(audio.sample_rate) : null
  return {
    width: video?.width ?? null,
    height: video?.height ?? null,
    durationSec: durationSec && durationSec > 0 ? durationSec : null,
    fps: parseFps(video?.avg_frame_rate),
    hasAudio: Boolean(audio),
    hasVideo: Boolean(video),
    container: data.format?.format_name ?? null,
    videoCodec: video?.codec_name ?? null,
    audioCodec: audio?.codec_name ?? null,
    audioSampleRate: sampleRate && sampleRate > 0 ? sampleRate : null,
    audioChannels: audio?.channels && audio.channels > 0 ? audio.channels : null,
  }
}

function orientationFrom(width: number | null, height: number | null): MediaAsset['orientation'] {
  if (!width || !height) return null
  return width === height ? 'square' : width > height ? 'landscape' : 'portrait'
}

/**
 * Analyze one asset and return the fields to merge back. `vaultRoot` is
 * `<project>/media`; managed files/derivatives live under it. Never throws — a
 * failure produces a `failed` status with a safe reason, keeping `valid` true.
 */
export async function analyzeAsset(
  vaultRoot: string,
  asset: MediaAsset,
): Promise<Partial<MediaAsset>> {
  const { ffprobe, ffmpeg } = await resolveTools()
  const ext = asset.relPath.split('.').pop() ?? 'bin'
  const hash = asset.id.replace(/^media_/, '')
  const filePath = join(vaultRoot, 'files', `${hash}.${ext}`)

  if (!(await fileExists(filePath))) {
    return { analysisStatus: 'failed', analysisError: 'missing-managed-file' }
  }

  try {
    if (asset.kind === 'image' || asset.kind === 'logo') {
      const thumb = await maybeThumbnail(ffmpeg, vaultRoot, filePath, hash)
      return {
        analysisStatus: 'ready',
        analysisError: null,
        ...(thumb ? { thumbRelPath: thumb } : {}),
      }
    }

    if (asset.kind === 'audio') {
      const meta = ffprobe ? await probe(ffprobe, filePath) : null
      // The extension proposed "music" — the analyzed content must agree. A
      // file with no decodable audio stream is not a music candidate.
      if (meta && !meta.hasAudio) {
        return { analysisStatus: 'failed', analysisError: 'no-audio-stream', valid: false }
      }
      return {
        analysisStatus: 'ready',
        analysisError: null,
        hasAudio: true,
        ...(meta?.durationSec ? { durationSec: meta.durationSec } : {}),
        ...(meta
          ? {
              container: meta.container,
              audioCodec: meta.audioCodec,
              audioSampleRate: meta.audioSampleRate,
              audioChannels: meta.audioChannels,
            }
          : {}),
      }
    }

    // video
    if (!ffprobe) {
      return { analysisStatus: 'failed', analysisError: 'analyzer-unavailable' }
    }
    const meta = await probe(ffprobe, filePath)
    // Extension said video, container has no video stream → visibly invalid,
    // never silently treated as something else.
    if (!meta.hasVideo) {
      return { analysisStatus: 'failed', analysisError: 'no-video-stream', valid: false }
    }
    const poster = await maybePoster(ffmpeg, vaultRoot, filePath, hash, meta.durationSec)
    return {
      analysisStatus: 'ready',
      analysisError: null,
      width: meta.width,
      height: meta.height,
      orientation: orientationFrom(meta.width, meta.height),
      durationSec: meta.durationSec,
      fps: meta.fps,
      hasAudio: meta.hasAudio,
      container: meta.container,
      videoCodec: meta.videoCodec,
      audioCodec: meta.audioCodec,
      audioSampleRate: meta.audioSampleRate,
      audioChannels: meta.audioChannels,
      ...(poster ? { posterRelPath: poster } : {}),
    }
  } catch (e) {
    return {
      analysisStatus: 'failed',
      analysisError: e instanceof Error ? e.message.slice(0, 200) : 'analysis-error',
    }
  }
}

/** Generate an optimized image thumbnail; returns project-relative path or null. */
async function maybeThumbnail(
  ffmpeg: string | null,
  vaultRoot: string,
  filePath: string,
  hash: string,
): Promise<string | null> {
  if (!ffmpeg) return null
  const outDir = join(vaultRoot, 'thumbnails')
  await mkdir(outDir, { recursive: true })
  const outPath = join(outDir, `${hash}.jpg`)
  try {
    await execFileAsync(
      ffmpeg,
      ['-y', '-i', filePath, '-vf', 'scale=480:-2', '-frames:v', '1', outPath],
      { timeout: 20_000 },
    )
    return (await fileExists(outPath)) ? `media/thumbnails/${hash}.jpg` : null
  } catch {
    return null // thumbnail failure never invalidates the source
  }
}

/** Extract a representative video poster (early, non-black frame); path or null. */
async function maybePoster(
  ffmpeg: string | null,
  vaultRoot: string,
  filePath: string,
  hash: string,
  durationSec: number | null,
): Promise<string | null> {
  if (!ffmpeg) return null
  const outDir = join(vaultRoot, 'posters')
  await mkdir(outDir, { recursive: true })
  const outPath = join(outDir, `${hash}.jpg`)
  const seek = durationSec && durationSec > 1 ? Math.min(1, durationSec * 0.25) : 0
  try {
    await execFileAsync(
      ffmpeg,
      ['-y', '-ss', String(seek), '-i', filePath, '-frames:v', '1', '-vf', 'scale=640:-2', outPath],
      { timeout: 25_000 },
    )
    return (await fileExists(outPath)) ? `media/posters/${hash}.jpg` : null
  } catch {
    return null // poster failure never invalidates the source
  }
}

/** Analyze all pending assets, returning the media list with analysis merged in. */
export async function analyzeMedia(
  vaultRoot: string,
  assets: readonly MediaAsset[],
): Promise<MediaAsset[]> {
  const result: MediaAsset[] = []
  for (const asset of assets) {
    if (asset.analysisStatus === 'ready') {
      result.push(asset)
      continue
    }
    const patch = await analyzeAsset(vaultRoot, asset)
    result.push({ ...asset, ...patch })
  }
  return result
}
