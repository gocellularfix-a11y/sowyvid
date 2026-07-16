# Media Pipeline

> Status: Not yet implemented — design only.

This document describes the planned architecture for importing, storing, validating,
and managing media assets (images and video clips) in **SowyVid**. It defines the
contracts and process boundaries only; no code in this document exists yet.

Intended module locations:

- `src/features/media/` — renderer-side import UI, drop zones, asset store, thumbnails.
- `src/electron/media/` — main-process storage, hashing, worker orchestration.
- `src/electron/media/worker/` — off-thread metadata + thumbnail worker (child process).

## 1. Goals and non-goals

| Goal | Description |
| --- | --- |
| Local-first | All media lives in OS app-data; no cloud/account required to import. |
| Managed storage | SowyVid owns copies of media; the user's original files are never mutated. |
| Portable projects | A project folder is self-contained; paths stored are always **relative**. |
| Off-thread work | Hashing, probing, and thumbnails never block the renderer UI thread. |
| Honest validity | Every asset carries a `valid` flag; broken/missing media degrades gracefully. |

Non-goals: editing pixels/frames of source media, cloud sync, format transcoding on
import (export handles encoding — see `RENDERING.md`).

## 2. The `MediaAsset` contract

The pipeline produces and maintains `MediaAsset` records. These fields are the stable
contract consumed by the rule engine, audio engine, and video engine.

```ts
type MediaKind = 'image' | 'video';
type Orientation = 'landscape' | 'portrait' | 'square';

interface MediaAsset {
  id: string;              // stable UUID, assigned on import
  kind: MediaKind;
  relPath: string;         // relative to project root, e.g. "media/ab/ab12…f9.jpg"
  originalName: string;    // user-facing original filename (display only)
  mimeType: string;        // validated, e.g. "image/jpeg", "video/mp4"
  hash: string;            // sha256 of file content (hex)
  bytes: number;
  width: number | null;    // px; null until probed
  height: number | null;
  orientation: Orientation | null;
  durationSec: number | null;   // null for images
  hasAudio: boolean;            // false for images
  thumbRelPath: string | null;  // relative path to generated thumbnail/poster
  valid: boolean;               // false if file missing/corrupt/failed probe
  importedAt: string;           // ISO-8601
}
```

Persistence: `MediaAsset` rows live in the sql.js `Database` port. Binary files live on
disk under the project folder — the database stores metadata and relative paths only,
never blobs.

## 3. Storage layout

Media is stored in OS app-data under a per-project folder. Subfolders mirror the
established layout:

```
<appData>/SowyVid/projects/<projectId>/
  media/        # imported source images and video clips
  thumbnails/   # generated thumbnails and video posters
  audio/        # see AUDIO-ENGINE.md
  renders/      # see RENDERING.md
  temp/         # in-flight import staging, cleaned aggressively
```

### File naming

- Files are named by content hash to guarantee stable, collision-free, filesystem-safe
  names: `media/<h0h1>/<hash><ext>` where `<h0h1>` is the first two hex chars of the
  sha256 (a 256-way shard to avoid oversized directories).
- `originalName` is preserved only in the database for display; it is never used as a
  path component (avoids traversal, unicode, and length issues).
- Extension is derived from the **validated** MIME type, not the user's original
  extension.

## 4. Import pipeline

Entry points (all renderer-side, all funnel into one flow):

| Source | Notes |
| --- | --- |
| Drag & drop | Drop zone accepts multiple files; folders are shallow-expanded. |
| File picker | Native dialog via `window.sowyvid.media.pickFiles()`. |
| Multi-file | Any entry point may deliver N files; import is inherently batched. |
| Phone import | Files arriving via LAN transfer (see `PHONE-IMPORT-ARCHITECTURE.md`) enter this same pipeline after owner approval. |

The renderer never reads files with `fs`. Drag/drop and picker yield OS file paths (or
in the sandbox, transfer handles); the renderer passes them to main via the typed IPC
bridge, and main performs all filesystem work.

### Stages

1. **Enqueue** — renderer calls `window.sowyvid.media.import(request)`; receives a
   `Result<ImportTicket>` immediately (non-blocking). Progress arrives via events.
2. **Pre-validate (main)** — check existence, readable, size ceiling, extension/MIME
   sniff (magic bytes, not trusting extension). Reject early with a stable error code.
3. **Stage copy (main)** — stream-copy the file into `temp/` (never move/mutate the
   original).
4. **Hash (worker)** — compute sha256 while copying (single pass). See dedup below.
5. **Probe (worker)** — extract metadata off the UI thread (dimensions, duration,
   orientation, hasAudio). See §6.
6. **Thumbnail/poster (worker)** — generate a downscaled thumbnail (image) or poster
   frame (video). Written to `thumbnails/`.
7. **Commit (main)** — atomically move staged file from `temp/` to its hashed path,
   insert/attach the `MediaAsset` row, emit `imported`.
8. **Cleanup** — remove any `temp/` residue on success or failure.

