import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtempSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ffmpegPath from 'ffmpeg-static'

/**
 * Real-Electron live-video test.
 *
 * The preview used to show a poster still for video. Proving that is fixed means
 * proving a REAL managed clip decodes and plays inside the REAL app — not that a
 * prop object has the right shape (unit tests already cover that), and not that
 * some file plays somewhere else.
 *
 * So this test synthesizes a genuine MP4 with ffmpeg, imports it through the
 * real IPC/MediaVault path, and then drives an actual <video> element pointed at
 * the controlled `sowyvid-media://` URL — the exact URL the composition uses:
 *
 *   - the protocol advertises and honors byte ranges (seeking depends on it)
 *   - the clip reports real dimensions/duration (it decoded)
 *   - currentTime advances (frames are actually playing, not a frozen still)
 *   - a seek lands where asked (the Player stays in sync)
 */

const execFileAsync = promisify(execFile)
const repoRoot = resolve(fileURLToPath(import.meta.url), '..', '..')
const mainEntry = join(repoRoot, 'out', 'main', 'index.js')

async function launch(userDataDir: string): Promise<ElectronApplication> {
  return electron.launch({
    args: [mainEntry],
    env: { ...process.env, SOWYVID_USER_DATA: userDataDir },
  })
}

/** A genuine 3s H.264 clip WITH an audio track (so muting is tested honestly). */
async function makeClip(): Promise<string> {
  const path = join(mkdtempSync(join(tmpdir(), 'sowyvid-vsrc-')), 'clip.mp4')
  await execFileAsync(
    ffmpegPath as string,
    [
      '-y',
      '-f', 'lavfi', '-i', 'testsrc=duration=3:size=320x240:rate=30',
      '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-shortest', path,
    ],
    { timeout: 60_000 },
  )
  return path
}

test('a real managed video decodes, plays and seeks through the controlled protocol', async () => {
  expect(existsSync(mainEntry), 'run `npm run build` first').toBe(true)
  expect(ffmpegPath, 'ffmpeg-static is required for this test').toBeTruthy()

  const clip = await makeClip()
  const userData = mkdtempSync(join(tmpdir(), 'sowyvid-livevideo-'))
  const app = await launch(userData)
  const win = await app.firstWindow()

  const out = await win.evaluate(async (clipPath) => {
    const bridge = window.sowyvid
    if (!bridge) throw new Error('preload bridge missing')

    const created = await bridge.projects.create({
      name: 'Live video',
      brief: { productOrService: 'reparación de pantallas' },
    })
    if (!created.ok) throw new Error('create failed')
    const projectId = created.value.id

    const imported = await bridge.media.import({ projectId, paths: [clipPath] })
    if (!imported.ok) throw new Error(`import failed: ${JSON.stringify(imported)}`)
    const asset = imported.value.project.media[0]
    if (!asset) throw new Error('no asset')

    const url = `sowyvid-media://asset/${projectId}/${asset.id}/original`

    // --- the protocol must support ranges, or seeking is unreliable ---
    const full = await fetch(url)
    const size = Number(full.headers.get('content-length'))
    const acceptRanges = full.headers.get('accept-ranges')

    const partial = await fetch(url, { headers: { Range: 'bytes=0-99' } })
    const partialBytes = (await partial.arrayBuffer()).byteLength

    // --- real decode + playback of the managed clip ---
    const v = document.createElement('video')
    v.muted = true // source audio stays silent unless SoundWeave enables it
    v.playsInline = true
    v.src = url
    document.body.appendChild(v)

    const waitFor = (event: string, ms: number) =>
      new Promise<void>((res, rej) => {
        const timer = setTimeout(() => rej(new Error(`${event} timed out`)), ms)
        v.addEventListener(event, () => { clearTimeout(timer); res() }, { once: true })
        v.addEventListener('error', () => {
          clearTimeout(timer)
          rej(new Error(`video error: ${v.error?.code ?? 'unknown'}`))
        }, { once: true })
      })

    await waitFor('loadedmetadata', 20_000)
    const meta = { width: v.videoWidth, height: v.videoHeight, duration: v.duration }

    await v.play()
    await new Promise((r) => setTimeout(r, 700))
    const playedTo = v.currentTime
    v.pause()

    // --- seeking lands where asked (Player sync depends on this) ---
    v.currentTime = 2
    await waitFor('seeked', 20_000)
    const seekedTo = v.currentTime

    v.remove()

    return {
      assetId: asset.id,
      kind: asset.kind,
      hasAudio: asset.hasAudio,
      durationSec: asset.durationSec,
      hasPoster: asset.posterRelPath !== null,
      analysisStatus: asset.analysisStatus,
      fullStatus: full.status,
      size,
      acceptRanges,
      partialStatus: partial.status,
      partialContentRange: partial.headers.get('content-range'),
      partialBytes,
      meta,
      playedTo,
      seekedTo,
    }
  }, clip)

  // The import produced a real, analyzed video asset.
  expect(out.kind).toBe('video')
  expect(out.analysisStatus).toBe('ready')
  expect(out.durationSec).toBeGreaterThan(2.5)
  expect(out.durationSec).toBeLessThan(3.5)
  expect(out.hasAudio).toBe(true)
  expect(out.hasPoster).toBe(true)

  // The protocol serves it, and honors byte ranges.
  expect(out.fullStatus).toBe(200)
  expect(out.acceptRanges).toBe('bytes')
  expect(out.partialStatus).toBe(206)
  expect(out.partialContentRange).toBe(`bytes 0-99/${out.size}`)
  expect(out.partialBytes).toBe(100)

  // It genuinely decoded: real dimensions and duration.
  expect(out.meta.width).toBe(320)
  expect(out.meta.height).toBe(240)
  expect(out.meta.duration).toBeGreaterThan(2.5)

  // It genuinely played: the clock advanced past the first frame.
  expect(out.playedTo).toBeGreaterThan(0)

  // It genuinely seeked: this is what keeps the Player in sync.
  expect(out.seekedTo).toBeGreaterThan(1.9)
  expect(out.seekedTo).toBeLessThan(2.1)

  await app.close()
})
