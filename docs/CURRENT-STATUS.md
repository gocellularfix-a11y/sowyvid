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
| `npm test` | ✅ **38 passing** across 9 files (Northstar 7 files/14 tests + persistence 8 + creative integration 16) |
| `npm run test:e2e` | ✅ 4 passing (incl. UI→engine end-to-end) |
| `npm run build` | ✅ succeeds (main + preload + renderer) |
| Real Electron launch | ✅ boots; migrated on-disk DB v1→v2 in place; engine IPC handlers live |

## Core phases

| Phase | Feature | State | Notes |
|---|---|---|---|
| 1 | Repo & architecture (secure Electron, typed IPC) | ✅ | contextIsolation/sandbox; Zod-validated IPC |
| 2 | Mockup analysis & design system | ✅ | `docs/MOCKUP-ANALYSIS.md` |
| 3 | Interface shell (mockup-faithful) | ✅ | 4-step guided flow; screenshot-verified |
| 4 | Project persistence (SQLite/Zod/migrations/history) | ✅ | sql.js port; atomic writes; **migration v2**; restart-survival tested |
| A | **Northstar Creative Engine integration** | ✅ | Canonical creative brain; app uses it UI→IPC→persist; 30 tests |
| — | Branding decoupled | ✅ | `src/config/branding.ts` single source; `docs/BRANDING.md` |

## Engine vault (Jorge Engine Vault v1.0.0)

Audited in full; catalog at `docs/ENGINE-VAULT-CATALOG.md`. One engine integrated
per phase.

| Engine | Package | State | Phase |
|---|---|---|---|
| Northstar Creative | `@jorge-engines/northstar-creative` | ✅ **INTEGRATED** | A (now) |
| MediaVault | `@jorge-engines/mediavault` | ⬜ DEFERRED | B (media import) |
| FrameLogic Visual | `@jorge-engines/framelogic-visual` | ⬜ DEFERRED | C (visual/render) |
| SoundWeave Audio | `@jorge-engines/soundweave-audio` | ⬜ DEFERRED | D (audio) |
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

## What does NOT work yet (not pretended to)

- No rendered video — the Remotion renderer (FrameLogic phase) is deferred; the plan
  is validated + persisted but not drawn to frames. "Descargar video" is marked
  unavailable.
- Real media import, thumbnails, metadata (MediaVault, Phase B).
- Audio, phone upload, real AI, social publishing (Phases D–F; social 🔒 blocked).

## Known issues / caveats

1. sql.js over native `better-sqlite3` (build reliability; `docs/DATABASE.md`).
2. Vendored engines consume **source** via alias (vendor-copy strategy) rather than
   a separate npm-workspace build — the vault's TS 7 / vitest 3-4 toolchain fails to
   install here (`docs/ENGINE-INTEGRATION-ARCHITECTURE.md`).
3. Media has no semantic roles/tags until MediaVault; placement uses orientation +
   quality scoring.
4. Provisional brand — not for public release (`docs/BRANDING.md`).
5. AI shows a mock-active flag; no real provider wired.

## Blocked items

- Real social publishing — needs official platform APIs, approved apps, OAuth, and
  review. SowyVid will export platform-ready media instead. No fake "published".

## Recommended next step

**Phase B — integrate MediaVault** (real media import: magic-byte validation,
SHA-256 content IDs, dedup, managed byte-copy storage). It gives Northstar real
media metadata to assign and unblocks the first genuinely media-driven commercial,
which is the biggest remaining jump toward a publish-ready result.