```ts
interface ImportRequest {
  projectId: string;
  paths: string[];              // OS paths or sandbox transfer handles
  source: 'drop' | 'picker' | 'phone';
}

interface ImportTicket { batchId: string; count: number; }

// Progress events streamed over IPC:
type ImportEvent =
  | { type: 'progress'; batchId: string; done: number; total: number }
  | { type: 'imported'; batchId: string; asset: MediaAsset }
  | { type: 'duplicate'; batchId: string; existingId: string; originalName: string }
  | { type: 'rejected'; batchId: string; originalName: string; code: MediaErrorCode }
  | { type: 'batchDone'; batchId: string };
```

## 5. Duplicate detection (content hash)

- Duplicates are detected by **sha256 of file content**, not by name or size.
- Before commit, main checks whether an asset with the same `hash` already exists in
  the project. If so, the staged copy is discarded and a `duplicate` event is emitted
  referencing the existing `id`. No second row is created.
- Because filenames are hash-derived, an identical file also maps to the same on-disk
  path — commit is idempotent.
- Duplicate detection is per-project (projects are independent, portable units).

## 6. Metadata extraction (off the UI thread)

All probing runs in a **worker/child process**, never in the renderer and never
blocking the main event loop for large files.

| Field | Image | Video |
| --- | --- | --- |
| `width` / `height` | image header decode | first video stream |
| `orientation` | derived from w/h (and EXIF rotation if present) | derived from w/h |
| `durationSec` | `null` | container/stream duration |
| `hasAudio` | `false` | true if an audio stream is present |

- Orientation normalizes EXIF rotation so downstream engines see true display
  dimensions.
- The worker returns a structured `ProbeResult` validated with **Zod** at the process
  boundary before it is trusted.
- If probing fails (corrupt/unsupported), the asset may still be committed with
  `valid: false` and null metadata, or rejected — see §7.

```ts
interface ProbeResult {
  width: number | null;
  height: number | null;
  durationSec: number | null;
  hasAudio: boolean;
}
```

## 7. Validation and failure recovery

| Condition | Behavior | Error code (example) |
| --- | --- | --- |
| Extension/MIME mismatch (magic-byte sniff) | Reject before copy | `MEDIA_UNSUPPORTED_TYPE` |
| File too large (> configurable ceiling) | Reject | `MEDIA_TOO_LARGE` |
| Unreadable / permission denied | Reject | `MEDIA_READ_FAILED` |
| Probe fails but file copies | Commit with `valid:false`, null metadata, retry-able | `MEDIA_PROBE_FAILED` |
| Thumbnail fails | Commit asset; `thumbRelPath:null`; UI shows placeholder | `MEDIA_THUMB_FAILED` |
| Crash mid-import | `temp/` residue cleaned on next launch; DB never got a partial row | — |

Principles:

- **Atomic commit**: a `MediaAsset` row is inserted only after the file is safely in
  its final hashed location. There is no window where the DB references a missing file
  it just wrote.
- **No partial state**: staging in `temp/` plus move-on-commit means an interrupted
  import leaves only disposable temp files.
- **Re-validation on load**: on project open, a lightweight integrity pass may confirm
  each `relPath` exists; missing files flip `valid:false` so all engines degrade
  gracefully (placeholders, warnings) instead of crashing.

## 8. Deletion behavior

- Deleting an asset removes its `MediaAsset` row and its files (media + thumbnail).
- Because the video/audio engines reference assets by `id`/`mediaId`, deletion must
  either be blocked while referenced or cascade to a "missing media" state in the
  affected `ScenePlan` scenes (surfaced to the user in Spanish, e.g. "Falta un
  archivo").
- Deletion is scoped to the current project; identical content in another project is
  untouched (separate folders, separate hashes-on-disk).
- Orphan sweep: files in `media/`/`thumbnails/` with no owning row may be garbage
  collected during maintenance, guarded by the hash-name invariant.

## 9. Project portability

- Stored paths are **always relative** to the project root; absolute paths are never
  persisted. This lets a project folder be copied/moved between machines intact.
- Thumbnails are regenerable: if `thumbnails/` is lost, a maintenance pass can rebuild
  posters from source media.
- A project folder plus its sql.js database file is the complete, portable unit;
  nothing in `media/` depends on machine-specific absolute locations.

## 10. IPC surface (renderer ↔ main)

All calls return `Result<T>` with a stable error code; no direct fs in the renderer.

```ts
interface MediaBridge {
  pickFiles(): Promise<Result<string[]>>;
  import(req: ImportRequest): Promise<Result<ImportTicket>>;
  list(projectId: string): Promise<Result<MediaAsset[]>>;
  remove(projectId: string, assetId: string): Promise<Result<void>>;
  revalidate(projectId: string): Promise<Result<MediaAsset[]>>;
  onImportEvent(cb: (e: ImportEvent) => void): () => void; // unsubscribe
}
```

This surface is consumed by the media library UI and feeds asset `id`s into the
deterministic rule engine that emits the `ScenePlan`.
