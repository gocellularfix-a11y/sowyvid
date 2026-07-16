# SowyVid — MediaVault Integration (Phase B)

> Status: **INTEGRATED and in use.** The app imports real local files into managed
> storage and reopens them after restart (verified by an automated real-Electron
> test).

## What was integrated

**MediaVault Engine** — `@jorge-engines/mediavault` v1.0.0, vendored to
`packages/mediavault-engine/` from the Jorge Engine Vault. Generic, node-only
(`fs`/`crypto`), depends only on `zod`. It imports **only** through SowyVid
adapters and knows nothing about SowyVid, React, Electron, Northstar, or branding.

## The media flow (implemented)

```
User clicks "Este equipo"  (renderer)
  → bridge.media.import({ projectId })            (secure preload)
  → IPC media:import handler                       (main)
  → Electron file dialog (or explicit paths)
  → importMedia() (src/features/media/mediaImport.node.ts)
      → size / empty / extension policy (src/features/media/limits.ts)
      → MediaVault.importBytes():
          magic-byte validation (extension-spoof rejection)
          SHA-256 content id + duplicate detection
          atomic copy → <project>/media/files/<hash>.<ext>
          dimension probe + classification + atomic record JSON
      → recordToAsset(): MediaRecord → SowyVid MediaAsset (project-relative path)
  → project.media updated + saved to SQLite (atomic)
  → outcomes + updated project returned to the UI (thumbnail tiles + toasts)
```

The project stores a **project-relative** `relPath` (`media/files/<hash>.<ext>`),
never the original selected path — so a project never depends on where the user
picked the file from, and imported media survives deletion of the source
(tested).

## Adapters / boundary (SowyVid side)

| File | Role |
|---|---|
| `src/features/media/limits.ts` | Isomorphic policy: supported extensions, MIME map, 300 MB ceiling, status enum |
| `src/features/media/mediaImport.node.ts` | Node-only: wraps MediaVault; `importMedia` / `removeMedia` / `recordToAsset`; size/empty/spoof classification |
| `src/features/media/types.ts` | Isomorphic IPC result types (`MediaImportOutcome`, `MediaImportResult`) |
| `src/electron/ipc/registerHandlers.ts` | `media:import` (dialog/paths) + `media:remove` handlers |

`.node.ts` suffix keeps the node-only service out of the web build; the renderer
only sees the isomorphic types via the typed bridge.

## Supported / rejected (this phase)

- **Supported:** jpg, jpeg, png, webp, svg (logo), mp4, mov, wav, mp3.
- **Rejected:** executables and any file whose bytes don't match its extension
  (spoof), unsupported formats, empty files, files > 300 MB, and — by content
  addressing — duplicate content (deduplicated to one managed copy). Path
  traversal is impossible: filenames are sanitized to a basename and the stored
  file is content-addressed (`<hash>.<ext>`); MediaVault's `resolveFile` guards
  against escaping the vault root.

## Storage layout

```
%APPDATA%\SowyVid\projects\<projectId>\media\
  files\<sha256>.<ext>      managed media bytes (content-addressed)
  records\media_<sha256>.json   MediaVault metadata record (atomic)
```

The authoritative project media list lives in `Project.media` (persisted in the
SQLite `projects.data` JSON). MediaVault's own JSON records are the engine's
managed store; SowyVid mirrors the essential metadata into `Project.media` for
querying + Northstar.

## Northstar hand-off

`Project.media` → `toEngineMedia()` (existing Northstar adapter) → the engine
receives abstract metadata + **stable content IDs**, never filesystem paths. A
logo asset declares `roles: ['logo']`; other media is placed by orientation +
quality scoring until semantic tagging arrives.

## UI states (Step 2)

`Este equipo` and the drop zone trigger the real import. Visible states:
selecting (OS dialog) → processing (spinner + "Procesando…") → imported /
duplicate / unsupported / oversized / failed (summarized in toasts) → tiles for
each managed asset with a remove (×) control. No raw paths or stack traces are
shown. `Mi teléfono` remains clearly unavailable until the BridgeDrop phase.

Browser-preview mode has no filesystem, so import reports "disponible en la app de
escritorio" rather than pretending to work.

## Verification

- **11 host unit tests** (`src/features/media/media.test.ts`): byte-signature
  validation, extension-spoof rejection, unsupported/empty/oversized rejection,
  SHA-256 dedup + stable IDs, managed copy, safe filenames / no traversal,
  original-deletion durability, project isolation, Northstar receives metadata,
  project stays loadable.
- **MediaVault's own 5 tests** run under SowyVid's vitest.
- **Real-Electron test** (`e2e-electron/mediavault-import.spec.ts`): imports a real
  PNG through IPC, confirms the managed copy on disk, restarts the app, and
  confirms `Project.media` persisted.
- `typecheck` / `lint` / `test` / `test:e2e` / `test:e2e:electron` / `build` green.

## Current limitations

- No thumbnail generation yet (tiles show a kind icon + filename; `thumbRelPath`
  is null). Video duration/`hasAudio` are not probed (no ffmpeg dependency) — set
  null/false pending a later media-analysis step.
- Import is a single IPC batch (processing state, then per-file outcomes) rather
  than streamed per-file progress.
- Phone import (`Mi teléfono`) is deferred to BridgeDrop (Phase E).
