# SowyVid — Deterministic Commercial Rule Engine

The engine turns simple business inputs into a fully-resolved **scene plan** with
**no AI and no randomness**. It lives in `src/rules/` and is pure and isomorphic
(no Node-only APIs), so it runs in the main process and in tests identically.

> **Determinism guarantee:** the same `Project` inputs + `templateVersion` +
> `ENGINE_VERSION` always produce an identical `ScenePlan`. Verified by
> `src/rules/engine.test.ts`.

## Inputs → output

```
Project (brief, brand, video, audio, render, media)  +  Template
        │
        ▼  generateScenePlan()  (src/rules/planner.ts)
ScenePlan { engineVersion, template*, dimensions, fps, motionProfile,
            scenes[], totalFrames, inputsHash }
```

`inputsHash` is a stable FNV-1a hash of the **normalized** inputs
(`src/rules/hash.ts` — sorted-key JSON), used for caching and change detection.

## Rule hierarchy (order of decisions)

1. **Aspect ratio** — requested ratio if the template supports it, else the
   template's first supported ratio (`pickAspectRatio`).
2. **Dimensions** — `resolveDimensions(ratio, resolution)` → even width/height
   (H.264 requires even), correctly oriented.
3. **Media scoring** — `scoreMedia()` ranks images/videos by orientation fit +
   quality, tie-broken by id → a deterministic media queue.
4. **Slot selection** — walk the template's `sceneStructure`:
   - media slot + media available → assign next queued media;
   - media slot, none left, required → keep as a branded text scene;
   - media slot, none left, optional → **skip** (fallback);
   - text slot → include if it has any resolvable text, or if not optional.
   - Guarantee: never zero scenes.
5. **Duration distribution** — `distributeDurations()` scales each slot's mid
   duration toward the target total, clamped to each slot's `[min,max]`.
6. **Text resolution** — `textForRole()` pulls headline/subhead/offer/price/cta/
   business-name from the brief, applies sensible Spanish defaults, and clamps to
   the template's per-role character limits (safe text length).
7. **Motion** — `motionFor()` uses the slot's preferred motion, alternates
   ken-burns direction by scene parity (avoids repetitive zooms), and softens
   strong pans to gentle ken-burns under `calm` energy.
8. **Transitions / background** — transition frames scale with energy
   (calm 15 / balanced 10 / energetic 6); background is media, brand gradient, or
   dark depending on availability.

## Input normalization

Before hashing, inputs are normalized to a canonical object (engine version,
template id/version, ratio, resolution, energy, target duration, brief, brand
colors, media order). This makes the hash insensitive to irrelevant ordering and
sensitive to every meaningful change (see the "changes the plan when inputs
change" test).

## Media scoring model

`scoreMedia()` (`src/rules/mediaScoring.ts`):
- `fit` — orientation match to the target ratio (1 exact, 0.75 involving square,
  0.5 portrait↔landscape).
- `quality` — short-edge resolution / 1080, floored at 0.3.
- `priority = fit*0.6 + quality*0.4 + (video ? 0.1 : 0)`, sorted desc, id
  tie-break → stable order.

## Fallback behavior

| Situation | Behavior |
|---|---|
| No media at all | All scenes render as branded text/color scenes; still ends on CTA |
| Fewer media than media slots | Optional media slots are skipped; required ones become text scenes |
| Requested ratio unsupported by template | Falls back to the template's first supported ratio |
| Empty brief fields | Objective-based Spanish default headline; blank optional layers are omitted, never shown empty |

## Conflict resolution

- Requested aspect ratio vs. template support → template support wins (documented).
- Target duration vs. slot bounds → slot `[min,max]` bounds always win (duration
  is *approximately* the target, never violating per-scene limits).
- More text roles than fit → anchors are distributed top/center/bottom to avoid
  overlap; character limits enforced.

## Versioning & reproducibility

- `ENGINE_VERSION` (`src/rules/dimensions.ts`) is stored on every project
  (`ruleEngineVersion`) and every plan (`engineVersion`).
- Templates carry their own `version`, stored as `templateVersion`.
- Because both are persisted, a project generated under v1 can always be
  regenerated identically even after the engine or template evolves — new logic
  only applies when a project is explicitly re-planned under the new version.

## AI handoff points (Phase 11, optional)

The engine never calls AI. AI may *optionally* pre-process inputs **before**
planning (improve copy, rank media, suggest structure) or post-process
**suggestions** the owner can accept — but the plan itself is always deterministic
given the (possibly AI-improved) inputs. See `docs/AI-COST-CONTROL.md`.
