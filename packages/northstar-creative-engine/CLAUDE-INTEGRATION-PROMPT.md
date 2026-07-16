# Prompt: integrate the deterministic creative engine

You are integrating a finished, independently tested TypeScript package into the new commercial-creation application.

The package is provided as:

```text
deterministic-creative-engine
```

Treat this package as the authoritative deterministic planning layer.

## Rules

1. Do not rewrite it from scratch.
2. Do not rename its internal contracts during the initial integration.
3. Do not add dependencies on any previous application or `@colibri/*` package.
4. Do not put filesystem, database, React, Electron, or Remotion rendering logic inside the engine.
5. Do not bypass its Zod validation.
6. Keep the engine as a workspace package:

```text
packages/creative-engine
```

7. Run its full check before integration:

```text
npm install
npm run check
```

Expected baseline:

```text
TypeScript PASS
7 test files PASS
14 tests PASS
Build PASS
npm audit: 0 vulnerabilities
```

## Host application responsibilities

The application must:

- Store projects and engine version information.
- Analyze imported media and produce stable metadata.
- Pass media IDs, never raw filesystem access, into the engine.
- Present the returned concepts visually.
- Allow the owner to select a concept.
- Compile the selected concept through `compileCreativePlan`.
- Resolve stable media IDs into managed local paths only at the renderer boundary.
- Use the Remotion adapter or create another `RendererAdapter`.
- Keep copy edits outside the immutable generated plan or create a versioned edited plan.
- Persist `seed`, `engineVersion`, `family`, `variantId`, and `conceptId`.

## Required integration flow

```text
Owner promotion inputs
        ↓
Local media metadata
        ↓
developConcepts(input, 3)
        ↓
evaluatePlanDiversity(concepts)
        ↓
Owner selects a concept
        ↓
compileCreativePlan({ plan, content })
        ↓
adaptRenderPlan(renderPlan, remotionAdapter)
        ↓
Remotion preview and renderer
```

## Media adapter

Convert managed application media into this shape:

```ts
{
  id: string;
  kind: 'image' | 'video' | 'logo';
  roles: MediaRole[];
  orientation: 'portrait' | 'landscape' | 'square' | 'unknown';
  width?: number;
  height?: number;
  durationSec?: number;
  qualityScore: number;
  tags: string[];
  hasAudio?: boolean;
}
```

Use deterministic local metadata first. Future AI media analysis may enrich roles and tags, but the engine must continue working without AI.

## Remotion integration

Import:

```ts
import { adaptRenderPlan } from 'deterministic-creative-engine';
import { remotionAdapter } from 'deterministic-creative-engine/remotion';
```

The adapter produces scene frame ranges, motion tokens, transitions, copy, and media IDs. Create a host-side resolver that converts each `assetId` into an approved managed media URL or local-file bridge.

Do not give Remotion unrestricted filesystem paths from renderer input.

## Acceptance tests

Add host integration tests proving:

1. Same input and seed return byte-identical plans.
2. The first three concepts are structurally different.
3. A logo CTA never receives a product photo.
4. Every scene stays inside its pacing profile limits.
5. The final scene is always CTA.
6. The compiled timeline duration equals the sum of its scenes.
7. Remotion frame ranges do not overlap or leave accidental gaps.
8. Project restart restores the same selected concept.
9. Existing projects retain their original engine version.
10. No `@colibri/*` dependency or import exists.

## Do not expand scope yet

Complete one excellent end-to-end commercial before adding social publishing, AI generation, campaign analytics, or a professional timeline editor.

At completion, report:

- package location
- host files added or changed
- integration architecture
- test results
- preview result
- rendered MP4 result
- known limitations
- exact next step
