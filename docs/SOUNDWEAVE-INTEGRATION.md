# SoundWeave Audio Engine — Audit & Integration

> Status: **Audited and vendored.** This document is the audit required before
> integration: the engine's *real* API and contracts as read from its source and
> **verified by probing the vendored copy**, not as described by its README.

## Source & provenance

| | |
|---|---|
| Package | `@jorge-engines/soundweave-audio` |
| Version | `1.0.0` |
| Vault | `Jorge-Engine-Vault-v1.0.0.zip` |
| Vault SHA-256 | `8174539688688D78DF698109A31680235F20523B094D72D9881452FD8996C2F0` — **re-verified, matches** |
| Audited from | the read-only audit extraction (`Jorge-Engine-Vault-v1-Audit/`); the ZIP itself was never modified |
| Vendored to | `packages/soundweave-audio-engine/` — **byte-identical** copy of `src/`, `tests/`, `package.json` |
| Consumed via | path alias `@jorge-engines/soundweave-audio` → `packages/soundweave-audio-engine/src/index.ts` |

**Runtime dependencies: `zod` only.** No React, Electron, Remotion, filesystem,
Northstar, FrameLogic, MediaVault, SQLite, or branding — the generic boundary is
genuine, not merely claimed. Verified: `src/index.ts` has exactly one import.

### Validation under SowyVid's toolchain

The vault's own `npm install` fails in this environment (documented workspace
bug), so — as with every other engine — SoundWeave is vendored as source and
validated under SowyVid's toolchain instead.

**Its own 5 vault tests pass unmodified here**, matching the vault's documented
count (`VAULT-VALIDATION.md`: SoundWeave Audio — 1 file, 5 tests).

## The naming collision (read this first)

The engine and this product use the name "AudioPlan" for **different things**:

| Name | Owner | Meaning |
|---|---|---|
| `AudioPlan` / `AudioPlanInput` | **SoundWeave** | the **INPUT** — what the owner *wants* (music asset, volumes, narration mode) |
| `AudioMixPlan` | **SoundWeave** | the **OUTPUT** — the resolved, frame-accurate mix |
| `AudioPlan` | **SowyVid** (`src/features/audio/audioPlan.ts`) | the **persisted contract** — SoundWeave's output *plus* engine identity, source-video-audio policy, and missing-track state |

SowyVid's `AudioPlan` is a superset because the engine's output alone does not
carry everything the milestone requires (engine name/version, source-video audio,
missing-track state — see *Limitations*).

## Real public API

Everything `src/index.ts` actually exports:

```ts
// Constants
AUDIO_DEFAULTS  // musicVolume .5, voiceVolume 1, clipVolume 1, masterVolume 1,
                // musicFadeInSec 1, musicFadeOutSec 1.5, duckAmount .6,
                // duckRampSec .3, maxNarrationOverhangSec 1.5

// Schemas (zod)
VoiceSegmentSchema · MusicPlanSchema · VoicePlanSchema · ExtraClipPlanSchema
AudioPlanSchema · AudioSceneWindowSchema · ResolvedAudioAssetSchema

// Types
VoiceSegment · AudioPlan · AudioPlanInput · AudioSceneWindow
ResolvedAudioAsset · AudioAssetResolver
MusicMix · NarrationClipMix · ExtraClipMix · DuckSegment · AudioMixPlan
NarrationFitStatus · NarrationSceneFit · NarrationFitReport

// Functions
resolveAudioMix(audio, scenes, fps, resolve): AudioMixPlan | null   // the main entry
reconcileNarration(scenes, segments, fps, maxOverhangSec?): NarrationFitReport
placeNarration(scenes, segments, fps, resolve, volume, maxOverhangSec?): NarrationClipMix[]
duckSegmentsFromNarration(narration, totalFrames): DuckSegment[]
musicVolumeAt(frame, plan): number      // per-frame music envelope (fades + duck)
clipVolumeAt(localFrame, clip, master): number
duckWeightAt(frame, segments, rampFrames): number
sceneFrames(durationSeconds, fps): number
clamp01(v): number
fnv1aHex(text): string
```

