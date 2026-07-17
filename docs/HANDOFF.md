# SowyVid — Engineering Handoff

_Last updated at the owner hotfix (audible packaged exports + restored export
history; commits `7b7939a`/`ef34a5b`), branch `main`, synced with `origin/main`._

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
| SoundWeave Audio | `@jorge-engines/soundweave-audio` | ✅ INTEGRATED (`docs/SOUNDWEAVE-INTEGRATION.md`) |
| BridgeDrop LAN | `@jorge-engines/bridgedrop-lan` | ⬜ DEFERRED |
| PromptGate AI | `@jorge-engines/promptgate-ai` | ⬜ DEFERRED |

> The vault's OWN `npm install` fails in this environment (npm workspace bug), so
> engines are **vendored as source** and built/tested under SowyVid's toolchain.

## What works end-to-end today (verified)

Create project → type a promotion → **import local media** (dialog → magic-byte
validation → streaming SHA-256 → dedup → managed copy → ffprobe/ffmpeg analysis →
thumbnails/posters) → choose a style → **develop Northstar concepts** → **compile**
→ **FrameLogic VisualPlan** + **SoundWeave AudioPlan** → **real Remotion `<Player>`
preview** with **live-playing video** and **real audio** (music/narration/source,
fades, ducking, master/music/narration/source controls) → everything **persists and
survives restart**. Reference-safe deletion + missing-file detection included.

**The owner can export**: "Descargar video" → preset → save dialog → progress →
a real, audible MP4 → restart-safe history with open-file/open-folder/retry.
Proven by clicking the real button in the real app (`e2e-electron/
export-button.spec.ts`) **and inside the packaged Windows `.exe`** with a
planted stale cache: 1080×1920, 18.05s, h264+aac, **−26.9 dBFS**
(`docs/WINDOWS-PACKAGED-VALIDATION.md`).

**The owner's work survives restart**: on startup the most recent project is
restored — id, media, brief, music selection, compiled plans — so step 4 comes
back alive with the preview, the export button and the export history. Imported
music **auto-selects** as the commercial's music (owner can change/remove it via
"Música del comercial"). Both behaviors exist because Jorge's first packaged
test found them missing: silent exports (imported music never selected) and
invisible history (no state restoration).

