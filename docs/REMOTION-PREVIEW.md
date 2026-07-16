# SowyVid — Remotion Player Preview

> Status: **Implemented.** Step 4 shows a real Remotion `<Player>` that renders the
> FrameLogic VisualPlan with imported MediaVault media. **No MP4 export yet** —
> "Descargar video" stays unavailable until the render/export phase.

## Pipeline (end-to-end)

```
Northstar CommercialRenderPlan
  → FrameLogic VisualPlan            (src/features/visual)
  → visualPlanToCompositionProps()   (src/render/remotionProps.ts — the SowyVid Remotion adapter)
  → <CommercialComposition>          (src/render/compositions/CommercialComposition.tsx)
  → <Player>                         (src/app/features/home/PreviewPlayer.tsx)
      media loaded via sowyvid-media:// (controlled protocol, stable IDs)
```

The `engine.compile` IPC returns the validated `visualPlan`; the renderer converts
it to composition props and feeds a `@remotion/player` `<Player>`.

## What renders

- Imported **images** (and video **poster** frames) via the controlled protocol.
- **Text layers** (kicker / headline / body) positioned by FrameLogic's text-safe
  frame (justify/align/max-width/padding).
- **Scene durations** follow Northstar; **layouts/crops/grades** follow FrameLogic.
- **Motion** (bounded ken-burns zoom from the motion profile) and a fade
  **transition** per scene.
- **CTA is visibly the final scene**; aspect ratio matches the platform (e.g. 9:16).

## Player behavior

Built-in `controls` provide **play / pause / seek / duration / fullscreen**. The
preview updates when the plan changes (React state → new props). Missing media
draws a **safe placeholder** in-composition (no broken image, no crash). The
`<Player>` is wrapped in an error boundary so a preview failure never crashes the
app.

## Asset URL security

The renderer never receives raw paths. Media is referenced by
`sowyvid-media://asset/<projectId>/<mediaId>/<variant>`; the main-process handler
(`src/electron/mediaProtocol.ts`) resolves only well-formed IDs within the
project's managed directory (traversal-guarded). Verified in the real-Electron
preview test (imported asset → 200; unknown id → 404).

## Verification

- `src/render/remotionProps.test.ts`: props conversion, continuous frame ranges,
  CTA-final, managed-ID resolution, missing-media placeholder flag.
- Browser e2e: the `<Player>` mounts after generate (`preview-player` visible).
- Real-Electron e2e (`e2e-electron/remotion-preview.spec.ts`): imported PNG served
  through the protocol (200), invalid id rejected (404), real visual plan
  (scenes > 0, CTA-final, FrameLogic engine).

## Current limitations

- **Video clips render as their poster still** in the preview timeline (image
  frame), not live-playing `OffthreadVideo` yet — full in-preview video playback
  and MP4 export are the next phase.
- Audio is not yet mixed into the preview (SoundWeave phase).
- Transitions are a simple cross-fade; richer transitions come with the renderer.
