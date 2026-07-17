# SowyVid — Current Status

Honest, per-feature state. Legend:

- ✅ **Complete** — implemented and verified (tests and/or real-app run).
- 🟡 **Functional but limited** — works, with scope caveats.
- 🧩 **Scaffolded** — types/contracts/UI exist; behavior not wired.
- ⬜ **Not implemented** — design only.
- 🔒 **Blocked** — needs external credentials/approval.

> Nothing is described as finished unless tested. Scaffolding is never presented in
> the UI as complete — unavailable controls say "disponible pronto".

## Verification snapshot (current)

Application acceptance commit **`34e7602`**; documentation HEAD before this update
**`a4ffe79`**. Packaged executable: `C:\sowyvid\release\win-unpacked\SowyVid.exe`.

| Check | Result |
|---|---|
| `npm run typecheck` | ✅ passes (node + web) |
| `npm run lint` | ✅ 0 warnings (`packages/**` vendored engines excluded) |
| `npm test` | ✅ **320 unit** passing |
| `npm run test:e2e` | ✅ **6 browser E2E** passing |
| `npm run test:e2e:electron` | ✅ **8 Electron E2E** passing (incl. `owner-workflow` A/B/C/D) |
| `npm run verify:render` | ✅ **13 real-render checks** passing (real MP4 + measured RMS + frames) |
| `npm run test:e2e:packaged` | ✅ **3 packaged E2E** passing (2 export/edge + `owner-workflow.packaged` A/B/C/D) |
| `npm run build` | ✅ succeeds (main + preload + renderer) |

## Core phases

| Phase | Feature | State | Notes |
|---|---|---|---|
| 1 | Repo & architecture (secure Electron, typed IPC) | ✅ | contextIsolation/sandbox; Zod-validated IPC |
| 2 | Mockup analysis & design system | ✅ | `docs/MOCKUP-ANALYSIS.md` |
| 3 | Interface shell (mockup-faithful) | ✅ | 4-step guided flow; screenshot-verified |
| 4 | Project persistence (SQLite/Zod/migrations/history) | ✅ | sql.js port; atomic writes; **migration v2**; restart-survival tested |
| A | **Northstar Creative Engine integration** | ✅ | Canonical creative brain; app uses it UI→IPC→persist; verified via real-Electron test |
| B | **MediaVault media import** | ✅ | Real file import → validate → sha256 → dedup → managed copy → SQLite; UI wired; real-Electron test |
| B+ | **Media hardening** | ✅ | SVG rejected; streaming import (bounded memory); ffprobe/ffmpeg analysis + thumbnails/posters; reference-safe deletion; missing-file detection; controlled `sowyvid-media://` protocol |
| — | Branding decoupled | ✅ | `src/config/branding.ts` single source; `docs/BRANDING.md` |
| — | Real-Electron verification | ✅ | `e2e-electron/` drives actual preload+IPC+SQLite for persistence & media |
| C | **FrameLogic visual planning** | ✅ | Validated VisualPlan per commercial (art direction, motion, layout, text-safe frames) |
| C | **Real Remotion Player preview** | ✅ | Step 4 plays the plan with imported media via `sowyvid-media://`; play/pause/seek/duration; missing-media placeholder |
| C+ | **Live managed-video playback** | ✅ | `<OffthreadVideo>` replaces the poster-only still; trim to scene, plan-defined short-clip loop/freeze, poster as loading/failure fallback, **source audio muted by default**; protocol now honors byte ranges (seeking). Verified with a real ffmpeg clip decoding/playing/seeking in Electron (`docs/VIDEO-ENGINE.md`) |
| D | **SoundWeave audio planning** | ✅ | Validated, persisted AudioPlan (engine name/version, music, narration, source-audio policy, fades, looping, ducking, **explicit missing-track state**); real audio in the `<Player>` with master/music/narration/source controls; missing audio warns without breaking. Verified with a real mp3 decoding/playing in Electron (`docs/SOUNDWEAVE-INTEGRATION.md`) |
| D+ | **Manual Suno music brief** | 🟡 | Provider contract + registry + deterministic brief (Northstar intent + FrameLogic energy + SoundWeave duration) implemented and tested. **No UI** — no copy button, no "Abrir Suno". `SunoProvider` has no `generateTrack` at all; no unofficial APIs (`docs/SUNO-MANUAL-WORKFLOW.md`) |
| E | **Owner MP4 export ("Descargar video")** | ✅ | The button drives the production engine: typed ids-only IPC, job registry (one render per project, monotone progress, Spanish stages, safe cancel), native save dialog + presets, sanitized never-silently-overwritten filenames, restart-safe export history with stable failure codes. Proven by clicking the real button in real Electron — real MP4, RMS-audible, history survives restart (`docs/MP4-EXPORT.md`) |
| F | **Windows packaged validation** | ✅ | The packaged `SowyVid.exe` (win-unpacked) exported a real 1080×1920 MP4 — h264+aac, **−26.9 dBFS**, frames validated — **from a planted stale cache**, using the shipped prebuilt render bundle, shipped browser, unpacked compositor and asar-fixed ffmpeg/ffprobe. NSIS installer NOT validated (`docs/WINDOWS-PACKAGED-VALIDATION.md`) |
| F+ | **Owner hotfix: audible exports + visible history** | ✅ | Jorge's packaged exports were **silent (no audio stream)** because imported music was never selected, and his history was invisible after restart because no UI state was restored. Fixed: imported music auto-selects (owner-visible selector to change/remove; reference-guarded removal), and the most recent project — media, plans, export panel, history — restores on startup. Packaged suite now drives ONLY the owner's buttons |
| G | **Owner-workflow recovery** | ✅ | Media is identified from **analyzed content** (ffprobe container/codecs/channels): a video that carries audio shows **`Video · Con audio`** and is never treated as music. **Source-video audio** is its own owner control ("Audio original del video") — off by default, own volume, shown only when an analyzed video truly carries audio; it can be **muted and replaced with an imported MP3/WAV**. A real **"Mis comerciales" library** lists **multiple independent persisted commercials** (not only the latest project), each with its **own export history** — exported videos are **visible inside SowyVid** without a restart, with "Archivo no encontrado" when a file was deleted. **Referenced media has a replace/remove decision dialog** (main-owned cascade, no renderer force flag); **existing exported MP4s are preserved** after source-media removal, and **commercial deletion can preserve exported files**. Proven end to end in the packaged `.exe` — see the packaged acceptance below |
| G+ | **Packaged A/B/C/D owner acceptance** | ✅ | The full flow runs inside `SowyVid.exe` through **visible owner controls only** (`e2e-packaged/owner-workflow.packaged.spec.ts`): `Video · Con audio` identification; source-video audio export **≈ −28.9 dBFS**; original audio muted then replaced with an imported MP3, replacement-music export **≈ −26.9 dBFS**; **two distinct persisted commercial ids** (`proj_w-eMPrOu_W`, `proj_QYBe3G3gGW`) both visible in Mis comerciales after restart with their own export history; referenced-media removal via the dialog with prior exports preserved; commercial deletion preserving the exported file; a final restart leaving only the intended survivor |

