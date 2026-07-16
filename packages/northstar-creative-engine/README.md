# Deterministic Creative Engine

A brand-neutral TypeScript engine that converts business promotion inputs and local media metadata into validated, reproducible commercial plans.

It is intentionally independent from:

- Electron
- React
- Remotion
- FFmpeg
- AI providers
- databases
- any previous application or package namespace

The engine can be embedded in a desktop app, web app, server, worker, mobile bridge, or CLI. A renderer adapter converts its neutral render plan into platform-specific input.

## What it does

1. Classifies the promotion using deterministic EN/ES/PT rules.
2. Ranks appropriate creative families.
3. Builds reproducible creative concepts from a seed.
4. Supports five families with three structural variants each: 15 concepts total.
5. Distributes scene duration while respecting hard pacing limits.
6. Scores and assigns media by semantic role, orientation, quality, duration, resolution, and reuse.
7. Validates the final CTA position and complete plan contract.
8. Produces a renderer-neutral timeline with localized fallback copy.
9. Adapts that timeline into serializable Remotion input props.
10. Evaluates plan diversity and supports optional post-render fingerprints.

## What it does not do

- Render video by itself
- Analyze image pixels or recognize objects
- Generate AI copy
- Upload files
- Manage projects or databases
- Publish to social platforms

Those belong in the host application. This package is the deterministic creative-planning layer.

## Core flow

```ts
import {
  developConcepts,
  compileCreativePlan,
  adaptRenderPlan,
  evaluatePlanDiversity,
} from 'deterministic-creative-engine';
import { remotionAdapter } from 'deterministic-creative-engine/remotion';

const concepts = developConcepts({
  businessName: 'Example Store',
  productOrService: 'Certified phones',
  offer: 'Save $100 this week',
  locale: 'en',
  platformIntent: 'vertical_social',
  media: [
    {
      id: 'phone-1',
      kind: 'image',
      roles: ['product'],
      orientation: 'portrait',
      qualityScore: 0.9,
      tags: ['phone'],
    },
    {
      id: 'brand-logo',
      kind: 'logo',
      roles: ['logo'],
      orientation: 'square',
      qualityScore: 1,
      tags: ['brand'],
    },
  ],
}, 3);

const diversity = evaluatePlanDiversity(concepts);

const renderPlan = compileCreativePlan({
  plan: concepts[0],
  content: {
    businessName: 'Example Store',
    productOrService: 'Certified phones',
    offer: 'Save $100 this week',
    callToAction: 'Visit us today',
    locale: 'en',
  },
});

const remotionInputProps = adaptRenderPlan(renderPlan, remotionAdapter);
```

## Installation inside a monorepo

Recommended structure:

```text
app-root/
  apps/
    desktop/
  packages/
    creative-engine/
```

Copy this package into `packages/creative-engine`, then add it to the host app:

```json
{
  "dependencies": {
    "deterministic-creative-engine": "workspace:*"
  }
}
```

The package is marked `private` to prevent accidental public publishing. It can still be used normally as a workspace or local file dependency.

## Main APIs

### `developConcepts(input, count, excludedIds?)`

Returns ranked creative concepts. The first five concepts use different families before the engine begins returning additional variants.

### `developAllConcepts(input)`

Returns all 15 currently available deterministic concepts.

### `buildCreativePlan(options)`

Builds a specific family and variant.

### `compileCreativePlan(options)`

Produces a serializable `CommercialRenderPlan` independent from any renderer.

### `adaptRenderPlan(plan, adapter)`

Maps the neutral plan into a concrete renderer payload.

### `evaluatePlanDiversity(plans, options?)`

Compares actual structure, durations, motion sequence, transitions, media roles, assets, typography, and strategy.

### `compareRenderFingerprints(a, b)`

Compares measurable output supplied by a renderer or preview-analysis step. This avoids claiming that plan diversity alone proves visual diversity.

### `serializeCreativePlan(plan)` and `serializeRenderPlan(plan)`

Use recursive canonical serialization. Nested scene objects remain intact and object keys are stable.

## Deterministic guarantee

The same normalized input, seed, family version, and engine version produce the same plan bytes.

Do not use current time, random UUIDs, network responses, or unordered database results as seed material.

Persist these fields with each project:

- `engineVersion`
- `version`
- `seed`
- `family`
- `variantId`
- `conceptId`

## Media assignment

The host application supplies metadata only. The engine does not open files.

Useful media metadata:

- semantic roles
- orientation
- dimensions
- video duration
- quality score
- tags
- audio presence

Logo slots reject normal product photos. Process scenes prefer usable video. Orientation, resolution, video length, quality, and reuse are scored transparently. Every selected asset includes scoring reasons.

## Adding a renderer

Implement:

```ts
interface RendererAdapter<TOutput> {
  readonly id: string;
  adapt(plan: CommercialRenderPlan): TOutput;
}
```

The included Remotion adapter returns serializable composition input props but does not import Remotion. This keeps the core package portable.

## Adding creative families or variants

Edit `src/families.ts` and add tests for:

- final CTA position
- pacing feasibility
- structural difference
- media requirements
- deterministic output
- option diversity

Do not add a variant that only changes labels or colors.

## Validation and quality

```bash
npm install
npm run check
```

`npm run check` performs:

- strict TypeScript validation
- all automated tests
- production build with declarations

Current validated result:

```text
7 test files passed
14 tests passed
TypeScript passed
Build passed
npm audit: 0 vulnerabilities
```

## Generated examples

See `examples/generated/` for:

- canonical creative plan
- renderer-neutral timeline
- Remotion input props
- diversity report

## Important integration rule

The host application owns media paths, copy editing, templates, project persistence, rendering, audio files, and publishing. The engine should receive stable IDs and metadata, then return decisions. Do not allow the engine to access the filesystem or UI directly.
