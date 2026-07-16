# MP4 Export

> Status: **Render engine implemented and verified; the interface is NOT wired
> yet.** A real, audible, non-black MP4 is produced through the production path
> and proven by `npm run verify:render` — but **"Descargar video" is still
> inactive**, because the IPC wiring, export history and UI are not built. See
> *Not done* below. Nothing here claims an owner can click a button and get a file.

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

## Not done (do not claim these work)

- **"Descargar video" is still inactive.** No IPC handler, no output-folder
  picker, no progress UI, no cancel button, no export history, no "open file" /
  "open containing folder", no retry. The gating rules (valid creative plan,
  valid visual plan, all assets resolve, no active render, one render per
  project) are **specified but not implemented** in the UI.
- **Packaged-path validation is NOT done** (`docs/PACKAGED-PATH.md` does not
  exist yet). Everything above is verified in **development only**. The bundler
  compiles `src/render/remotionEntry.ts` **from source at runtime**, which a
  packaged build must actually ship — this is the single biggest unknown and the
  most likely thing to break first in a real `.exe`.
