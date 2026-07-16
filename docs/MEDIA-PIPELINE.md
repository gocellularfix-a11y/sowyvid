# SowyVid — Media Pipeline

> Status: **Implemented (Phase B)** via the MediaVault engine. Full detail in
> **`docs/MEDIAVAULT-INTEGRATION.md`**; this file is the quick reference.

## Pipeline

```
User selects files → Electron file dialog → policy checks (extension/size/empty)
→ MediaVault: magic-byte validation → SHA-256 → duplicate detection
→ atomic copy into <project>/media/files/<hash>.<ext> → metadata + record
→ mapped to Project.media (project-relative path) → SQLite persist
→ stable content ID available to Northstar
```

## Guarantees

- **Managed storage:** bytes are copied into the app-data project folder; the
  project never depends on the original selected path.
- **Content addressing:** `id = media_<sha256>`, file = `<hash>.<ext>` — stable IDs,
  automatic duplicate detection, no filename collisions or traversal.
- **Validation:** extension must be supported AND the file's magic bytes must match
  it (spoof rejection); empty and > 300 MB files are rejected; unsupported formats
  rejected.
- **Metadata (this phase):** kind, extension, dimensions (jpeg/png/gif/webp),
  orientation, size, hash, importedAt. Video duration / audio presence are not yet
  probed (no ffmpeg) — null pending a later analysis step. Thumbnails are not yet
  generated (`thumbRelPath` null).
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

## Not yet

Thumbnail/poster generation, video metadata probing, drag-and-drop from the OS,
and phone import (`Mi teléfono` → BridgeDrop, Phase E) — all deferred.
