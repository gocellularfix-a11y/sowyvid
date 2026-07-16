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

| Check | Result |
|---|---|
| `npm run typecheck` | ✅ passes (node + web) |
| `npm run lint` | ✅ 0 warnings (`packages/**` vendored engines excluded) |
| `npm test` | ✅ **87 passing** across 16 files (adds FrameLogic visual adapter + Remotion composition-props) |
| `npm run test:e2e` | ✅ 4 passing (browser; incl. UI→engine→real Remotion Player) |
| `npm run test:e2e:electron` | ✅ 3 passing (real Electron: Northstar persistence + MediaVault import + protocol/preview) |
| `npm run build` | ✅ succeeds (main + preload + renderer) |
| Clean install (fresh clone) | ✅ install + all checks pass (729 pkgs, no workspace issues) |

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

## Engine vault (Jorge Engine Vault v1.0.0)

Audited in full; catalog at `docs/ENGINE-VAULT-CATALOG.md`. One engine integrated
per phase.

| Engine | Package | State | Phase |
|---|---|---|---|
| Northstar Creative | `@jorge-engines/northstar-creative` | ✅ **INTEGRATED** | A |
| MediaVault | `@jorge-engines/mediavault` | ✅ **INTEGRATED** | B (now) |
| FrameLogic Visual | `@jorge-engines/framelogic-visual` | ✅ **INTEGRATED** | C (visual/render) |
| SoundWeave Audio | `@jorge-engines/soundweave-audio` | ⬜ DEFERRED | D (audio, next) |
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

## What does NOT work yet (not pretended to)

- **No MP4 export.** The plan is validated, persisted and previewable, but nothing is
  encoded to a file yet. "Descargar video" is marked unavailable.
- **No audio at all** — no music, no narration, and source-video audio is deliberately
  muted. SoundWeave is the next phase.
- Phone upload (`Mi teléfono`) — deferred to BridgeDrop (Phase E), marked unavailable.
- Real AI (PromptGate, Phase F); social publishing (🔒 blocked).

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

## Recommended next step

**SoundWeave audio, then MP4 export.** The picture is now complete — the owner sees
their commercial with their own clips playing live. What is missing is sound and a
file.

1. **SoundWeave** (audio planning) → an AudioPlan the Remotion composition renders:
   background music, narration, source-audio policy, fades, ducking, looping.
2. **MP4 export** via `@remotion/renderer` in a worker process (H.264 + AAC,
   platform presets, progress, cancel, safe temp cleanup) — enabling "Descargar
   video".

Export comes *after* audio on purpose: exporting first would only be able to
produce a silent video, and a silent export is not evidence that rendering works.
