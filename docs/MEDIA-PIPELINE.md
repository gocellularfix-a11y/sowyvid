# SowyVid — Media Pipeline

> Status: **Implemented (Phase B)** via the MediaVault engine. Full detail in
> **`docs/MEDIAVAULT-INTEGRATION.md`**; this file is the quick reference.

## Pipeline

```
User selects files → Electron file dialog → policy checks (extension/size/empty)
→ STREAMING copy: incremental SHA-256 + magic-byte validation from a bounded
  header + temp file → atomic rename to <project>/media/files/<hash>.<ext>
→ deeper analysis (ffprobe/ffmpeg): dimensions/duration/fps/audio + thumbnail/poster
→ mapped to Project.media (project-relative path) → SQLite persist
→ stable content ID available to Northstar
```

Large files are **streamed** (bounded memory — never a whole-file buffer); see
`src/features/media/streamingImport.node.ts`. Deeper analysis runs off the main
JS thread as child processes; see `docs/MEDIA-ANALYSIS.md`.

## Guarantees

- **Managed storage:** bytes are copied into the app-data project folder; the
  project never depends on the original selected path.
- **Content addressing:** `id = media_<sha256>`, file = `<hash>.<ext>` — stable IDs,
  automatic duplicate detection, no filename collisions or traversal.
- **Validation:** extension must be supported AND the file's magic bytes must match
  it (spoof rejection); empty and > 300 MB files are rejected; unsupported formats
  rejected. **SVG is rejected** (active-content risk — see `docs/SECURITY.md`).
- **Metadata:** kind, extension, dimensions, orientation, size, hash, importedAt,
  plus **video duration / fps / audio presence** and **thumbnails + video posters**
  via the analysis pass (`docs/MEDIA-ANALYSIS.md`).
- **Display:** the renderer references media only through the controlled
  `sowyvid-media://` protocol (stable IDs → managed files); no raw path reaches
  the renderer.
- **Failure recovery:** each file yields an independent outcome
  (imported/duplicate/unsupported/oversized/empty/failed); a bad file never aborts
  the batch. Metadata + file writes are atomic (temp + rename).
- **Deletion:** `media:remove` deletes the managed file + record and updates the
  project.
- **Portability:** relative paths + content IDs make a project self-contained.

## Boundaries

`src/features/media/` (SowyVid adapters) ⇄ `@jorge-engines/mediavault` (generic
engine). The engine imports nothing SowyVid/Electron/React. Node-only code lives in
`*.node.ts` so the renderer bundle never includes it.

## Reference safety

Before removing media, `findMediaReferences` checks the brand logo, the compiled
creative plan, and saved project versions; referenced media is not silently
deleted (blocked with an explanation). Missing managed files are flagged on
project open (`markMissingMedia`).

## Not yet

Drag-and-drop from the OS, streamed per-file progress events, audio waveforms,
and phone import (`Mi teléfono` → BridgeDrop, Phase E) — all deferred.
