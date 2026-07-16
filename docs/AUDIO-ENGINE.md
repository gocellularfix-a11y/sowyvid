# Audio Engine

> Status: **Implemented via the SoundWeave Audio Engine.** Audio planning is owned
> by `@jorge-engines/soundweave-audio`; the authoritative documents are:
>
> - **`docs/SOUNDWEAVE-INTEGRATION.md`** — the engine audit: real API, contracts,
>   track/timing model, ducking/loop/fade behavior, and known limitations.
> - **`docs/MUSIC-GENERATION-PROVIDERS.md`** / **`docs/SUNO-MANUAL-WORKFLOW.md`** — music sourcing.
> - **`docs/AUDIO-VALIDATION.md`** — how audio is proven to be *audible*, not merely present.
>
> Implemented shape:
>
> ```
> project audio prefs + VisualPlan scene timing + managed audio metadata
>   → src/features/audio/        (SowyVid input adapter: resolves + validates assets)
>   → SoundWeave resolveAudioMix (decides ALL audio timing)
>   → SowyVid AudioPlan          (+ engine identity, source-audio policy, missing-track state)
>   → src/render/remotionAudio.ts (Remotion audio adapter)
>   → preview AND export composition
> ```
>
> The `ScenePlan` named below is **retired**; the real input is the VisualPlan.
> The rest of this document is the original design sketch, kept for context.

Intended module locations:

- `src/features/audio/` — audio timeline UI, track controls, music library, TTS UI.
- `src/electron/audio/` — file management, TTS provider host, render-time audio prep.

## 1. Relationship to the ScenePlan

The `ScenePlan` (fps, width, height, `totalFrames`, and per-scene `durationFrames`,
`mediaId`, `mediaMotion`, etc.) is the **timing source of truth**. The audio engine
never invents scene timing; it aligns tracks to the plan's frame timeline.

```ts
interface AudioPlan {
  fps: number;              // mirrors ScenePlan.fps
  totalFrames: number;      // mirrors ScenePlan.totalFrames
  tracks: AudioTrack[];
  ducking: DuckingConfig | null;
}
```

## 2. Track model

Four track kinds, all sharing one contract:

| Kind | Source | Typical role |
| --- | --- | --- |
| `music` | Local music library asset | Background bed |
| `voiceover` | TTS output or imported narration file | Spoken narration |
| `source` | Audio embedded in a scene's video `mediaId` | Ambient/original sound |
| `sfx` | Short library/imported clip | Accents, whooshes, stingers |

```ts
type TrackKind = 'music' | 'voiceover' | 'source' | 'sfx';

interface AudioTrack {
  id: string;
  kind: TrackKind;
  assetRef: AudioAssetRef;     // library asset, imported file, or a scene's source audio
  startFrame: number;          // placement on the ScenePlan timeline
  // Clip region within the source media:
  trimStartSec: number;
  trimEndSec: number | null;   // null = to end of media
  loop: boolean;               // repeat to fill its span (music/sfx)
  volume: number;              // 0..1 base gain
  fadeInFrames: number;
  fadeOutFrames: number;
  muted: boolean;
  solo: boolean;
}

type AudioAssetRef =
  | { type: 'library'; audioId: string }
  | { type: 'file'; relPath: string }        // imported narration/sfx
  | { type: 'sceneSource'; sceneMediaId: string }; // audio from a video scene
```

## 3. Per-track controls

| Control | Behavior |
| --- | --- |
| Volume | Base gain 0..1, applied before ducking/fades. |
| Fade in/out | Frame-based ramps at clip edges; deterministic (same plan → same curve). |
| Trim | `trimStartSec`/`trimEndSec` select a region of the source. |
| Loop | Music/SFX repeat to fill their intended span; loop respects trim region. |
| Mute | Track contributes nothing but stays in the plan. |
| Solo | If any track is soloed, only soloed tracks are audible (preview + render identical). |

Mute/solo is a **plan-level** concept so preview and render produce byte-consistent
mixing decisions.

## 4. Music ducking under narration

- When a `voiceover` track overlaps a `music` track, music is automatically ducked
  (attenuated) for the narration's duration plus small attack/release ramps.
- Ducking is described declaratively so it is reproducible in render:

```ts
interface DuckingConfig {
  enabled: boolean;
  duckDb: number;          // attenuation applied to music under voiceover, e.g. -12
  attackFrames: number;    // ramp down before narration
  releaseFrames: number;   // ramp up after narration
  targetKinds: TrackKind[]; // typically ['music']
  triggerKinds: TrackKind[]; // typically ['voiceover']
}
```

