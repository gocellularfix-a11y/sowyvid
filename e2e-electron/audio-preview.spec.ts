import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtempSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ffmpegPath from 'ffmpeg-static'

/**
 * Real-Electron audio test.
 *
 * A valid AudioPlan proves nothing about whether Electron can actually make
 * sound: an audio element that never decodes produces the same silent video as
 * a perfect plan. So this test imports a GENUINE mp3 through the real IPC path
 * and drives a real <audio> element at the controlled `sowyvid-media://` URL —
 * the exact URL the composition uses — checking that it decodes, reports a real
 * duration, and that its clock advances while playing.
 *
 * Human hearing confirmation is Jorge's; this is the automated part.
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

/** A genuine 6s mp3 with an actual 440Hz tone — real signal, not silence. */
async function makeMusic(): Promise<string> {
  const path = join(mkdtempSync(join(tmpdir(), 'sowyvid-asrc-')), 'music.mp3')
  await execFileAsync(
    ffmpegPath as string,
    ['-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=6', '-c:a', 'libmp3lame', path],
    { timeout: 60_000 },
  )
  return path
}

test('a real managed music track decodes and plays through the controlled protocol', async () => {
  expect(existsSync(mainEntry), 'run `npm run build` first').toBe(true)
  expect(ffmpegPath, 'ffmpeg-static is required for this test').toBeTruthy()

  const music = await makeMusic()
  const userData = mkdtempSync(join(tmpdir(), 'sowyvid-audio-'))
  const app = await launch(userData)
  const win = await app.firstWindow()

  const out = await win.evaluate(async (musicPath) => {
    const bridge = window.sowyvid
    if (!bridge) throw new Error('preload bridge missing')

    const created = await bridge.projects.create({
      name: 'Audio',
      brief: { productOrService: 'reparación de pantallas' },
    })
    if (!created.ok) throw new Error('create failed')
    const projectId = created.value.id

    const imported = await bridge.media.import({ projectId, paths: [musicPath] })
    if (!imported.ok) throw new Error(`import failed: ${JSON.stringify(imported)}`)
    const asset = imported.value.project.media[0]
    if (!asset) throw new Error('no asset')

    // Select it as the commercial's music, exactly as the owner would.
    const saved = await bridge.projects.save({
      ...imported.value.project,
      audio: { ...imported.value.project.audio, musicId: asset.id },
    })
    if (!saved.ok) throw new Error(`save failed: ${JSON.stringify(saved)}`)

    const concepts = await bridge.engine.developConcepts({ projectId, count: 1 })
    if (!concepts.ok) throw new Error('develop failed')
    const compiled = await bridge.engine.compile({
      projectId,
      conceptId: concepts.value[0]!.conceptId,
    })
    if (!compiled.ok) throw new Error('compile failed')
    const audioPlan = compiled.value.audioPlan

    // --- real decode + playback of the managed track ---
    const url = `sowyvid-media://asset/${projectId}/${asset.id}/original`
    const el = document.createElement('audio')
    el.src = url
    el.muted = true // CI has no output device; we assert the clock, not loudness
    document.body.appendChild(el)

    const waitFor = (event: string, ms: number) =>
      new Promise<void>((res, rej) => {
        const timer = setTimeout(() => rej(new Error(`${event} timed out`)), ms)
        el.addEventListener(event, () => { clearTimeout(timer); res() }, { once: true })
        el.addEventListener('error', () => {
          clearTimeout(timer)
          rej(new Error(`audio error: ${el.error?.code ?? 'unknown'}`))
        }, { once: true })
      })

    await waitFor('loadedmetadata', 20_000)
    const duration = el.duration

    await el.play()
    await new Promise((r) => setTimeout(r, 600))
    const playedTo = el.currentTime
    el.pause()
    el.remove()

    return {
      assetKind: asset.kind,
      assetDuration: asset.durationSec,
      analysisStatus: asset.analysisStatus,
      musicTrack: audioPlan.music,
      engineName: audioPlan.audioEngineName,
      engineVersion: audioPlan.audioEngineVersion,
      silent: audioPlan.silent,
      missing: audioPlan.missingTracks,
      totalFrames: audioPlan.totalDurationInFrames,
      visualFrames: compiled.value.visualPlan.totalDurationInFrames,
      duration,
      playedTo,
    }
  }, music)

  // The mp3 imported and was analyzed as real audio.
  expect(out.assetKind).toBe('audio')
  expect(out.analysisStatus).toBe('ready')
  expect(out.assetDuration).toBeGreaterThan(5.5)

  // SoundWeave produced a real plan, and it is recorded as the author.
  expect(out.engineName).toBe('@jorge-engines/soundweave-audio')
  expect(out.engineVersion).toBe('1.0.0')
  expect(out.silent).toBe(false)
  expect(out.missing).toEqual([])
  expect(out.musicTrack).not.toBeNull()
  expect(out.musicTrack!.url).toContain('sowyvid-media://')
  expect(out.musicTrack!.fadeInFrames).toBeGreaterThan(0)
  expect(out.musicTrack!.fadeOutFrames).toBeGreaterThan(0)
  // 6s of music under a ~20s commercial must loop.
  expect(out.musicTrack!.loop).toBe(true)

  // Sound and picture share ONE timeline, exactly.
  expect(out.totalFrames).toBe(out.visualFrames)
  expect(out.musicTrack!.endFrame).toBe(out.visualFrames)

  // Electron genuinely decoded it...
  expect(out.duration).toBeGreaterThan(5.5)
  // ...and genuinely played it: the clock advanced.
  expect(out.playedTo).toBeGreaterThan(0)

  await app.close()
})