## Input contract

```ts
resolveAudioMix(
  audio:   AudioPlanInput | null | undefined,  // what the owner wants
  scenes:  AudioSceneWindow[],                 // [{ id, durationSeconds }], min 1
  fps:     number,                             // must be finite and > 0
  resolve: (assetId) => { file, kind:'audio', durationMs? } | null,
): AudioMixPlan | null
```

**`resolve` is the injection seam that keeps the engine generic.** `file` is an
opaque string the engine only passes through — it never opens it. SowyVid returns
a **`sowyvid-media://` URL**, so no filesystem path is involved anywhere in the
audio path. (Probed: a `sowyvid-media://…` string round-trips into `MusicMix.file`
untouched.)

Input shape:

| Field | Meaning |
|---|---|
| `audioEnabled` (def. `true`) | master switch; `false` → whole mix is `null` |
| `masterVolume` | 0..1 |
| `duckMusicUnderVoice` (def. `true`) | enable ducking |
| `music` | `{ enabled?, assetId?, volume?, fadeInSec?, fadeOutSec?, loop?, startOffsetSec? }` |
| `voice` | `{ enabled?, mode: 'generated' \| 'imported', assetId?, segments[], volume?, duckAmount? }` |
| `clips[]` | `{ assetId, startSec, volume?, fadeInSec?, fadeOutSec? }` — sound effects |

Ranges are enforced at the boundary and **throw** on violation: volumes 0..1,
fades **0..30s**, `startOffsetSec` 0..3600, scenes min 1, fps > 0.

## Output contract (`AudioMixPlan`)

```ts
{
  version: 1
  fps: number
  totalFrames: number
  masterVolume: number
  music: { file, volume, fadeInFrames, fadeOutFrames, loop, trimStartFrames } | null
  narration: Array<{ file, fromFrame, durationFrames | null, volume, sceneId }>
  clips:     Array<{ file, fromFrame, durationFrames | null, volume, fadeInFrames, fadeOutFrames }>
  duckAmount: number
  duckSegments: Array<{ fromFrame, toFrame }>
  duckRampFrames: number
}
```

Fully **JSON-serializable and deterministic** — same inputs give an identical
plan (asserted by the engine's own tests, and re-asserted in SowyVid's adapter
tests).

## Track model

Three kinds, and **no source-video audio** (see *Limitations*):

1. **Music** — at most **one** track. Looping, trim offset, fades, ducked under narration.
2. **Narration** — either `generated` (one segment per scene, placed at scene starts) or `imported` (a single track from frame 0).
3. **Clips** — arbitrary sound effects at absolute `startSec`.

## Timing model

- Scene windows are **sequential and contiguous**: each scene starts where the previous ended. There are no gaps and no overlaps.
- `sceneFrames = max(1, round(durationSeconds × fps))`.
- `totalFrames = Σ sceneFrames`.

