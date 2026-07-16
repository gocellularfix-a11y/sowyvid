import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const execFileAsync = promisify(execFile)

/**
 * Verification of a RENDERED file — content, not container.
 *
 * ## Why this is not "check ffprobe reports AAC"
 *
 * A valid AAC stream can be digital silence. A previous Remotion app shipped
 * silent commercials for a month with a perfectly valid audio track: the
 * composition being rendered was stale and painted no `<Audio>` elements, so
 * the encoder emitted a phantom silent track. ffprobe was happy. Every format
 * check passed. The videos were mute.
 *
 * So: decode the audio and MEASURE it. Same for picture — a container with the
 * right dimensions says nothing about whether the owner's photos are visible or
 * whether the video is 20 seconds of black.
 */

/** Digital silence reports about -91 dBFS (or -inf). Real content sits far above. */
export const SILENCE_THRESHOLD_DB = -50

export interface AudioStreamInfo {
  present: boolean
  codec: string | null
  sampleRate: number | null
  channels: number | null
}

export interface VideoStreamInfo {
  present: boolean
  codec: string | null
  width: number | null
  height: number | null
}

export interface MediaProbe {
  durationSec: number | null
  audio: AudioStreamInfo
  video: VideoStreamInfo
}

export interface AudioLevels {
  /** RMS mean level in dBFS. -Infinity for pure digital silence. */
  meanVolumeDb: number
  /** Peak level in dBFS. */
  maxVolumeDb: number
}

interface FfprobeStream {
  codec_type?: string
  codec_name?: string
  sample_rate?: string
  channels?: number
  width?: number
  height?: number
}

/** Probe container/stream metadata. Necessary, but never sufficient. */
export async function probeMedia(ffprobePath: string, file: string): Promise<MediaProbe> {
  const { stdout } = await execFileAsync(
    ffprobePath,
    ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file],
    { timeout: 60_000, maxBuffer: 10 * 1024 * 1024 },
  )
  const parsed = JSON.parse(stdout) as {
    streams?: FfprobeStream[]
    format?: { duration?: string }
  }
  const streams = parsed.streams ?? []
  const audio = streams.find((s) => s.codec_type === 'audio')
  const video = streams.find((s) => s.codec_type === 'video')
  const duration = parsed.format?.duration ? Number(parsed.format.duration) : null

  return {
    durationSec: duration !== null && Number.isFinite(duration) ? duration : null,
    audio: {
      present: Boolean(audio),
      codec: audio?.codec_name ?? null,
      sampleRate: audio?.sample_rate ? Number(audio.sample_rate) : null,
      channels: audio?.channels ?? null,
    },
    video: {
      present: Boolean(video),
      codec: video?.codec_name ?? null,
      width: video?.width ?? null,
      height: video?.height ?? null,
    },
  }
}

/**
 * Decode the audio and measure its actual level via ffmpeg's `volumedetect`.
 * This is the check that separates "has an audio stream" from "makes sound".
 */
export async function measureAudioLevels(ffmpegPath: string, file: string): Promise<AudioLevels> {
  // volumedetect reports on stderr; -f null discards the decoded output.
  const { stderr } = await execFileAsync(
    ffmpegPath,
    ['-nostats', '-i', file, '-map', '0:a:0', '-af', 'volumedetect', '-f', 'null', '-'],
    { timeout: 120_000, maxBuffer: 10 * 1024 * 1024 },
  ).catch((e: { stderr?: string }) => ({ stderr: e.stderr ?? '' }))

  const parse = (label: string): number => {
    const m = new RegExp(`${label}:\\s*(-?[\\d.]+|-inf)\\s*dB`).exec(stderr)
    if (!m?.[1]) return -Infinity
    return m[1] === '-inf' ? -Infinity : Number(m[1])
  }

  return { meanVolumeDb: parse('mean_volume'), maxVolumeDb: parse('max_volume') }
}

/** True when the measured level is real signal rather than digital silence. */
export function isAudible(levels: AudioLevels, thresholdDb = SILENCE_THRESHOLD_DB): boolean {
  return Number.isFinite(levels.meanVolumeDb) && levels.meanVolumeDb > thresholdDb
}

export interface ExtractedFrame {
  atSec: number
  /** Raw RGB24 pixels. */
  pixels: Buffer
  width: number
  height: number
}

/**
 * Extract a frame as raw RGB at a given timestamp. Small `scale` keeps analysis
 * cheap — we are asking "is anything there?", not inspecting detail.
 */
export async function extractFrame(
  ffmpegPath: string,
  file: string,
  atSec: number,
  size = { width: 64, height: 64 },
): Promise<ExtractedFrame> {
  const dir = await mkdtemp(join(tmpdir(), 'sowyvid-frame-'))
  const out = join(dir, 'frame.rgb')
  try {
    await execFileAsync(
      ffmpegPath,
      [
        '-y',
        '-ss', String(atSec),
        '-i', file,
        '-frames:v', '1',
        '-vf', `scale=${size.width}:${size.height}`,
        '-pix_fmt', 'rgb24',
        '-f', 'rawvideo',
        out,
      ],
      { timeout: 60_000 },
    )
    return { atSec, pixels: await readFile(out), width: size.width, height: size.height }
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}

export interface FrameStats {
  /** 0..255 mean luminance. */
  meanLuma: number
  /** Standard deviation of luminance — 0 means a completely flat frame. */
  stdDevLuma: number
}

export function frameStats(frame: ExtractedFrame): FrameStats {
  const px = frame.pixels
  const count = Math.floor(px.length / 3)
  if (count === 0) return { meanLuma: 0, stdDevLuma: 0 }

  const luma = new Float64Array(count)
  for (let i = 0; i < count; i++) {
    // Rec. 601 luma.
    luma[i] = 0.299 * px[i * 3]! + 0.587 * px[i * 3 + 1]! + 0.114 * px[i * 3 + 2]!
  }
  let sum = 0
  for (let i = 0; i < count; i++) sum += luma[i]!
  const mean = sum / count
  let variance = 0
  for (let i = 0; i < count; i++) variance += (luma[i]! - mean) ** 2
  return { meanLuma: mean, stdDevLuma: Math.sqrt(variance / count) }
}

/** True when a frame is essentially black. */
export function isBlackFrame(stats: FrameStats): boolean {
  return stats.meanLuma < 8 && stats.stdDevLuma < 3
}

/** True when a frame is a flat fill (one colour, no content). */
export function isBlankFrame(stats: FrameStats): boolean {
  return stats.stdDevLuma < 2
}

/** How different two frames are (mean absolute per-channel difference, 0..255). */
export function frameDifference(a: ExtractedFrame, b: ExtractedFrame): number {
  const len = Math.min(a.pixels.length, b.pixels.length)
  if (len === 0) return 0
  let total = 0
  for (let i = 0; i < len; i++) total += Math.abs(a.pixels[i]! - b.pixels[i]!)
  return total / len
}
