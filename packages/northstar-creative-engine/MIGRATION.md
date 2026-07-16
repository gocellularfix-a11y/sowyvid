# Migration from the previous creative-brain package

This package is a clean, independent replacement. It does not import or require any previous application package.

## Removed dependencies

The previous compiler depended on private packages for blueprint schemas, localized copy, and export presets. Those imports are gone.

Removed:

```text
@colibri/blueprint-core
@colibri/i18n
@colibri/export-presets
```

The new engine depends only on Zod at runtime.

## Main corrections

### Canonical serialization

Old behavior used a top-level key replacer and caused nested objects to serialize as empty objects.

New behavior recursively sorts every object key while preserving arrays and nested content.

### Pacing bounds

Old behavior could add rounding remainder to a scene after clamping and exceed the profile maximum.

New behavior allocates integer precision units inside fixed capacities. It either returns an exact feasible distribution or throws a descriptive error.

### CTA validation

Old behavior accepted a CTA anywhere while the error message claimed the plan closed with a CTA.

New behavior requires the final scene role to be `cta`.

### Localization

Old classification had partial English and Spanish keywords and almost no Portuguese support.

New classification scores all matching signals in English, Spanish, and Portuguese.

### Classification ranking

Old behavior returned the first matching category.

New behavior scores all categories, applies objective boosts, reports reasons, calculates confidence, and ranks families.

### Media assignment

Old behavior selected the first exact role or any unused asset.

New behavior scores:

- semantic compatibility
- orientation
- media kind
- video duration
- resolution
- quality
- prior reuse
- deterministic tie-breaking

A normal photo cannot fill a logo slot.

### Concept variety

Old behavior had one fixed recipe per family and a seed changed only the concept ID.

New behavior has three structural variants per family. The seed deterministically controls variant order, producing up to 15 reproducible concepts.

### Diversity evaluation

Old behavior mostly compared descriptive metadata.

New behavior compares ordered structure, scene duration patterns, motion sequences, shot sequences, transitions, media roles, assigned assets, typography, emotion, and strategy. It also provides an optional renderer fingerprint contract for measuring final previews.

### Generic compilation

Old behavior compiled directly into one private application blueprint.

New behavior compiles into `CommercialRenderPlan`, a brand-neutral, renderer-neutral timeline. Adapters map that plan to Remotion or other systems.

## Integration mapping

| Previous concept | New equivalent |
|---|---|
| `CreativePlan` V1 | `CreativePlan` V2 |
| `compilePlanToBlueprint` | `compileCreativePlan` |
| private blueprint | `CommercialRenderPlan` |
| direct Remotion assumptions | `RendererAdapter<T>` |
| one recipe per family | three variants per family |
| `evaluateDiversity` | `evaluatePlanDiversity` |
| top-level JSON replacer | recursive canonical serializer |

## Do not migrate

Do not copy the old compiler, package namespace, private imports, mock audio configuration, or application blueprint assumptions into the host app.
