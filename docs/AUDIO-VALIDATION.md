# Audio Validation — Content, Not Format

> Status: **Implemented for the render path.** Final human hearing confirmation
> is Jorge's; everything below is the automated part that must pass first.

## The rule

> **Never declare audio successful because FFprobe reports an AAC stream.**

A valid AAC stream can contain **digital silence**. A previous Remotion app
(Colibrí) shipped silent commercials for a month with perfectly valid audio
tracks: the composition being rendered was stale and painted no `<Audio>`
elements, so the encoder emitted a **phantom silent track**. `ffprobe` was
happy. Every format check passed. The videos were mute.

So SowyVid **decodes and measures** the audio.

## What is measured

`src/features/render/renderValidation.node.ts`

| Check | How | Threshold |
|---|---|---|
| audio stream present | `ffprobe -show_streams` | must exist |
| codec | `ffprobe` | `aac` |
| **actual signal level** | `ffmpeg -af volumedetect` → `mean_volume` | **> −50 dBFS** |
| peak level | `volumedetect` → `max_volume` | > −30 dBFS, ≤ 0 (real, not clipping) |
| duration | `ffprobe -show_format` | within ±0.5s of the plan |

Digital silence reports `-inf` (or ≈ −91 dB). Real music sits far above.
`isAudible()` requires a **finite** mean above the threshold — `-inf` fails on
both counts.

## Guarding the guard

A silence detector that never fires is worthless, and a passing test suite would
look identical. So `realRender.test.ts` renders a **deliberately silent** MP4
(`anullsrc` + AAC) and asserts:

- `ffprobe` reports `aac`, stream present → **the trap: format checks pass**
- `isAudible()` returns **false** → the measurement catches it

The same is done for picture: an all-black video must be detected as black.

## Measured evidence — packaged app (the owner's real path)

`npm run test:e2e:packaged` — the packaged `SowyVid.exe`, the real button, a
planted stale cache:

```
1080x1920 · 18.048s · 5,025,409 bytes · h264 + aac 48kHz stereo
mean_volume −26.9 dBFS (threshold −50) → AUDIBLE
```

## Measured evidence (real render, production path)

`npm run verify:render` prints a block like:

```json
{
  "resolution": "406x720",
  "durationSec": 20.054,
  "bytes": 2124337,
  "videoCodec": "h264",
  "audioCodec": "aac",
  "audioSampleRate": 48000,
  "audioChannels": 2,
  "meanVolumeDb": -26.8,
  "maxVolumeDb": -23.4,
  "silenceThresholdDb": -50,
  "audible": true
}
```

The claim "it has audio" is backed by a number anyone can read, not a green check.

## Same file, same path

> **Do not test one file externally and imply that a different app render works.**

This is how Colibrí's bug survived: the proofs rendered through a *fresh* serve
directory while production used a rotten cache. So:

- the render tests call **`runRenderJob`** — the exact function the app uses
- they plant a **stale cache** first, because that is production's real state
- the file measured is **the file the render workflow produced**, not a
  separately generated artifact

## Electron playback

`e2e-electron/audio-preview.spec.ts` imports a genuine ffmpeg mp3 through the
real IPC/MediaVault path and drives a real `<audio>` element at the controlled
`sowyvid-media://` URL **inside Electron**:

- it decodes (`loadedmetadata`, real duration)
- its clock advances while playing
- audio and video timelines match exactly

`e2e-electron/live-video-preview.spec.ts` does the same for video, including a
seek landing at 2.0s.

### Not yet done

- **`isCurrentlyAudible()` / OS-level emission evidence** is NOT collected. CI
  has no output device, and the automated checks above stop at "Electron
  decodes and plays". Colibrí's checklist rightly puts a Windows per-app mute
  in scope for a *playback* complaint — if a "no sound" report ever arrives,
  probe by layers: decode → emission to the OS → the Windows mixer.
- **Human confirmation remains the final gate.** Nothing here claims Jorge's
  ears have been replaced.

## Checklist for a "no sound" report

Adapted from the Colibrí post-mortem, kept here because the next app will need it:

1. **Is it the same file?** Copy the exact file the app produced to an external
   player. Do not reason about a different artifact.
2. **Measure content, not format.** RMS the audio. Silence = a *render* bug, not
   a playback bug.
3. **If it sounds outside but not inside**, probe by layers: decode → emission
   to the OS → the Windows mixer (per-app mute is a classic).
4. **Hunt every cache between "what you compile" and "what runs."** Compare its
   dates against the last build. An old file in the execution path is suspect #1.
5. **Invalidate caches by fingerprint, not existence** (`docs/RENDER-BUNDLE-CACHE.md`).
6. **Verifying means killing the original symptom end to end** — not each layer
   passing its own little exam.
