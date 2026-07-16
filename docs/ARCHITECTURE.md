# SowyVid — Architecture

SowyVid is a **local-first Electron desktop application**. No account, cloud, or
network is required for core creation. AI and social publishing are optional,
provider-neutral add-ons.

## Process model

```
┌─────────────────────────────────────────────────────────────┐
│ Electron Main (Node)                                          │
│  • window lifecycle, security policy                          │
│  • typed IPC handlers (validated w/ Zod)                      │
│  • SQLite (sql.js) via Database port  ── docs/DATABASE.md     │
│  • media pipeline, render orchestration (worker/child proc)   │
│  • phone-import LAN server, AI gateway, secure credentials    │
└───────────────▲───────────────────────────┬─────────────────┘
                │ contextBridge (preload)    │ ipcMain.handle
                │  window.sowyvid.*          │  → Result<T>
┌───────────────┴───────────────────────────▼─────────────────┐
│ Preload (sandbox, contextIsolation)                          │
│  • exposes ONLY the typed SowyvidBridge — no ipcRenderer,     │
│    no Node, no require in the renderer                        │
└───────────────▲──────────────────────────────────────────────┘
                │
┌───────────────┴──────────────────────────────────────────────┐
│ Renderer (React + TS + Vite)                                  │
│  • UI shell (mockup), design system, feature screens          │
│  • Remotion <Player> for preview                              │
│  • never touches fs / db / network directly                   │
└──────────────────────────────────────────────────────────────┘
```

**Security baseline** (see `docs/SECURITY.md`): `contextIsolation: true`,
`nodeIntegration: false`, `sandbox: true`, `webSecurity: true`, strict CSP,
navigation/window-open locked down, all IPC input Zod-validated.

## Source layout

```
packages/
  northstar-creative-engine/   vendored generic engine (@jorge-engines/northstar-creative)
src/
  app/            renderer (React): shell/, features/, ui/, content/, styles/
  electron/       main process: main.ts, preload.ts, paths.ts, ipc/
  shared/         cross-process: ipc contracts, Result type, domain types
  config/         branding.ts — single product-identity source
  features/       domain logic + engine adapters (features/creative/, …)
  database/       Database port + sql.js adapter + migrations
  render/         Remotion compositions + render service          (deferred)
```

Path aliases (`@shared`, `@app`, `@electron`, `@features`, `@database`,
`@render`, `@config`, `@jorge-engines/northstar-creative`) are defined identically
in `tsconfig.base.json`, `electron.vite.config.ts`, `vite.renderer.config.ts`, and
`vitest.config.ts`.

**Creative engine.** Deterministic creative planning is the **Northstar Creative
Engine** (vendored under `packages/`), consumed only through
`src/features/creative/` adapters. The engine is brand/renderer/framework-neutral.
See `docs/CREATIVE-ENGINE-INTEGRATION.md` and `docs/ENGINE-INTEGRATION-ARCHITECTURE.md`.

## Typed IPC contract

- Channels are constants in `src/shared/ipc/channels.ts`.
- The renderer only sees `window.sowyvid` (`src/shared/ipc/api.ts`).
- Every handler validates input with Zod and returns a `Result<T>`
  (`src/shared/result.ts`) — **handlers never throw across the bridge**, and
  errors carry a stable `code` the UI maps to friendly language.
- Not-yet-implemented domains have **no handler**; the UI treats that as
  "unavailable" rather than presenting a dead control as finished.

## Build & tooling

- **electron-vite** builds main / preload / renderer; **electron-builder**
  packages the Windows installer.
- **TypeScript strict** with project references (`tsconfig.node.json` +
  `tsconfig.web.json`); `noUncheckedIndexedAccess`, no implicit `any`
  (ESLint `no-explicit-any: error`).
- **Vitest** for unit/integration; **Playwright** for the renderer smoke test.

## Key engineering decisions

1. **sql.js (WASM) behind a `Database` port** instead of native `better-sqlite3`,
   so `npm install`/`build` never depends on a Visual C++ toolchain. Real SQLite,
   migrations, and transactions; persisted with atomic temp-file+rename writes.
   Swapping in `better-sqlite3` later is a port implementation change only.
2. **Preview vs. render split:** Remotion `<Player>` renders the scene plan in the
   renderer for preview; `@remotion/renderer` runs in a Node process for MP4
   export — identical scene plan, consistent output.
3. **Determinism first:** the rule engine (not AI) produces the scene plan;
   identical inputs + template version + engine version ⇒ identical plan.
4. **Provider-neutral boundaries** for AI, TTS, phone-import transport, and social
   publishing, so a future relay/vendor is addable without reworking workflows.