The ducking envelope is computed from voiceover start/end frames on the shared
timeline, so preview and export apply the identical gain automation.

## 5. Timeline sync and render sync

- All placement/trim math is in **frames** derived from `fps`; seconds are converted at
  the boundary only. This keeps preview (Player) and export (`@remotion/renderer`)
  sample-accurate against the same `ScenePlan`.
- Preview mixes audio in the renderer via Remotion's audio primitives following the
  `AudioPlan`. Export re-derives the exact same mix graph from the same plan; there is
  no separate "render-only" audio logic.
- Determinism rule: **same `ScenePlan` + same `AudioPlan` → same output**, both in the
  Player and in the exported MP4.

## 6. Missing-file recovery

Audio assets are referenced by `audioId`/`relPath`; files can go missing (deleted,
moved project, failed phone import).

| Condition | Behavior |
| --- | --- |
| Library/file asset missing | Track flagged `unavailable`; it is silently skipped in the mix but preserved in the plan; UI warns in Spanish ("Falta el archivo de audio"). |
| Scene source audio missing | The scene renders without its source audio; visuals unaffected. |
| Narration file missing | Voiceover track skipped; ducking auto-disables for that span. |

Recovery never blocks preview or export — missing audio degrades to silence for that
track, and the project file is never corrupted.

## 7. Local music library

The library holds **user-owned** music (including tracks the user made in tools such as
Suno). SowyVid stores audio under the project's `audio/` folder and records optional
metadata **only as provided by the user**.

```ts
interface MusicLibraryItem {
  audioId: string;
  relPath: string;         // under audio/, relative path
  durationSec: number;     // probed off-thread (see MEDIA-PIPELINE.md probing approach)
  // All optional — stored only if the user supplies them:
  title?: string;
  creator?: string;
  source?: string;         // e.g. "Suno", "grabación propia"
  licenseNote?: string;    // free text the user enters; SowyVid does not interpret it
  mood?: string;
  energy?: 'low' | 'medium' | 'high';
  tags?: string[];
}
```

**Honesty rule:** SowyVid never asserts or verifies licensing. `licenseNote` is
free-form text the user chooses to record; the app does not claim any track is cleared
for use. No metadata field is required to use a track.

## 8. TTS provider interface

Text-to-speech is **optional** and provider-neutral. The app must be fully usable
without any paid provider.

```ts
interface TtsRequest {
  text: string;            // narration script (Spanish)
  voiceHint?: string;      // optional voice/style hint
  targetDurationSec?: number; // optional pacing hint
}

interface TtsResult {
  relPath: string;         // generated audio saved under audio/
  durationSec: number;
  provider: string;        // which provider produced it (for transparency)
}

interface TtsProvider {
  readonly id: string;
  readonly requiresNetwork: boolean;
  readonly requiresCredential: boolean;
  synthesize(req: TtsRequest): Promise<Result<TtsResult>>;
}
```

Provider options behind the same boundary:

| Provider | Notes |
| --- | --- |
| Manual import (fallback) | User records/exports narration elsewhere and imports the file. Always available; requires no network or credential. This is the guaranteed baseline. |
| OS-backed local TTS | A possible local option using the operating system's built-in speech synthesis, behind the same `TtsProvider` interface. No paid provider needed. |
| Cloud TTS (optional) | A future paid provider could plug in via the same interface; never required. Cost governance would flow through the AI gateway conventions (see `AI-COST-CONTROL.md`). |

Whichever provider is used, the output is a plain audio file under `audio/` that becomes
a `voiceover` track — so narration always works, even offline, via manual import.

## 9. IPC surface

```ts
interface AudioBridge {
  listLibrary(projectId: string): Promise<Result<MusicLibraryItem[]>>;
  importAudio(projectId: string, paths: string[]): Promise<Result<MusicLibraryItem[]>>;
  updateMetadata(projectId: string, audioId: string, meta: Partial<MusicLibraryItem>): Promise<Result<MusicLibraryItem>>;
  removeAudio(projectId: string, audioId: string): Promise<Result<void>>;
  synthesizeTts(projectId: string, providerId: string, req: TtsRequest): Promise<Result<TtsResult>>;
  listTtsProviders(): Promise<Result<{ id: string; requiresNetwork: boolean; requiresCredential: boolean }[]>>;
}
```

All boundaries validate with Zod; no direct fs/network in the renderer. Audio import
reuses the off-thread probing conventions from the media pipeline for `durationSec`.
