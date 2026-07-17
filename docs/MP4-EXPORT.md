# MP4 Export

> Status: **Complete, including the owner's button.** "Descargar video" drives
> the production render engine end to end: preset → native save dialog →
> progress → a real, audible MP4 → export history that survives restart.
> Proven by clicking the real button in the real Electron app
> (`e2e-electron/export-button.spec.ts`) **and in the packaged Windows build**
> (`docs/WINDOWS-PACKAGED-VALIDATION.md`).

## Pipeline

```
Northstar plan + FrameLogic VisualPlan + SoundWeave AudioPlan + MediaVault assets
        ↓  visualPlanToCompositionProps() / audioPlanToCompositionAudio()
CommercialCompositionProps            (the SAME props the preview uses)
        ↓  runRenderJob()             (main process — never the React thread)
ensureRenderBundle()                  (fingerprinted; docs/RENDER-BUNDLE-CACHE.md)
        ↓
startRenderMediaServer()              (loopback, token-guarded, id-only)
        ↓  @remotion/renderer
H.264 MP4 + AAC audio
```

The preview and the export consume the **same composition and the same props**,
so what the owner previews is what they export.

## Key files

| Concern | File |
|---|---|
| Job lifecycle, progress, cancel, atomic publish | `src/features/render/renderJob.node.ts` |
| Bundle cache + fingerprint | `src/features/render/bundleCache.node.ts`, `bundleFingerprint.ts` |
| Guarded cache deletion | `src/features/render/safeRemove.node.ts` |
| Render-only media server | `src/features/render/mediaServer.node.ts` |
| Platform/resolution presets | `src/features/render/presets.ts` |
| Output validation (RMS, frames) | `src/features/render/renderValidation.node.ts` |
| Composition registry | `src/render/Root.tsx`, `remotionEntry.ts` |

## Why a render-only media server

The preview runs inside Electron, where `sowyvid-media://` is a registered
privileged scheme. **The export does not** — `@remotion/renderer` drives its own
headless Chrome, which has never heard of that scheme. The first render attempt
failed with exactly this: `net::ERR_UNKNOWN_URL_SCHEME`, images "cannot be
decoded", audio `MediaError`.

Rewriting media to `file://` would have "fixed" it by putting **filesystem paths
into the composition props** — defeating the entire point of the controlled
protocol. Instead the render gets a server with the same guarantees:

- assets addressed by **stable ID only**, never by path
- ids format-checked and resolved through the same managed-path traversal guard
- **127.0.0.1** on an OS-assigned port — never reachable off-machine
- a **per-render random token** in every URL; stale or guessed URLs 404
- **closed on every exit path** (success, failure, cancel)
- honors byte ranges via the same parser as the Electron protocol, so both paths
  behave identically

`rewriteManagedUrls()` deep-rewrites every `sowyvid-media://` URL in the props
tree — media URLs appear on scenes, posters *and* audio tracks, and a missed one
is an invisible hole in the export rather than an error.

## Presets

`resolution` is the **long edge**; the short edge follows the **plan's own
aspect ratio**. A preset changes how big the file is, never what is in the
frame — re-cropping at export would move text out of the text-safe frame
FrameLogic guaranteed. Dimensions are forced even (H.264 rejects odd sizes).