## Engine vault (Jorge Engine Vault v1.0.0)

Audited in full; catalog at `docs/ENGINE-VAULT-CATALOG.md`. One engine integrated
per phase.

| Engine | Package | State | Phase |
|---|---|---|---|
| Northstar Creative | `@jorge-engines/northstar-creative` | ✅ **INTEGRATED** | A |
| MediaVault | `@jorge-engines/mediavault` | ✅ **INTEGRATED** | B (now) |
| FrameLogic Visual | `@jorge-engines/framelogic-visual` | ✅ **INTEGRATED** | C (visual/render) |
| SoundWeave Audio | `@jorge-engines/soundweave-audio` | ✅ **INTEGRATED** | D (audio) |
| BridgeDrop LAN | `@jorge-engines/bridgedrop-lan` | ⬜ DEFERRED | E (phone import) |
| PromptGate AI | `@jorge-engines/promptgate-ai` | ⬜ DEFERRED | F (AI, last) |

**Honest audit note:** the vault's own isolated `npm install` failed in this
environment (`Exit handler never called!`), so its native `tsc`/`vitest` could not
be reproduced here; `npm audit` reported **0 vulnerabilities**. Northstar was
verified under SowyVid's toolchain (its 7 test files pass). The other five engines'
results are taken from the vault's documented validation and have **not** been
independently re-run here — they will be validated as each is integrated.

## What works end-to-end today

- Launch the app; the mockup interface renders; navigate sections.
- Create/save/list/delete projects with atomic, **restart-safe** persistence.
- **Choose a style → generate a real commercial plan**: the Home workflow creates a
  project, develops Northstar concepts for the selected family, compiles a validated
  `CommercialRenderPlan`, persists the reproducible selection, and shows the real
  plan summary (scene count · duration). Runs through IPC+SQLite in Electron and via
  the isomorphic engine in browser preview.
- Deterministic guarantee: identical inputs + seed → byte-identical plans (tested).
- **Import real local files** (jpg/png/webp/svg/mp4/mov/wav/mp3) via "Este equipo":
  validated (magic-byte + size), SHA-256 content-addressed, deduplicated, copied
  into managed project storage, listed in the UI, and persisted across restart.
  Imported media feeds Northstar as stable IDs. Verified by a real-Electron test.
- **Preview the commercial** in a real Remotion `<Player>`: the FrameLogic VisualPlan
  drawn to frames with the owner's own media, play/pause/seek/duration.
- **Imported videos play live** in that preview (not poster stills): trimmed to their
  scene, plan-defined loop/freeze when a clip is short, poster as the loading/failure
  fallback, and **source audio muted by default**. Proven by a real ffmpeg clip that
  decodes, plays and seeks inside Electron.
