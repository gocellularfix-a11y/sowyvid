# SowyVid — Testing

> Status: **Implemented** for the layers built so far (engine, persistence, UI
> smoke). Coverage grows with each phase.

## Commands

| Command | What it runs |
|---|---|
| `npm run typecheck` | `tsc --noEmit` for the node project and the web project (strict) |
| `npm run lint` | ESLint flat config, `--max-warnings 0` (no `any`, no empty catch) |
| `npm test` | Vitest unit/integration suite (Node environment) |
| `npm run test:e2e` | Playwright renderer smoke test (auto-starts the Vite dev server) |
| `npm run build` | electron-vite production build (main + preload + renderer) |

## Current results (this milestone)

- **typecheck** — passes (node + web).
- **lint** — passes, 0 warnings.
- **test** — 19 passing across 2 files (see below).
- **test:e2e** — 4 passing.
- **build** — succeeds; outputs `out/main/index.js`, `out/preload/index.cjs`,
  `out/renderer/`.

## Unit / integration tests

### `src/rules/engine.test.ts` (11 tests)
- ≥6 valid templates; each template is **structurally distinct** (not a recolor).
- `resolveDimensions` yields even, correctly-oriented dimensions.
- Scene plans are schema-valid, deterministic (identical inputs → identical plan),
  and change when inputs change.
- Every template produces a valid non-empty plan for the Go Cellular fixture and
  the plans differ across templates.
- Text limits are respected; no-media input falls back to a valid plan.

### `src/database/persistence.test.ts` (8 tests)
- Migrations apply to latest and are idempotent.
- Project create/read with defaults; list newest-first; edits preserve `createdAt`.
- Delete cascades version history.
- Version snapshot + restore round-trip.
- Export-history tracking.
- **Restart survival:** export DB bytes → reopen from bytes → project + export
  history intact (this is exactly what atomic persistence does on disk).

## E2E smoke (`e2e/home.spec.ts`, 4 tests)

Drives the renderer in a browser (preview mode) via Playwright:
- The four guided steps and the trust bar render.
- Style selection behaves as a radio group (`aria-checked`).
- Describe + Continuar transitions Step 4 to a ready preview.
- Sidebar navigation switches sections.

## Real-app verification performed this milestone

- Electron app launched via `electron-vite preview`; process stayed alive and
  created a valid `%APPDATA%\SowyVid\database\sowyvid.db` (proves the main-process
  path: app-data dirs → sql.js open → migrations → atomic persist).
- A full-window screenshot of the running interface was compared against the
  mockup for fidelity.

## Discipline

- No tests are skipped. No `.only`. `--max-warnings 0` keeps lint honest.
- Failures are fixed, never suppressed.

## Planned test coverage (upcoming phases)

Media-import tests, audio-plan tests, render-plan/render smoke, a Playwright
Electron (`_electron`) end-to-end for the full vertical slice, and IPC contract
tests. Tracked in `docs/CURRENT-STATUS.md`.
