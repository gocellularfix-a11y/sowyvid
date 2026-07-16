# SowyVid

**SowyVid** is a local-first desktop app that helps ordinary business owners
create publish-ready video commercials from their own photos and videos — through
one simple, guided, visual workflow. No editing experience required.

> New project, fully disconnected from any previous **Colibrí** implementation
> (named only to note it must not be reused).

## Status

Early milestone. The **interface shell, design system, project persistence, and
the deterministic creative engine (Northstar, from the Jorge Engine Vault) are
implemented, integrated, and tested** — the app creates a project, develops
creative concepts, compiles a validated renderer-neutral plan, and persists a
reproducible selection. The media pipeline, Remotion preview/render, audio, phone
upload, and AI are **audited generic engines, deferred** to their phases; social
publishing is **blocked** on credentials. See
[`docs/CURRENT-STATUS.md`](docs/CURRENT-STATUS.md) and
[`docs/ENGINE-VAULT-CATALOG.md`](docs/ENGINE-VAULT-CATALOG.md) for an honest,
per-feature breakdown — nothing here is claimed to work that hasn't been tested.

## Tech stack

Electron · React 18 · TypeScript (strict) · Vite (electron-vite) · sql.js (SQLite
via WASM, behind a `Database` port) · Remotion (planned for video) · Zod · Vitest
· Playwright.

## Required external software

- **Node.js ≥ 20.11** and npm (developed on Node 24 / npm 11).
- Windows (developed/tested on Windows 10). macOS/Linux should work but are not
  yet verified.
- No database server, account, or cloud service is required.
- (Later) MP4 rendering will download a headless Chromium via Remotion on first
  render.

## Setup

```bash
npm install          # also stages the sql.js WASM binary (postinstall)
```

## Development commands

```bash
npm run dev            # launch the full Electron app (main + preload + renderer)
npm run dev:renderer-only  # run just the UI in a browser at http://localhost:5273
```

## Build

```bash
npm run build          # production build → out/ (main, preload, renderer)
npm run build:win      # build + package a Windows installer (electron-builder)
```

## Tests

```bash
npm run typecheck      # tsc (node + web projects), strict
npm run lint           # eslint, zero warnings allowed
npm test               # vitest unit/integration
npm run test:e2e       # playwright renderer smoke test
```

## Project storage location

User projects and media are stored in the OS app-data directory, **not** in this
repo:

```
%APPDATA%\SowyVid\
  database\sowyvid.db
  projects\<id>\media|thumbnails|audio|renders|temp
  templates\ music\ logs\ cache\
```

Writes are atomic (temp file + rename) so a crash never corrupts a project.

## Render instructions

MP4 export is **not yet implemented** (design in [`docs/RENDERING.md`](docs/RENDERING.md)).
The deterministic engine already produces a validated `ScenePlan`; the Remotion
composition + Node render process consume it in a later phase.

## Mockup source

The interface is a faithful implementation of the product mockup
`ChatGPT Image Jul 15, 2026, 03_03_51 PM.png`. Every visible region and the
resolved ambiguities/deviations are documented in
[`docs/MOCKUP-ANALYSIS.md`](docs/MOCKUP-ANALYSIS.md).

## Documentation

`docs/` contains the product vision, mockup analysis, architecture, database,
rule engine, template system, and design/architecture docs for each subsystem
(clearly marked when a subsystem is design-only). Start with
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and
[`docs/CURRENT-STATUS.md`](docs/CURRENT-STATUS.md).

## Known limitations

- Media import, preview, rendering, audio, phone upload, AI, and social
  publishing are not yet functional (designed only).
- macOS/Linux unverified.
- Real social publishing is blocked pending official platform API access,
  approved apps, and OAuth credentials — the product will export platform-ready
  media instead until then. It never fakes a successful publish.

## License

UNLICENSED / private.
