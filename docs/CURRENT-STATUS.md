# SowyVid — Current Status

Honest, per-feature state as of this milestone. Legend:

- ✅ **Complete** — implemented and verified (tests and/or real-app run).
- 🟡 **Functional but limited** — works, with scope caveats.
- 🧩 **Scaffolded** — types/contracts/UI exist; behavior not wired.
- ⬜ **Not implemented** — design only (see the relevant doc).
- 🔒 **Blocked** — needs external credentials/approval.

> Nothing below is described as finished unless it has been tested. Scaffolding is
> never presented in the UI as a completed feature — unavailable controls say so.

## Verification snapshot

| Check | Result |
|---|---|
| `npm run typecheck` | ✅ passes (node + web) |
| `npm run lint` | ✅ passes, 0 warnings |
| `npm test` | ✅ 19 passing (engine 11, persistence 8) |
| `npm run test:e2e` | ✅ 4 passing (renderer smoke) |
| `npm run build` | ✅ succeeds (main + preload + renderer) |
| Real Electron launch | ✅ boots, creates `%APPDATA%\SowyVid\database\sowyvid.db` |

## Phase status

| Phase | Feature | State | Notes |
|---|---|---|---|
| 1 | Repo & architecture (electron-vite, secure main/preload, typed IPC) | ✅ | contextIsolation/sandbox on, Zod-validated IPC, app boots |
| 2 | Mockup analysis & design system | ✅ | `docs/MOCKUP-ANALYSIS.md`; tokens + primitives |
| 3 | Interface shell (mockup-faithful) | ✅ | Header, sidebar, 4-step flow, style cards, trust bar; states wired; screenshot-verified |
| 4 | Project persistence (SQLite/Zod/migrations/history) | ✅ | sql.js behind a port; atomic writes; restart-survival tested |
| 5 | Templates & deterministic engine | ✅ | 6 distinct templates; reproducible `ScenePlan`; 11 tests |
| — | IPC for projects/templates/plan | ✅ | Wired through preload; main handlers implemented |
| 6 | Local media library / import pipeline | ⬜ | `docs/MEDIA-PIPELINE.md`; UI sources marked "disponible pronto" |
| 7 | Remotion preview | ⬜ | `docs/RENDERING.md`; Step-4 preview is a UI simulation, clearly labeled |
| 8 | Audio engine + music library | ⬜ | `docs/AUDIO-ENGINE.md` |
| 9 | MP4 rendering (H.264) | ⬜ | `docs/RENDERING.md`; "Descargar video" marked unavailable |
| 10 | Local phone upload (LAN) | ⬜ | `docs/PHONE-IMPORT-ARCHITECTURE.md`; "Mi teléfono" marked unavailable |
| 11 | AI gateway + cost controls | 🧩 | `docs/AI-COST-CONTROL.md`; `mockAiActive` flag exposed; gateway not built |
| 12 | Social publishing adapters | ⬜🔒 | `docs/SOCIAL-CONNECTOR-ARCHITECTURE.md`; blocked on OAuth/app review |
| 13 | Vertical-slice QA | 🟡 | Persistence + engine + UI slices tested; full end-to-end awaits phases 6–9 |
| 14 | Documentation & audit | ✅ | All docs present; this file is the source of truth |

## What actually works end-to-end today

- Launch the app; the mockup interface renders with the guided 4-step flow.
- Navigate between Inicio / Mis comerciales / Material.
- Create/save/list/delete projects with full validation and **atomic, restart-safe
  persistence** (via IPC in the app; via an in-memory mock in browser-preview).
- Generate a **deterministic scene plan** from any of the 6 templates (the engine
  runs both in the main process and — because it's isomorphic — in browser preview).
- Project/template/engine versions are persisted for reproducibility.

## What does NOT work yet (and is not pretended to)

- Importing real media, generating thumbnails, or reading media metadata.
- Playing a real Remotion preview or rendering an MP4.
- Any audio, phone upload, real AI calls, or social publishing.
- The Step-4 "preview" and "Descargar video" in the shell are a **simulation** /
  marked-unavailable action, not a real render.

## Known issues / caveats

1. **sql.js vs. better-sqlite3.** Chosen deliberately for build reliability
   (see `docs/DATABASE.md`); write-through persists the whole DB each mutation —
   fine at expected project counts, revisit if libraries grow very large.
2. **Fonts** use a system stack (no bundled/remote font) — a deliberate offline/CSP
   choice; premium on Windows via Segoe UI Variable.
3. **Brand mark** intentionally deviates from the mockup's hummingbird (that was
   Colibrí's identity); SowyVid ships a new swift mark. Documented in the mockup
   analysis.
4. **Platform coverage** verified on Windows only.
5. **AI** shows a mock-active flag; no real provider is wired, and mock output is
   never presented as real intelligence.

## Blocked items

- **Real social publishing** — requires official Instagram/Facebook/TikTok/YouTube
  API access, approved applications, OAuth credentials, and platform review. Until
  then SowyVid will export valid, platform-ready media (manual fallback). No fake
  "published successfully".

## Recommended next step

Implement **Phase 6 (local media import) → Phase 7 (Remotion preview of the scene
plan)**: this turns the already-working deterministic engine into something the
owner can *see*, which is the single biggest jump in real value toward the first
publish-ready commercial.