**The owner-workflow-recovery milestone (Jorge's packaged findings)** closed
these product gaps, each proven by owner-path tests that click only visible
controls (`e2e-electron/owner-workflow.spec.ts` — scenarios A/B/C/D):

- **Media is identified from analyzed content, not the extension.** ffprobe
  persists container/codecs/sample-rate/channels; tiles read "Video · 18 s · Con
  audio", "Música · MP3 · 24 s", "Imagen · Vertical". An extension/container
  mismatch is marked invalid. An MP4 with audio is a VIDEO — never music.
- **Source-video audio is its own control** ("Audio original del video"),
  separate from background music, shown only when ≥1 analyzed video carries
  audio, **off by default**, with its own volume. SoundWeave uses at most one
  clip's audio per scene. Preview and export honor the same persisted setting
  (scenario A export measured **−27.1 dBFS** of enabled source audio).
- **Music selector states are honest**: auto-select, "Sin música", volume
  enabled only with a track, "No agregaste música de fondo" otherwise. A
  commercial with no music, no source audio and no narration shows
  **"Este comercial no tiene audio."** — silent by choice, never by surprise.
- **"Mis comerciales" is a real library** over every persisted project (name,
  thumb, status, duration, format, media/export counts) with Abrir / Renombrar /
  Duplicar / Eliminar / Abrir último video / carpeta, plus a **"Videos creados"**
  list per commercial. Exports appear without restart; a deleted file keeps its
  record as "Archivo no encontrado".
- **New-commercial isolation**: a visible "Nuevo comercial" starts a fresh id
  without overwriting the current one and without creating empty ghost projects;
  Home shows the current commercial's name. App owns which commercial is current
  (startup restore / library open / new).
- **Referenced-media removal is a decision, not a dead end**: Reemplazar archivo
  / Quitar del comercial y eliminar / Cancelar. The **main process** owns the
  cascade (retarget or clear references, rebuild plans from persisted state,
  delete the managed file + derivatives); there is **no force flag** on the
  renderer surface. Exported MP4s are never touched.
- **Deleting a commercial** is distinct from removing one asset, with a
  keep-exported-videos choice; files outside managed storage are removed only on
  explicit confirmation.

## What is NOT done (do not claim these work)

- **The NSIS installer is unvalidated** — packaged validation used the
  win-unpacked build. No installed-from-setup.exe run; binaries unsigned.
- **Music selection has no track preview / `audioMeta` form / Suno-brief UI** —
  the owner can choose, change, remove and set the volume of a track, but cannot
  audition it in-app or fill in title/creator/license metadata yet.
- **No narration source** — the AudioPlan supports imported narration; SowyVid has
  no TTS (PromptGate deferred).
- **Phone upload** (BridgeDrop, "Mi teléfono" unavailable), **AI** (PromptGate).
  **Social publishing** is blocked (no OAuth/app review).
- **Jorge's ears remain the final audio gate** — automation measures RMS and
  decode, not speakers.

## Read before touching the render cache

**`docs/RENDER-BUNDLE-CACHE.md`.** A previous app (Colibrí) shipped silent videos
for a month because a serve directory was reused whenever `index.html` existed —
the stale composition painted no `<Audio>`, so Remotion emitted a phantom silent
track with no error, and every proof passed because proofs used a *fresh* dir
while production used the rotten cache. SowyVid invalidates by **content
fingerprint**, never by existence, and the render tests **plant a stale cache and
drive the real production function**. Do not "optimize" that away.

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
npm run verify:render     # REAL MP4 render + measured audio RMS + frame checks
npm run package:win       # electron-vite build + prebuilt render bundle + win-unpacked
npm run test:e2e:packaged # packages, launches the REAL SowyVid.exe, validates its MP4
```

Current status: typecheck ✓ · lint ✓ · **320 unit** ✓ · **6 browser e2e** ✓ ·
**8 real-Electron e2e** ✓ · **2 packaged e2e** ✓ · build ✓ ·
**verify:render ✓ (13 tests)**. Honest per-feature state:
**`docs/CURRENT-STATUS.md`**.

## Key locations

| Area | Path |
|---|---|
| Creative engine adapters | `src/features/creative/` (Northstar) |
| Media pipeline | `src/features/media/` (import, streaming, analysis, references, protocol path, byte ranges) |
| Visual planning | `src/features/visual/` (FrameLogic → VisualPlan) |
| Audio planning | `src/features/audio/` (SoundWeave → AudioPlan; music providers) |
| Production render | `src/features/render/` (job, bundle cache, media server, presets, validation) |
| Remotion preview + composition | `src/render/` + `src/app/features/home/PreviewPlayer.tsx` |
| **One alias map (5 consumers)** | `src/build/aliases.ts` — engines need aliases in electron.vite, vite.renderer, vitest, **Remotion's webpack**, and tsconfig.base (JSON, hand-synced) |
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
- **Binaries cannot spawn from inside an asar.** Electron's patched `fs` redirects
  *reads* of asar-unpacked files, but `spawn`/`execFile` do not — module-reported
  paths must go through `unpackedBinaryPath()` (`src/features/media/unpackedPath.ts`),
  and Remotion's compositor gets `binariesDirectory` pointing at the unpacked copy.
  Found the hard way: packaged media analysis failed with `spawn …app.asar… ENOENT`
  while every development test was green.
- **Test what the owner can do, not what the harness can do.** The packaged suite
  once set the music selection through `window.sowyvid` and asserted history through
  the bridge — it went green while Jorge's real exports were silent and his history
  was invisible. The suites now drive only the owner's buttons (dialog answers come
  from env seams: `SOWYVID_E2E_IMPORT_PATHS`, `SOWYVID_E2E_IMPORT_PATHS_FILE`
  (re-read each import, so one running app can feed two commercials different
  files), `SOWYVID_E2E_EXPORT_DIR`, `SOWYVID_E2E_USER_DATA`,
  `SOWYVID_E2E_SUPPRESS_OPEN`) and assert what is VISIBLE.
- **`out/main` is stale until you rebuild.** Running `playwright --config
  playwright.electron.config.ts` directly skips the build; a new main-process
  seam or handler silently won't be there and the app falls back to the real OS
  dialog (which hangs the test). Run `npm run build` first, or the full
  `npm run test:e2e:electron` which builds for you.
- **Controlled checkboxes persist async.** The source-audio toggle's `checked`
  reflects persisted `audio.useSourceAudio`, which only updates after an IPC
  save + replan — so in tests `.click()` it and poll the persisted value; a
  Playwright `.check()` asserts an instantaneous flip and fails.
- **Provisional brand** — do not package/sign/publish publicly under "SowyVid"
  (`docs/BRANDING.md`).
- On Windows, Electron prints a benign `UV_HANDLE_CLOSING` line on shutdown during
  tests — tests still pass.
- PowerShell wraps `git push` stderr as an "error" even on success — check for the
  `→ main` line, not the exit banner.
- Keep engines generic; wire everything through `src/features/*` adapters; mark an
  engine INTEGRATED only when the app actually uses it and tests pass.

## Recommended next step

The export vertical AND the owner-workflow-recovery milestone are **closed**: an
owner can run two separate commercials, hear a video's original audio and
imported music, see every export inside the app, manage/rename/duplicate/delete
commercials, replace or safely remove referenced media, and have all of it
survive restart — proven in the packaged `.exe` and by owner-path tests. Next,
in order of value:

1. **Music library UI + Suno brief UI** — audition a track, fill in `audioMeta`
   (title/creator/license), copy the brief, "Abrir Suno". Selection, volume,
   replace/remove and export already honor everything; only preview + the
   metadata form remain.
2. **Installer validation + signing** — build and install the NSIS setup,
   re-run the packaged export checks against the installed app.
3. Then BridgeDrop (phone import), then PromptGate (AI/narration).

Packaged specifics — resource map, dev-vs-packaged resolution, test seams, the
asar spawn pitfall — live in **`docs/WINDOWS-PACKAGED-VALIDATION.md`**.
