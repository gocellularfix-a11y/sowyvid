# SowyVid — Creative Engine Integration (Northstar)

> Status: **INTEGRATED and in use** (Phase A). The temporary in-repo engine has
> been fully removed; Northstar is the single canonical creative brain.

## What was integrated

**Northstar Creative Engine** — `@jorge-engines/northstar-creative` v1.0.0 (internal
`ENGINE_VERSION` `2.0.0`), vendored to `packages/northstar-creative-engine/` from
the Jorge Engine Vault (SHA-256 in `docs/ENGINE-VAULT-CATALOG.md`). It is
renderer-neutral, brand-neutral, and depends only on `zod`.

## Four distinct concepts (never collapsed)

- **Creative family** — persuasive narrative structure (Northstar): 5 families
  (`problem_solution`, `before_after`, `fast_retail`, `trust_craft`, `social_native`)
  × 3 structural variants = 15 deterministic concepts.
- **Visual template** — visual execution (SowyVid `Project.templateId`; FrameLogic
  later).
- **Motion profile** — movement behavior (FrameLogic, deferred).
- **Renderer** — turns a plan into frames (Remotion adapter, deferred).

## Pipeline & boundaries

```
Project (SowyVid)
  → ProjectToCreativeInputAdapter   src/features/creative/projectToCreativeInput.ts
DirectorInput / CommercialContent + engine MediaAsset[]  (src/features/creative/mediaAdapter.ts)
  → Northstar: developConcepts / compileCreativePlan       (CreativeEngineService = src/features/creative/service.ts)
CreativePlan → CommercialRenderPlan  (validated, renderer-neutral)
  → CreativePlanToRendererAdapter    src/features/creative/creativePlanToRenderer.ts
SowyvidRendererPlan (frame ranges + resolved media IDs)
  → [future] Remotion renderer
```

The engine never imports SowyVid/React/Electron/DB/Remotion. The app reaches it
**only** through `src/features/creative/` (barrel `index.ts`).

## Canonical public API used

`developConcepts`, `developAllConcepts`, `compileCreativePlan`, `adaptRenderPlan`
+ `remotionAdapter` (subpath), `classifyPromotion`, `evaluatePlanDiversity`,
`serializeCreativePlan`, `ENGINE_VERSION`, and the `CreativePlan` /
`CommercialRenderPlan` Zod contracts (CTA-final; scene durations sum exactly to
the target; sequential frame timeline).

## Adapters (host-side)

| Adapter | File | Role |
|---|---|---|
| ProjectToCreativeInput | `projectToCreativeInput.ts` | Maps brief/category/objective/aspect→platformIntent, media→engine media; normalizes wording (no DB/UI terms leak into the engine) |
| Media | `mediaAdapter.ts` | SowyVid managed media → engine metadata (logo→`['logo']`, audio excluded, derived quality); IDs only, never paths |
| CreativeEngineService | `service.ts` | `developProjectConcepts`, `findProjectConcept`, `compileProjectConcept`, `toRendererPlan`, `projectAssetResolver`; builds the persisted `CreativeSelection` + `inputFingerprint` |
| CreativePlanToRenderer | `creativePlanToRenderer.ts` | `CommercialRenderPlan` → `SowyvidRendererPlan` (frame ranges via engine's Remotion frame adapter + asset-ID resolution) |
| Families | `families.ts` | Spanish owner-facing labels for the 5 families |

## Persistence & reproducibility

`Project.creative` (`CreativeSelection`) stores `engineVersion`, `family`,
`variantId`, `conceptId`, `seed`, `inputFingerprint`, `targetDurationSec`. The
`projects` table gains indexed `concept_id` and `seed` columns via **migration v2**
(non-destructive `ALTER TABLE ADD COLUMN`). Identical project inputs + seed
reproduce byte-identical plans (tested).

## Migration behavior (existing projects)

- The removed engine's fields (`templateVersion`, `ruleEngineVersion`) are simply
  absent from the schema; Zod strips unknown keys on read, so **pre-integration
  projects still load** and `creative` defaults to `null` (tested — see
  `src/features/creative/creative.test.ts`, "legacy project still loads").
- No existing project is silently regenerated.

## What came from the engine / was adapted / rejected

- **From Northstar (unchanged):** all creative logic, classification, pacing,
  media scoring, diversity, serialization, contracts, the Remotion frame adapter.
- **Adapted (SowyVid side):** project→input mapping, media→engine-metadata mapping,
  render-plan→SowyVid-renderer-plan mapping, persistence of the selection, Spanish
  family labels, and the UI wiring.
- **Rejected / not copied:** the engine's `dist/` and `node_modules/` (app builds
  from source); npm-workspace build (toolchain risk — see
  `docs/ENGINE-INTEGRATION-ARCHITECTURE.md`); the old temporary engine (deleted).

## The application actually uses it

- Main process: `src/electron/ipc/registerHandlers.ts` exposes `engine.families`,
  `engine.developConcepts`, `engine.compile` (Zod-validated IPC; compile persists
  the selection + bumps status to `planned`).
- Renderer: the Home workflow (`HomeWorkspace.tsx`) creates a project, develops
  concepts for the selected style's family, compiles, and shows the real plan
  summary (scene count · duration). Verified by the e2e test
  "describe + continue drives the real creative engine end-to-end".

## Verification

Under SowyVid's toolchain: Northstar's **7 test files / 14 tests pass**, plus **16
host integration tests** (determinism, family diversity, CTA-final, timeline sum,
frame continuity, EN/ES/PT classification, adapter mapping, selection persistence
across restart, legacy load, invalid-concept rejection, no `@colibri` in source).
`typecheck` / `lint` / `test` / `test:e2e` / `build` all green.

## Current limitations

- No Remotion renderer yet (FrameLogic + render is a later phase) — the compiled
  plan is validated and persisted but not yet drawn to frames.
- Media has no semantic roles/tags until MediaVault (Phase B), so non-logo media is
  placed by orientation/quality scoring.
- The engine's **own isolated** `tsc`/`vitest` could not be reproduced here (vault
  npm install failure); verification was done under SowyVid's toolchain instead.
