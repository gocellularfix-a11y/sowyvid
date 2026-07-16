# SowyVid — Media Analysis

> Status: **Implemented.** Real image/video/audio analysis via a controlled
> FFmpeg/FFprobe boundary, with generated thumbnails and video posters.

## Pipeline

Import (streaming) → basic metadata (dimensions from header for images) → deeper
analysis (`src/features/media/analysis.node.ts`) → persisted on `Project.media`.

Analysis runs in the **main process as child processes** (`execFile`), so the
renderer is never blocked and the main JS thread does not do the heavy work.

## What is extracted

| Kind | Extracted |
|---|---|
| Image / logo | width, height, orientation, validity (from header at import); optimized **thumbnail** |
| Video | width, height, orientation, **duration**, **fps**, **audio presence** (ffprobe); **poster frame** (ffmpeg, early non-black frame) |
| Audio | duration (ffprobe), `hasAudio: true`; designed audio tile (no thumbnail) |

## Analysis status

`MediaAsset.analysisStatus`: `pending → processing → ready | failed`, plus a safe
`analysisError` string for diagnostics (never shown raw to the owner). A **failed
thumbnail/poster never invalidates** an otherwise-valid source file — the source
stays `valid: true`; only the derivative is absent.

## Tool boundary & safety

- Binaries resolved from `ffmpeg-static` / `ffprobe-static` (bundled per-platform),
  or `SOWYVID_FFMPEG` / `SOWYVID_FFPROBE` env overrides. If unavailable: images
  still analyze `ready` (dims known), audio `ready`, video `failed`
  (`analyzer-unavailable`) — the source remains valid.
- **All invocations use `execFile` with ARGUMENT ARRAYS** over validated managed
  paths — never a shell string, never user-controlled command construction.
- Timeouts + bounded `maxBuffer` on every call.
- Packaging: `ffmpeg-static` / `ffprobe-static` are `asarUnpack`ed
  (`electron-builder.yml`) so the binaries are executable in a packaged app.

## Storage of derivatives

```
<project>/media/
  files/<sha256>.<ext>        managed source (content-addressed)
  thumbnails/<sha256>.jpg     image thumbnails
  posters/<sha256>.jpg        video poster frames
  temp/                       streaming temp parts (cleaned on success/failure)
```

Paths persisted on the asset (`thumbRelPath`, `posterRelPath`) are
**project-relative**. Removing an asset removes its derivatives too
(`removeMedia`). Derivatives are regenerable from the source.

## Verification

`src/features/media/analysis.test.ts` synthesizes a real 1-second MP4 (with
audio) using ffmpeg, imports it, and asserts ffprobe returns 320×240, duration,
~30 fps, audio present, and that a poster file is written; plus image-thumbnail
generation. Skips cleanly if the binaries are unavailable.

## Not yet

Streamed per-file progress events (analysis currently completes within the import
call), waveform generation for audio, and richer scene-level frame extraction.
