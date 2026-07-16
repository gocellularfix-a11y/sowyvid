# SowyVid — Engineering Handoff

_Last updated at commit `0386448` (branch `main`, synced with `origin/main`)._

## What this is

**SowyVid** is a local-first **Electron desktop app** that helps non-technical
business owners create short video commercials from their own photos/videos. The
UI is **Spanish** and follows a fixed mockup (`docs/MOCKUP-ANALYSIS.md`): a single
screen with a 4-step guided flow (describe → add material → choose style → preview).

- Repo: `C:\sowyvid` · Remote: `https://github.com/gocellularfix-a11y/sowyvid.git`
- New project — **must not reuse the old "Colibrí" codebase** in any way.

## Stack

Electron 33 · React 18 · TypeScript (strict) · Vite via **electron-vite** ·
**sql.js** (SQLite/WASM behind a `Database` port, atomic writes) · **Remotion**
(`@remotion/player` preview) · **Zod** · **Vitest** · **Playwright** ·
`ffmpeg-static` / `ffprobe-static` (media analysis).

## Architecture (the load-bearing ideas)

- **Process split:** secure main (`src/electron/`), sandboxed preload bridge, React
  renderer (`src/app/`). `contextIsolation` on, `nodeIntegration` off, `sandbox` on.
- **Typed IPC:** renderer talks to main ONLY via `window.sowyvid` (`src/shared/ipc/api.ts`),
  every handler Zod-validates input and returns a `Result<T>` (never throws across
  the bridge).
- **Engines are vendored generic packages** under `packages/`, consumed via path
  aliases and **narrow adapters** in `src/features/*`. Engines never import
  SowyVid/React/Electron/branding. See `docs/ENGINE-INTEGRATION-ARCHITECTURE.md`.
- **Branding** is centralized in `src/config/branding.ts` (name is provisional).
- **Controlled media protocol** `sowyvid-media://` (`src/electron/mediaProtocol.ts`)
  serves managed media to the renderer by stable ID only — no raw paths.

## Engine vault (Jorge Engine Vault v1.0.0)

- ZIP: `C:\Users\GO CELLULAR\Documents\ENGINES\Jorge-Engine-Vault-v1.0.0.zip`
  (SHA-256 `8174539688688D78DF698109A31680235F20523B094D72D9881452FD8996C2F0`).
  Read-only audit extraction alongside it. **Never modify the ZIP.**
- Authoritative map: **`docs/ENGINE-VAULT-CATALOG.md`**. One engine integrated per phase.

| Engine | Package | Status |
|---|---|---|
| Northstar Creative | `@jorge-engines/northstar-creative` | ✅ INTEGRATED |
| MediaVault | `@jorge-engines/mediavault` | ✅ INTEGRATED |
| FrameLogic Visual | `@jorge-engines/framelogic-visual` | ✅ INTEGRATED |
| SoundWeave Audio | `@jorge-engines/soundweave-audio` | ⬜ DEFERRED |
| BridgeDrop LAN | `@jorge-engines/bridgedrop-lan` | ⬜ DEFERRED |
| PromptGate AI | `@jorge-engines/promptgate-ai` | ⬜ DEFERRED |

> The vault's OWN `npm install` fails in this environment (npm workspace bug), so
> engines are **vendored as source** and built/tested under SowyVid's toolchain.

## What works end-to-end today (verified)

Create project → type a promotion → **import local media** (dialog → magic-byte
validation → streaming SHA-256 → dedup → managed copy → ffprobe/ffmpeg analysis →
thumbnails/posters) → choose a style → **develop Northstar concepts** → **compile**
→ **FrameLogic VisualPlan** → **real Remotion `<Player>` preview** (media served via
`sowyvid-media://`, play/pause/seek/duration, missing-media placeholder) →
everything **persists and survives restart**. Reference-safe deletion + missing-file
detection included.

## What is NOT done (do not claim these work)

- **MP4 export** — "Descargar video" is intentionally unavailable.
- **Live video playback in the preview** — video shows its **poster still** (not
  `OffthreadVideo` yet).
- **Audio** (SoundWeave), **phone upload** (BridgeDrop, "Mi teléfono" unavailable),
  **AI** (PromptGate). **Social publishing** is blocked (no OAuth/app review).

## Commands

```
npm install               # also stages sql.js wasm; pulls ffmpeg/ffprobe binaries
npm run dev               # full Electron app
npm run dev:renderer-only # UI only in a browser (localhost:5273)
npm run typecheck         # tsc node + web (strict)
npm run lint              # eslint, 0 warnings allowed
npm test                  # vitest unit/integration
npm run test:e2e          # Playwright browser smoke
npm run test:e2e:electron # builds, then Playwright drives the REAL Electron app
npm run build             # electron-vite production build
```

Current status: typecheck ✓ · lint ✓ · **87 unit** ✓ · **4 browser e2e** ✓ ·
**3 real-Electron e2e** ✓ · build ✓. Honest per-feature state:
**`docs/CURRENT-STATUS.md`**.

## Key locations

| Area | Path |
|---|---|
| Creative engine adapters | `src/features/creative/` (Northstar) |
| Media pipeline | `src/features/media/` (import, streaming, analysis, references, protocol path) |
| Visual planning | `src/features/visual/` (FrameLogic → VisualPlan) |
| Remotion preview | `src/render/` + `src/app/features/home/PreviewPlayer.tsx` |
| IPC handlers | `src/electron/ipc/registerHandlers.ts` |
| DB (port + sql.js + migrations + repo) | `src/database/` |
| Persisted project schema | `src/shared/domain/project.ts` |
| Main + media protocol | `src/electron/main.ts`, `src/electron/mediaProtocol.ts` |
| Real-Electron tests | `e2e-electron/` (own Playwright config) |
| Docs index | `README.md` + `docs/` (start: `CURRENT-STATUS.md`, `ENGINE-VAULT-CATALOG.md`) |

## Gotchas / constraints

- **sql.js** (not native `better-sqlite3`) so `npm install`/build never needs a C++
  toolchain. DB persisted via atomic temp-file+rename.
- **SVG is rejected** on import (active-content risk).
- ffmpeg/ffprobe resolve from `node_modules` (dev); packaging uses `asarUnpack` (not
  yet exercised via a packaged build).
- **Provisional brand** — do not package/sign/publish publicly under "SowyVid"
  (`docs/BRANDING.md`).
- On Windows, Electron prints a benign `UV_HANDLE_CLOSING` line on shutdown during
  tests — tests still pass.
- PowerShell wraps `git push` stderr as an "error" even on success — check for the
  `→ main` line, not the exit banner.
- Keep engines generic; wire everything through `src/features/*` adapters; mark an
  engine INTEGRATED only when the app actually uses it and tests pass.

## Recommended next step

**MP4 export (render phase):** render the existing VisualPlan to H.264 via
`@remotion/renderer` in a Node/child process (platform presets, progress, cancel,
safe temp cleanup, export history) → enable "Descargar video". Sub-step first:
live in-preview video via `OffthreadVideo`. Then SoundWeave (audio), then BridgeDrop,
then PromptGate. Do **not** expand breadth before this vertical slice can export.
