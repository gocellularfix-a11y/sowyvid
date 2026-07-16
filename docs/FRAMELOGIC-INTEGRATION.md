# SowyVid — FrameLogic Visual Engine Integration

> Status: **Wired + validated.** The app builds a validated VisualPlan from every
> compiled commercial and returns it over IPC. It is marked fully **INTEGRATED**
> once the real Remotion preview consumes it (see `docs/REMOTION-PREVIEW.md`).

## What was integrated

**FrameLogic Visual Engine** — `@jorge-engines/framelogic-visual` v1.0.0, vendored
to `packages/framelogic-visual-engine/`. Pure, `zod`-only, renderer-neutral: it
imports nothing from SowyVid, React, Electron, Remotion, Northstar, MediaVault, or
branding. Public API: `resolveArtDirection`, `getMotionProfile`, `resolveGrade`,
`planSceneLayouts`, `resolvePolishedTextFrame`, `createVisualDirectionPlan`.

Its own 4 tests pass under SowyVid's toolchain.

## Responsibilities (never collapsed)

```
Northstar  = what the commercial says and in what order
FrameLogic = how each scene should look and move
Renderer   = how the plan becomes frames
```

## Pipeline & boundary

```
Northstar CommercialRenderPlan + resolved media metadata + brand preferences
  → buildVisualPlan()   (src/features/visual/frameLogicAdapter.ts)
      → FrameLogic createVisualDirectionPlan() (art direction, motion, layout rhythm, text frames)
  → VisualPlan (validated, renderer-neutral — src/features/visual/visualPlan.ts)
  → [Remotion adapter → composition props]   (SowyVid, next commit)
```

Northstar's art-direction names map 1:1 to FrameLogic's (`premium_dark` ↔
`premium-dark`, …), so the visual look stays consistent with the chosen concept.
FrameLogic never sees Remotion; the SowyVid Remotion adapter lives on the app side.

## VisualPlan contract (`visualPlan.ts`)

Validated Zod schema carrying: `visualEngineName` / `visualEngineVersion` /
`visualProfileVersion`, aspect ratio + canvas `width`/`height`/`fps`,
`artDirection` (name, palette, motion profile, transition intensity, content
scale), `motion` profile (bounded camera/zoom/spring), `brandColors`, and per-scene
`VisualScene`: order, role, beat purpose, frame range + transition, media IDs,
media fit, layout placement, crop strategy, focal position, shot behavior + motion,
media grade, text-safe frame (justify/align/max-width/padding/card treatment), copy,
emphasis, and background behavior. Validation enforces **sequential frames**,
**CTA-final**, and **timeline == total**.

Versioning: `visualEngineName` + `visualEngineVersion` + `visualProfileVersion`
travel with the plan (Section 8 reproducibility). The plan is built on demand from
the (already reproducible) Northstar render plan, so it inherits determinism.

## Verification

`src/features/visual/visual.test.ts` (8 host tests): schema-valid CTA-final plan,
aspect/canvas adaptation, determinism, continuous frame timeline, bounded motion
profile, safe text width, adjacent-layout diversity, and rejection of an invalid
(non-CTA-final) plan. Plus FrameLogic's own 4 tests.

## Current limitations

- The Remotion renderer that draws the VisualPlan lands in the next commit; until
  then the plan is built + validated + returned but not yet rendered to frames.
- Visual-template selection (`Project.templateId`) is not yet a FrameLogic input;
  art direction currently derives from the Northstar concept + industry.
