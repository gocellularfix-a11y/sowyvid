# SowyVid — Template System

Templates are a **core product feature**, not decorative sample cards. Each is a
typed, validated data object (`src/shared/domain/template.ts`) that the
deterministic engine expands into a real commercial. Built-ins live in
`src/rules/templates/builtins.ts` and are validated against the Zod schema at
module load (`src/rules/templates/index.ts`).

## Schema (summary)

| Field | Purpose |
|---|---|
| `id`, `version` | Identity + reproducibility (version persisted with projects) |
| `name`, `description`, `visualStyle` | Owner-facing presentation |
| `categories`, `objectives` | Suitability for business type / goal |
| `motionProfile`, `energyDefault` | Bounded motion behavior + default pacing |
| `sceneStructure: SceneSlot[]` | Ordered slots the engine expands into scenes |
| `durationRangeSec` | Valid total duration window |
| `supportedAspectRatios` | Ratios the template adapts to |
| `typography` | Weight, scale, uppercase headline |
| `textLimits` | Per-role max characters (safe text length) |
| `mediaRequirements` | min images / clips / recommended total |
| `audioMood` | Guidance for the audio engine |
| `platformCompatibility` | Which platforms it targets |
| `fallbackBehavior` | Human-readable degradation description |

### SceneSlot
`type`, `requiresMedia`, `optional`, `min/maxDurationSec`, `textRoles[]`,
`preferredMotion`, `transitionIn`. The engine turns each included slot into one
`Scene`.

## The six built-in templates

| id | Name | Profile | Energy | Structure (scene types) | Distinctive traits |
|---|---|---|---|---|---|
| `direct-fast` | Directo y rápido | bold-retail | energetic | intro→product→feature→offer→cta | UPPERCASE 800-weight, fast cuts, short limits |
| `trust-quality` | Confianza y calidad | calm-professional | calm | intro→feature→feature→cta | Stable, fades only, 600-weight, longer scenes |
| `before-after` | Antes y después | local-service-trust | balanced | intro→before-after→before-after→cta | Wipe/pan reveals, comparison-driven |
| `limited-sale` | Oferta relámpago | urgent-sale | energetic | intro→product→offer→product→cta | Price/offer emphasis, zooms, very short limits |
| `food-showcase` | Sabor que enamora | food-showcase | balanced | intro→product→product→cta | Warm pacing, appetizing ken-burns, soft fades |
| `product-hero` | Producto estelar | product-hero | balanced | intro→product→feature→offer→cta | Premium slides, clean reveals, wide ratio support |

Each has a **unique structural signature** (motion profile + scene-type sequence +
typography) — enforced by a test so no two templates are recolored clones.

## Template selection (UI)

The mockup's step 3 presents 3 styles (`Directo y rápido`, `Confianza y calidad`,
`Antes y después`) which map to `direct-fast`, `trust-quality`, `before-after`.
The remaining templates are available in the full template list. Selection stores
`templateId` + `templateVersion` on the project.

## Media requirements & aspect-ratio adaptation

- `mediaRequirements` communicate how much material gives the best result; the
  engine still produces a valid commercial below the recommendation via fallback.
- `supportedAspectRatios` drive `pickAspectRatio()`; if the requested ratio is
  unsupported, the engine falls back to the template's first supported ratio.
- Dimensions are resolved per ratio with even width/height for H.264.

## Fallback behavior

Each template documents `fallbackBehavior` in plain language, and the engine
implements it structurally: optional media slots skip when media is short,
required slots degrade to branded text scenes, and the commercial always ends on
a CTA. See `docs/COMMERCIAL-RULE-ENGINE.md`.

## Preview generation

A template can be previewed without creating a project by generating a plan from a
sample brief + placeholder media and playing it in the Remotion `<Player>`
(Phase 7). The same plan renders identically in preview and export.

## Compatibility rules

- `platformCompatibility` gates which export presets are offered.
- A project's requested platform must be within the template's compatibility
  list; otherwise the UI recommends a compatible preset.

## Versioning

Templates are versioned independently. Bumping a template's `version` changes
future generations but never silently mutates existing projects — those keep the
`templateVersion` they were generated with and remain reproducible.