Available: Instagram Reel / TikTok / YouTube Shorts (9:16), Instagram feed
(1:1), YouTube (16:9), "Como se diseñó" (the plan's own ratio), at 720/1080/1440/1920.

## Safety properties

- **No rendering in the React renderer thread.** The job runs in main; Remotion
  spawns its own headless browser.
- **Atomic publish.** Render to a temp file, then move into place — a
  half-written MP4 never appears at the owner's chosen path. Cross-device moves
  fall back to copy+unlink.
- **Scratch is always cleaned** — success, failure and cancel, via `finally`.
- **The project is safe after failure or cancellation**: nothing is written to
  the destination unless the render completed.
- **Cancellation** is cooperative, checked at every phase boundary and passed to
  Remotion's own cancel signal. It rejects with `RenderCancelledError`, so
  callers can distinguish cancel from failure.
- **Never a silent track by accident**: `muted`/`enforceAudioTrack` are set from
  the AudioPlan's own `silent` flag, so a silent export is a recorded decision
  rather than an accident that looks identical to a broken one.

## Verified evidence

`npm run verify:render` (real render, production path, **from a planted stale cache**):

```
406x720 · 20.054s · 2,124,337 bytes · h264 + aac 48kHz stereo
mean_volume −26.8 dBFS · max −23.4 dBFS · threshold −50 → AUDIBLE
```

Also asserted: five frames sampled across the timeline are neither black nor
blank, scenes visibly change, the CTA frame is real, duration matches the plan,
the stale bundle was replaced, a second render reuses the bundle **and is still
audible**, cancellation mid-encode leaves no output and no scratch.

## The owner's button (implemented)

### IPC design

The renderer sends ONLY ids — `{ projectId, presetId }`, `{ jobId }`,
`{ exportId }` — every path, dimension, prop and asset reference is
reconstructed in the main process from persisted project data
(`src/electron/ipc/renderHandlers.ts`). Channels, all Zod-validated:

| Channel | Does |
|---|---|
| `render:start` | gate → native save dialog → registry.start with the real `runRenderJob` |
| `render:cancel` | cooperative cancel; unknown/terminal jobs return `false` calmly |
| `render:status` | active job + readiness (Spanish blockers) + preset catalog + default |
| `render:listHistory` | full records + live `fileExists` (detects manual deletion) |
| `render:retry` | re-run a past export with its preset into its folder (numbered name); folder gone → save dialog |
| `render:openFile` / `render:openFolder` | Electron safe shell APIs only; missing files answered calmly |
| `render:progress` (event) | job snapshots (state, %, Spanish stage, diagnostic code) |

### Job lifecycle (`src/features/render/jobRegistry.ts`)

```
queued → preparing → bundling → rendering → publishing → completed
                                       ↘ failed / canceled
```

One active render per project, enforced **synchronously** (a double click
cannot race two jobs). Progress is monotone; a late tick can never resurrect a
terminal job. History callbacks are **awaited before "completed" is reported**,
so a completed state always means the row is already durable. Rows still
`rendering` at startup are repaired to `failed/interrupted`.

### Export history schema (migration v3)

One row per ATTEMPT: `id, projectId, createdAt, completedAt, status
(rendering|completed|failed|canceled), preset, width, height, fps, durationSec,
outputPath, bytes, videoCodec, audioCodec, fingerprint, failureCode`.
`outputPath` is the one absolute path allowed to persist — the destination the
owner explicitly chose. Plans never carry paths. Failure codes are stable
(`interrupted | canceled | output-unavailable | missing-media |
tools-unavailable | render-failed`) and map to calm Spanish copy in the UI.

### Output folder & filenames (§5)

Native save dialog (default: `Videos/comercial-<project>.mp4`); the dialog's
own replace prompt covers intentional overwrite. Names are sanitized
(Windows-reserved names, unsafe characters, trailing dots, length) and the
seam/retry paths — which have no dialog — produce `name-2.mp4`, `name-3.mp4`, …
rather than ever overwriting silently. Presets: Vertical 9:16 (1080×1920),
Cuadrado 1:1 (1080×1080), Horizontal 16:9 (1920×1080), plus "Como se diseñó";
the plan's own ratio is default and non-matching ratios are disabled rather
than re-cropped.

### Gating (§6)

Ready only when: project exists · creative selection compiles · VisualPlan and
AudioPlan validate · every referenced media/audio file resolves on disk *now* ·
no active render. A **selected-but-missing music track blocks** with a Spanish
message; a plan that is silent by explicit choice renders fine. The same
evaluation runs server-side at `render:start`, so a stale renderer cannot
bypass the button state.

## Not done (do not claim these work)

- **The NSIS installer is unvalidated** — packaged validation ran against the
  `--dir` unpacked build (`docs/WINDOWS-PACKAGED-VALIDATION.md`).
- **Human hearing confirmation** of the exported audio remains Jorge's gate;
  automation measures RMS and validates decode, not speakers.
