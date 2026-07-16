# Rendering (Preview & Export)

> Status: Not yet implemented — design only.

This document describes the planned rendering subsystem for **SowyVid**: in-app preview
via the Remotion Player and MP4 export via `@remotion/renderer`. Both consume the same
`ScenePlan` and the same composition components (see `VIDEO-ENGINE.md`) so preview and
export stay consistent. Contracts only; no code here exists yet.

Intended module locations:

- `src/features/render/` — preview player UI, export dialog, progress, export history.
- `src/electron/render/` — export orchestration, child-process render host, file I/O.

## 1. Two surfaces, one plan

| Surface | Where it runs | Library |
| --- | --- | --- |
| Preview | Renderer (React) | `@remotion/player` |
| Export | Node child process | `@remotion/renderer` |

Both render the identical composition from the identical `ScenePlan`. Preview is
interactive and lightweight; export is a heavier, headless, file-producing job. Same
plan → same output.

## 2. Preview (Remotion Player)

The preview embeds the Player in an aspect-correct container and exposes standard
transport controls.

| Capability | Notes |
| --- | --- |
| Play / pause | Standard transport. |
| Seek | Scrub to any frame; frame-accurate against the plan. |
| Time display | Current time / total, derived from `fps` + `totalFrames`. |
| Volume | Preview mixing per the `AudioPlan` (see `AUDIO-ENGINE.md`). |
| Fullscreen | Toggle; container preserves aspect ratio. |
| Aspect container | Locks to plan `width:height` (9:16, 1:1, 16:9). |

Player states surfaced in the UI (Spanish):

```
loading → ready → playing ⇄ paused → (seeking) ;  error
```

- `loading`: plan/composition being prepared.
- `ready`: first frame rendered, controls enabled.
- `error`: missing media or plan invalid — preview shows a clear message and still
  renders what it can (background + text fallback), never a blank crash.

Preview requires no Chromium download and no child process; it runs entirely in the
renderer.

## 3. Export (MP4 via @remotion/renderer)

Export runs in a **separate Node/child process** spawned by the Electron main process —
never in the renderer, never blocking the UI or main event loop.

- Codec: **H.264** MP4 (broad platform compatibility).
- Output written under the project's `renders/` folder; temp frames/artifacts under
  `temp/` and cleaned after.
- **First render note:** `@remotion/renderer` downloads a headless Chromium (Remotion's
  browser) on first use. The UI must disclose this one-time download (Spanish: "Primera
  vez: descargando componentes de video…") and handle its progress/failure distinctly
  from the render itself.

### Resolution and platform presets

Export offers a resolution plus a platform preset; the preset sets aspect ratio and
sensible dimensions.

| Preset | Aspect | Orientation |
| --- | --- | --- |
| Instagram Reel | 9:16 | Vertical |
| Facebook Reel | 9:16 | Vertical |
| TikTok | 9:16 | Vertical |
| YouTube Shorts | 9:16 | Vertical |
| Instagram Feed | 1:1 (or 4:5) | Square/portrait |
| Facebook Feed | 1:1 | Square |
| Landscape | 16:9 | Horizontal |
| Square | 1:1 | Square |

The chosen preset must be consistent with the plan's `width`/`height`; if the user picks
a different aspect, the plan is re-derived by the rule engine first (rendering never
reshapes a plan itself).

```ts
interface ExportRequest {
  projectId: string;
  plan: ScenePlan;
  preset: ExportPresetId;
  resolution: '720p' | '1080p';
}

interface ExportJob {
  jobId: string;
  status: 'queued' | 'preparing' | 'rendering' | 'finalizing' | 'done' | 'error' | 'canceled';
  progress: number;        // 0..1
  outputRelPath?: string;  // under renders/ when done
  errorCode?: string;
}
```

## 4. Process boundaries

```
Renderer (UI)
   │  window.sowyvid.render.export(req)  → Result<{ jobId }>
   ▼
Main process (orchestrator)
   │  spawns / manages
   ▼
Render child process (@remotion/renderer, headless Chromium)
   │  emits progress → main → IPC events → renderer
```

- The renderer only sends requests and receives `Result<T>` + progress events; it has no
  fs/network access.
- Main owns job lifecycle, the child process, temp files, and output validation.
- The child process is isolated so a render crash cannot take down the app.

## 5. Progress, cancel, and no duplicate jobs

- **Progress** is reported from the child → main → renderer as `progress` events
  (0..1) with the current `status` phase.
- **Cancel**: `window.sowyvid.render.cancel(jobId)` signals the child to stop; main
  terminates it if needed and cleans temp artifacts. A canceled job leaves no partial
  MP4 in `renders/`.
- **No duplicate render jobs**: a project may have at most one active export at a time;
  requesting another while one runs returns an error (`RENDER_ALREADY_RUNNING`) or
  queues, rather than spawning a competing job over the same output.

## 6. Temp-file cleanup & safe output

- All intermediate frames/artifacts live under `temp/` keyed by `jobId`.
- Output is written to a temp filename, validated, then atomically moved into
  `renders/`. There is never a half-written file at the final path.
- On success, failure, or cancel, the job's `temp/` subtree is removed. A startup sweep
  clears orphaned `temp/` render dirs from prior crashes.

## 7. Output validation

Before a render is marked `done`:

| Check | Purpose |
| --- | --- |
| File exists & non-zero | Catch silent write failures. |
| Container/codec probe | Confirm valid H.264 MP4 (reuse off-thread probe from media pipeline). |
| Duration ≈ expected | `durationSec ≈ totalFrames / fps` within tolerance. |
| Dimensions match preset | Guard against wrong-size output. |

A render failing validation is treated as `error`, its output discarded, and the failure
reported with a stable code.

## 8. Failure recovery (never corrupt the project)

- Export is **read-only** with respect to project state: it consumes the `ScenePlan` and
  media but never mutates them. A failed or canceled export cannot damage the project.
- Errors (Chromium download failed, out of disk, render crash, validation failed) map to
  stable codes surfaced in Spanish with actionable guidance.
- The project database is untouched by export except for appending to export history
  (below), which is done only after a validated success.

## 9. Export history

Each completed export is recorded for the user to find, re-open, or re-share.

```ts
interface ExportHistoryEntry {
  jobId: string;
  preset: ExportPresetId;
  resolution: string;
  outputRelPath: string;    // relative, under renders/ — portable
  bytes: number;
  durationSec: number;
  createdAt: string;        // ISO-8601
}
```

History paths are **relative** (project portability). History is the handoff point to
the publishing domain (see `SOCIAL-CONNECTOR-ARCHITECTURE.md`): a validated export is
what gets published or manually shared.

## 10. IPC surface

```ts
interface RenderBridge {
  export(req: ExportRequest): Promise<Result<{ jobId: string }>>;
  cancel(jobId: string): Promise<Result<void>>;
  listHistory(projectId: string): Promise<Result<ExportHistoryEntry[]>>;
  onJobEvent(cb: (e: { jobId: string; status: ExportJob['status']; progress: number; errorCode?: string }) => void): () => void;
}
```

All boundaries validate with Zod; the renderer performs no fs/network work.
