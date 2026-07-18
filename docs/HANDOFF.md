# SowyVid — Engineering Handoff

_Last updated at the Visual Text Layout Editor milestone (direct-manipulation
text placement with canonical, preview/export-identical normalized layouts),
proven in the packaged `.exe`. Branch `main`, synced with `origin/main`._

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

### Packaged owner-acceptance evidence (application commit `34e7602`)

The full A/B/C/D acceptance flow was run **inside the real packaged executable**,
`C:\sowyvid\release\win-unpacked\SowyVid.exe`, driving only visible owner
controls (bridge calls appear solely as read-only assertions). Proven by
`e2e-packaged/owner-workflow.packaged.spec.ts`:

- **MP4 content identification** — an imported video that carries an audio
  stream shows the analyzed-content tile **`Video · Con audio`** (never treated
  as background music).
- **Source-video audio export** — with "Audio original del video" enabled, the
  packaged export carried measurable AAC signal at **≈ −28.9 dBFS**.
- **Replacement background-music export** — after muting the original audio,
  importing an MP3 and selecting it, the packaged export carried measurable
  music at **≈ −26.9 dBFS**.
- **Two distinct persisted commercial IDs** — Commercial A `proj_w-eMPrOu_W` and
  Commercial B `proj_QYBe3G3gGW` (asserted `B ≠ A`).
- **Both commercials visible in "Mis comerciales" after restart** — after
  closing and relaunching the `.exe`, both cards remained listed.
- **Each commercial shows its own export history** — the per-commercial "Videos
  creados" list showed each commercial's own exported video(s).
- **Referenced-media removal through the visible decision dialog** — removing the
  used video opened the Reemplazar / Quitar del comercial y eliminar / Cancelar
  dialog; the owner confirmed removal.
- **Previously exported MP4s preserved after source-media removal** — both of
  Commercial A's earlier exports remained on disk after the video was removed,
  and the project stayed usable (still compiles and can export).
- **Commercial deletion preserving exported files** — deleting Commercial B with
  "conservar los videos ya exportados" left its exported MP4 intact on disk.
- **Final restart leaves only the intended survivor** — after a further restart,
  only Commercial A remained (`survivors === [proj_w-eMPrOu_W]`).

### Music Center + Manual Suno (this milestone)

A real, application-level **music library** — not a per-project list — proven by
owner-path tests in real Electron and inside `SowyVid.exe`
(`e2e-electron/music-center.spec.ts`, `e2e-packaged/music-center.packaged.spec.ts`):

- **Global catalog + managed vault** (`<userData>/music`, migration **v4**). A
  track's bytes live once, deduplicated by content hash; commercials reference it
  by a stable `music_<hash>` id (`project.audio.musicTrackId`). One physical file
  is reused across many commercials, with an independent volume per commercial.
- **Content identity** — MP3/WAV only, confirmed by ffprobe (real audio stream,
  duration, codec, sample rate, channels). An MP4 with audio stays a VIDEO /
  source-video audio and never enters the library as a song.
- **In-app preview** through the SAME production media protocol the render uses
  (`sowyvid-media://music/<id>`), byte-range aware. ONE shared player: starting a
  track stops any other — never two at once. Preview volume is separate from a
  commercial's background-music volume.
- **Honest metadata** — title/creator/source/license/vocal, progressive (nothing
  required before listening/using); unknown license stays visibly unconfirmed and
  the app never claims the owner holds rights.
- **Safe references (main-owned)** — deleting an unused track removes its file; a
  used track opens a decision dialog listing every commercial and offers
  replace-in-all / remove-from-all-and-delete. Exported MP4s are never touched.
- **Manual Suno** — a deterministic, instrumental-by-default brief from the
  commercial's own intelligence (Northstar intent + FrameLogic energy +
  SoundWeave duration); copy it, `shell.openExternal` the OFFICIAL site, import
  the downloaded track (tagged `suno-manual`, brief stored), select it. **No
  unofficial API, no automation, no scraping.**