**Frame-exact synchronization with the VisualPlan.** FrameLogic computes scene
lengths as `max(1, round(sec × fps))` — the *same* formula. So SowyVid feeds
SoundWeave `durationSeconds = durationInFrames / fps` (derived from the
VisualPlan's authoritative frame counts) and the round-trip is exact:
`round((81/30) × 30) = 81`. **Probed:** a plan of 81 + 84 frames yields
`totalFrames = 165` exactly. This is why the adapter converts *from frames*
rather than reusing the original `durationSec` — it removes rounding drift by
construction.

## Ducking behavior

- Active only when **all three** hold: `duckMusicUnderVoice`, music exists, narration exists. Otherwise `duckAmount = 0` and `duckSegments = []`.
- Duck windows come from narration extents, **sorted and merged** so overlapping narration produces one continuous duck rather than nested dips.
- `duckAmount` default **0.6** → music drops to 40% under speech.
- Ramp: **0.3s** (`duckRampFrames = max(1, round(0.3 × fps))`), applied as a linear ramp *before* and *after* each duck window by `duckWeightAt`.
- Applied in `musicVolumeAt`: `volume × (1 − duckAmount × duckWeight)`.

## Loop behavior

`loop = (requested ?? true) && (!durationMs || musicFrames < totalFrames)`

- Music **shorter** than the video → loops (probed: `loop: true`).
- Music **longer** than the video → **loop forced `false`** even when explicitly requested (probed) — correct, since there is nothing to repeat.
- **Unknown** duration → loops by default (probed). Safer than leaving silence.
- `loop: false` is always honored (probed).

## Fade behavior

- Defaults: fade-in **1s**, fade-out **1.5s**.
- Both are clamped to **half the total duration**, so fades can never overlap into each other or invert. Probed: 10s fades on a 2s video → 30/30 frames on a 60-frame timeline.
- Fades **> 30s throw** at the schema boundary (probed) — they are not silently clamped.
- `musicVolumeAt` composes: `music volume × master × fadeIn × fadeOut × (1 − duck)`, clamped to 0..1. The engine's own test asserts frame 0 and the final frame are exactly `0` — no click at either end.

## Narration overhang

Narration may run past its scene by at most **1.5s**, and never past the next
narrated scene or the end of the video. `reconcileNarration` reports fit per
scene (`fits` / `bounded_overhang` / `too_long` / `no_narration`) and offers
`shorten_script | extend_duration | regenerate | continue_without_voiceover`
instead of silently truncating.

## Known limitations (and what SowyVid does about them)

1. **A missing track is silent, not reported.** `resolve → null` makes the engine
   skip that track with no diagnostic; if it was the *only* track, the entire mix
   collapses to `null` (probed: `MISSING_MUSIC → null`). Indistinguishable from
   "no audio requested".
   → **SowyVid resolves and validates asset references itself**, before calling
   the engine, and carries an explicit **missing-track state** in its own
   `AudioPlan` so the preview can show a visible warning (milestone §8).

2. **No source-video audio concept.** The engine models music/narration/clips
   only. → SowyVid carries the source-audio policy in its own `AudioPlan`; the
   Remotion adapter applies it to `<OffthreadVideo>` (already implemented in
   `src/render/videoPlayback.ts`).

3. **No engine identity in the output.** `AudioMixPlan` carries `version: 1` but
   not the engine name/version. → SowyVid records both in its persisted
   `AudioPlan` (milestone §5).

4. **`null` is overloaded** — it means *disabled*, *nothing to play*, and *every
   track missing*. → SowyVid distinguishes these itself rather than inferring.

5. **Music is single-track.** No crossfades or playlists. Acceptable: a short
   commercial uses one bed.

6. **`durationMs` is caller-supplied.** The engine cannot measure audio; a wrong
   duration produces a wrong (but deterministic) plan. → SowyVid supplies
   **ffprobe-measured** durations from MediaVault analysis.

7. **`fnv1aHex` is exported but unused** by the mix path — dead surface, ignored.

8. **Not validated:** the engine has no notion of whether the resulting audio is
   *audible*. Digital silence resolves to a perfectly valid plan. → Audio content
   is verified separately by RMS measurement on the real render
   (`docs/AUDIO-VALIDATION.md`).

## Integration boundary

```
Project audio preferences + Northstar/FrameLogic scene timing + managed audio metadata
        ↓  src/features/audio/  (SowyVid input adapter — resolves + validates assets)
SoundWeave resolveAudioMix()     (decides ALL audio timing)
        ↓  src/features/audio/  (SowyVid AudioPlan — engine identity + source-audio + missing-track)
Remotion audio adapter → preview and export composition
```

**SoundWeave decides audio timing; Remotion only renders that plan.** No
audio-planning rules live in React or Remotion components.
