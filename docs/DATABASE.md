# SowyVid — Database & Storage

> Status: **Implemented and tested** (`src/database/`, `src/database/persistence.test.ts`).

## Engine choice: sql.js behind a `Database` port

SowyVid uses **sql.js** — real SQLite compiled to WebAssembly — accessed only
through the `Database` port (`src/database/port.ts`). This was a deliberate
engineering decision:

- `better-sqlite3` (the usual Electron choice) is a native module that must be
  compiled against Electron's ABI with a Visual C++ toolchain. On a fresh
  Windows machine that compile frequently fails, which would break
  `npm install` / `npm run build` for the **entire** app.
- sql.js needs no native build, works identically in the app and in Node tests,
  and is still real SQLite (migrations, transactions, SQL).
- The port means swapping in `better-sqlite3` later is an adapter change
  (`src/database/sqljs.ts` → `betterSqlite.ts`), not an app change.

### Persistence & corruption safety

sql.js is in-memory; we persist by exporting the whole DB to bytes and writing
them **atomically** (`src/database/atomicWrite.ts`: write temp file → `rename`).
`rename` is atomic on one filesystem, so a crash mid-write can never leave a
half-written, corrupt database. `openPersistentDatabase()` loads the bytes at
startup, runs migrations, and returns a `PersistentDatabase` whose `persist()`
performs the atomic write after each committed mutation.

## Storage layout

Structured data → SQLite; media/renders → per-project folders. Nothing user-owned
is ever stored in the source repo.

```
%APPDATA%\SowyVid\                 (app.getPath('userData'))
  database\sowyvid.db              sql.js database (atomic writes)
  projects\<project-id>\
    media\  thumbnails\  audio\  renders\  temp\
  templates\   music\   logs\   cache\
```

Created by `src/electron/paths.ts` (`getAppPaths`) on startup; per-project folders
by `ensureProjectFolders` on project creation.

## Schema (migration v1)

| Table | Columns | Purpose |
|---|---|---|
| `projects` | id, name, status, template_id, created_at, updated_at, **data** (JSON) | Indexed columns for listing; full validated `Project` JSON in `data` |
| `project_versions` | id, project_id→, label, created_at, snapshot (JSON) | Version history for undo/compare (§5) |
| `export_history` | id, project_id→, created_at, rel_path, platform, width, height, duration_sec, bytes | Preserved export records |
| `schema_migrations` | version, name, applied_at | Applied-migration ledger |

Foreign keys use `ON DELETE CASCADE` (`PRAGMA foreign_keys = ON`), so deleting a
project removes its versions and export records. `idx_projects_updated`,
`idx_versions_project`, `idx_exports_project` back the common queries.

## Migrations

`src/database/migrations.ts` holds an append-only `MIGRATIONS` list. `runMigrations`
applies any unapplied migration inside a transaction and records it — idempotent,
safe on every startup. **Never edit a past migration**; add a new one.

## Validation at the boundary (Zod)

Every value crossing the persistence boundary is validated:
- **Write:** `ProjectRepository.save/create` parse with `Project` / `CreateProjectInput`
  before storing.
- **Read:** `get`/`list`/`restoreVersion` re-parse the stored JSON with `Project`,
  so a corrupted or out-of-date row surfaces as a clear error instead of silently
  poisoning the app.

## Reproducibility

Each project stores `templateVersion` and `ruleEngineVersion`. A plan generated
under v1 stays reproducible after the engine/templates evolve (see
`docs/COMMERCIAL-RULE-ENGINE.md`).

## Recovery behavior

- DB fails to open → main shows a calm Spanish error and quits; **user data is
  never modified** on a failed open.
- Partial write → impossible by construction (atomic rename).
- Restart survival is covered by an automated test that exports the DB, reopens
  from the bytes, and asserts the project + export history are intact.

## Deletion (planned UI, §17)

Project deletion will confirm the action, explain what is removed, offer to keep
exported renders, delete safely, and record failures. The cascade + folder model
above already supports this; the confirmation UI lands with the project-manager
screen.

## Portability (designed, not yet built)

`data`/`snapshot` are self-contained JSON and media paths are **relative**, so a
future portable-package export (zip the project folder + JSON) needs no schema
change.