- **Legacy migration** — a one-time, idempotent pass brings pre-Music-Center
  project music into the catalog, deduped by hash, preserving selections and
  keeping old projects renderable.

### Visual Text Layout Editor (this milestone)

The owner can directly place the text that appears in the video — proven by
owner-path tests in real Electron and inside `SowyVid.exe`
(`e2e-electron/text-editor.spec.ts`, `e2e-packaged/text-editor.packaged.spec.ts`):

- **One canonical layout model** (`src/shared/domain/textLayout.ts`): normalized
  (0..1) center + width + scale + alignment per (sceneId, role, aspectRatio),
  persisted on `project.textLayouts`. Additive, Zod-defaulted — **no DB
  migration** (it lives in the project JSON); legacy projects load as `[]` and
  render with the automatic layout. Only customized elements override.
- **Preview == export by construction**: both the `<Player>` preview and the
  Remotion render read the SAME resolved text elements through one shared helper
  (`compositionTextElements`); the composition positions every element
  absolutely. Packaged parity measured **0.020** (bright-text centroid distance,
  normalized) against a documented **0.12** tolerance.
- **"Editar texto"** opens a per-scene direct-manipulation editor: select (with
  overlap cycling + label), drag (pointer/touch), resize handle, arrow-key nudge
  (Shift bigger, Escape cancels), safe-area + snap guides (Alt disables snap),
  unsafe-boundary warning, and controls (size/width/alignment/lock/reset) plus
  presets, "Copiar posición a…" and "Restablecer texto de esta escena".
- **Aspect-ratio isolation** (§8 option A): a 9:16 customization does not affect
  1:1 or 16:9 — each format shows the automatic layout until customized.
- **Persistence & performance**: editing updates the preview instantly from
  props (no concept/plan recompile — layouts apply in `visualPlanToCompositionProps`)
  and persists debounced (once per drag, not per pixel). Duplication copies the
  layouts; a new commercial does not inherit them; reset restores one element (or
  a whole scene).

## What is NOT done (do not claim these work)

- **The NSIS installer is unvalidated** — packaged validation used the
  win-unpacked build. No installed-from-setup.exe run; binaries unsigned.
- **The Music Center is the library + manual Suno brief, not a full Music
  Center-plus** — no in-app track trimming, no waveform, no automatic mood/BPM
  detection (mood/energy are owner-set), and no "replace managed file in place"
  (replacement is done at the selection level across commercials).
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

Current status: typecheck ✓ · lint ✓ · **362 unit** ✓ · **6 browser e2e** ✓ ·
**10 real-Electron e2e** ✓ · **13 real-render checks** ✓ · **5 packaged e2e** ✓ ·
build ✓. Packaged e2e: two export/edge specs, `owner-workflow.packaged` (A/B/C/D),
`music-center.packaged` (A–E), and `text-editor.packaged` (preview/export parity,
restart, reset). Honest per-feature state: **`docs/CURRENT-STATUS.md`**.

> Flaky note: `export-button.spec` "second render refused while active" can fail
> once when run late in the full Electron suite (render-engine warm-up timing);
> it passes on isolated re-run. Not a regression.

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

The export vertical, owner-workflow recovery, Music Center + Manual Suno AND the
Visual Text Layout Editor are all **closed** — proven in the packaged `.exe`. An
owner can build a reusable music library, and now directly place the on-screen
text so the export matches the preview. Next, in order of value:

1. **Installer validation + signing** — build and install the NSIS setup, re-run
   the packaged export / music / text-layout checks against the installed app.
2. **BridgeDrop** (phone import), then **PromptGate** (AI / narration / Voice
   Engine) — each its own milestone.

Deliberately still open (not started): in music — in-app trimming, waveform,
automatic mood/BPM, in-place file replacement; in text — font/color/typography
editing, group selection/multi-select, and per-element entrance animation.

Packaged specifics — resource map, dev-vs-packaged resolution, test seams, the
asar spawn pitfall — live in **`docs/WINDOWS-PACKAGED-VALIDATION.md`**.