- **Media is identified from analyzed content, not its extension** — ffprobe persists
  container/codecs/sample-rate/channels; tiles read `Video · Con audio`,
  `Video · Sin audio`, `Música · MP3 · 24 s`, `Imagen · Vertical`. An MP4 that carries
  audio is a VIDEO, never background music; an extension/container mismatch is marked
  invalid.
- **Source-video audio is an owner control** ("Audio original del video") — off by
  default, its own volume, shown only when an analyzed video truly carries audio, and
  it can be **muted and replaced with an imported MP3/WAV** as background music. Preview
  and export honor the same persisted setting (packaged source-audio export ≈ −28.9 dBFS;
  replacement-music export ≈ −26.9 dBFS).
- **Real "Mis comerciales" library** over every persisted project — **multiple
  independent commercials** (not only the latest), each card showing name/thumb/status/
  duration/format/media+export counts, with Abrir / Renombrar / Duplicar / Eliminar /
  Abrir último video / carpeta, and a **per-commercial "Videos creados" export history**.
- **Exported videos are visible inside SowyVid** without a restart (step 4 and the
  library), with play / open-file / open-folder / crear-otra-versión, and "Archivo no
  encontrado" retained when a file was deleted from disk.
- **New commercial isolation + restore** — "Nuevo comercial" starts a fresh id without
  overwriting the current one; the current commercial's name shows on Home; on startup
  the most-recent commercial is restored while the others remain in the library.
- **Referenced media can be safely replaced or removed** — the decision dialog
  (Reemplazar / Quitar del comercial y eliminar / Cancelar) is main-owned (no renderer
  force flag); it rebuilds plans from persisted state, **preserves existing exported
  MP4s**, and clears dangling references. Deleting a whole commercial can preserve its
  exported files.
- **Full packaged A/B/C/D acceptance** through visible owner controls inside the real
  `SowyVid.exe`.

## What does NOT work yet (not pretended to)

- **The NSIS installer is unvalidated** — packaged validation ran against the
  unpacked (`--dir`) build. No installed-from-setup.exe run has been performed.
- **Binaries are unsigned.**
- **Music selection is functional but not yet a complete Music Center.** The owner
  can import, auto-select, change, remove and set the volume of a background track,
  and replace imported source-video audio with it — but there is **no in-app music
  preview and no full metadata management** (`audioMeta`: title/creator/license).
- **No Suno owner UI yet** — the deterministic music brief exists in the engine but is
  not exposed in the interface (no copy-brief, no "Abrir Suno").
- **No narration / Voice Engine integration yet** — the AudioPlan supports imported
  narration, but SowyVid has no TTS (PromptGate deferred); narration exists only if a
  voice file is imported.
- **No BridgeDrop phone upload** (`Mi teléfono` unavailable).
- **No CellHub integration.**
- **No social publishing** (🔒 blocked — needs official platform APIs/OAuth/review).
- **Human hearing confirmation is Jorge's gate** — automation measures RMS and
  validates decode; it does not listen through speakers.

## Known issues / caveats

1. sql.js over native `better-sqlite3` (build reliability; `docs/DATABASE.md`).
2. Vendored engines consume **source** via alias (vendor-copy strategy) rather than
   a separate npm-workspace build — the vault's TS 7 / vitest 3-4 toolchain fails to
   install here (`docs/ENGINE-INTEGRATION-ARCHITECTURE.md`).
3. Media has no semantic roles/tags; placement uses orientation + quality scoring.
   Northstar chooses which assets land in which scenes, so fixtures cannot force a
   specific clip into a specific scene — tests that need a short-clip path shorten
   `durationSec` explicitly rather than pass vacuously.
4. Provisional brand — not for public release (`docs/BRANDING.md`).
5. AI shows a mock-active flag; no real provider wired.

## Blocked items

- Real social publishing — needs official platform APIs, approved apps, OAuth, and
  review. SowyVid will export platform-ready media instead. No fake "published".

## Recommended next milestone

**Music Center + Manual Suno Workflow.** The export vertical and the
owner-workflow-recovery milestone are both closed (proven in the packaged
`.exe`): an owner can run multiple commercials, hear a video's original audio or
imported music, see every export inside the app, and safely manage commercials
and media across restarts. The next milestone turns today's functional music
selection into a real Music Center:

- In-app track **preview/audition** and clear selection/replacement UI.
- Full **`audioMeta` management** (title / creator / source / mood / license notes).
- The **manual Suno workflow** surfaced in the UI — show the deterministic brief,
  copy it, "Abrir Suno" — no unofficial APIs.

Later milestones (not part of the above, in rough order of value): NSIS installer
validation + signing; then BridgeDrop (phone upload) and PromptGate
(AI/narration/Voice Engine).

_Do not begin the Music Center milestone yet._
