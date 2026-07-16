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

- Imported **images** and **live-playing video** via the controlled protocol.
  Video plays through `<OffthreadVideo>`; the poster is the loading/failure
  fallback, not the content. See **`docs/VIDEO-ENGINE.md`** for the trim / short-clip
  / source-audio rules.
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

### Byte ranges (required for video)

The handler honors single `Range` requests (`206` + `Content-Range`, and
`Accept-Ranges: bytes` on full responses). This is not cosmetic: Chromium asks
for byte ranges to seek, and the `<Player>` seeks constantly to keep every video
element pinned to the timeline. Serving only whole files leaves seeking
unreliable. Parsing is pure and unit-tested (`src/features/media/httpRange.ts`);
multi-range requests intentionally degrade to a full `200` rather than being
answered incorrectly.

## Verification

- `src/render/remotionProps.test.ts`: props conversion, continuous frame ranges,
  CTA-final, managed-ID resolution, live-video URLs/trim/mute, missing-media flag.
- `src/render/videoPlayback.test.ts`: trim, short-clip loop/freeze, valid start
  position, unknown duration, source-audio mute policy.
- `src/features/media/httpRange.test.ts`: range parsing and headers.
- Browser e2e: the `<Player>` mounts after generate (`preview-player` visible).
- Real-Electron e2e (`e2e-electron/remotion-preview.spec.ts`): imported PNG served
  through the protocol (200), invalid id rejected (404), real visual plan
  (scenes > 0, CTA-final, FrameLogic engine).
- Real-Electron e2e (`e2e-electron/live-video-preview.spec.ts`): a genuine ffmpeg
  H.264 clip is imported and **actually decodes, plays and seeks** in Electron
  through the `sowyvid-media://` URL — real dimensions, `currentTime` advancing
  (not a still), a seek landing at 2.0s, and `206`/`Content-Range` on a range
  request. This is what backs the "live video works" claim.

## Current limitations

- Audio is not yet mixed into the preview (SoundWeave phase). Source-video audio
  is **muted** — it is off until an AudioPlan explicitly enables it.
- No MP4 export yet; "Descargar video" stays unavailable until the render phase.
- Transitions are a simple cross-fade; richer transitions come with the renderer.
