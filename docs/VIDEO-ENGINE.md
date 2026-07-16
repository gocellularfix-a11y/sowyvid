# Video Engine

> Status: **Preview implemented; MP4 export deferred.** Visual direction now comes
> from the **FrameLogic Visual Engine** (`docs/FRAMELOGIC-INTEGRATION.md`), and a
> real Remotion `<Player>` preview renders it (`docs/REMOTION-PREVIEW.md`). The
> input contract is the **VisualPlan** (built from Northstar's render plan), not the
> retired `ScenePlan`. MP4 export via `@remotion/renderer` is the next phase.

The rest of this document is the original design sketch; the authoritative,
implemented behavior is in the FrameLogic + Remotion-preview docs above.

This document describes the planned Remotion composition system for **SowyVid**. Its one
job is to **render a `ScenePlan`** into moving pictures. All business logic (what scenes
exist, how long they run, which media, which motion) is decided upstream by the
deterministic rule engine and stays **out of** the Remotion components. Contracts only;
no code here exists yet.

Intended module locations:

- `src/features/video/` — Remotion compositions, scene components, motion primitives.
- `src/features/video/motion/` — motion profile definitions (bounded behaviors).
- Consumed by preview (Remotion Player) and export (`@remotion/renderer`) — see
  `RENDERING.md`.

## 1. Core principle: the ScenePlan is the input

```ts
// Produced by src/rules/ (already built) — consumed here read-only.
interface ScenePlan {
  fps: number;
  width: number;
  height: number;
  motionProfile: MotionProfileId;
  totalFrames: number;
  scenes: Scene[];
}

interface Scene {
  type: string;                 // e.g. 'hero', 'product', 'cta', 'gallery'
  durationFrames: number;
  mediaId: string | null;
  mediaMotion: MediaMotion;     // pan/zoom/hold directive, bounded
  transitionIn: TransitionSpec;
  textLayers: TextLayer[];
  background: BackgroundSpec;
}
```

The video engine is a **pure function of the plan**: `render(ScenePlan) → frames`. It
must not read the database, call AI, or make timing decisions. If it needs something not
in the plan, that is a gap in the plan, not logic to add here. This guarantees
**preview↔render consistency**: the same plan produces the same output in the Player and
in the exported MP4.

## 2. Composition structure

```
<RootComposition fps width height durationInFrames=totalFrames>
  <Sequence> per Scene, offset by cumulative durationFrames
    <SceneRenderer scene>
      <Background />        // solid/gradient/media-derived, from background
      <MediaLayer />        // image/video fitted; mediaMotion applied
      <TextLayerStack />    // textLayers, safe-positioned and fitted
      <TransitionIn />      // entrance per transitionIn
    </SceneRenderer>
  </Sequence>
</RootComposition>
```

- One Remotion `<Composition>` sized to `width × height` at `fps`, length
  `totalFrames`.
- Each `Scene` becomes a `<Sequence>` placed at the running frame offset; the sum of
  `durationFrames` equals `totalFrames` (validated at the boundary).
- `SceneRenderer` is a dumb dispatcher: it maps `scene.type` and the motion profile to
  presentation, reading only fields present on the scene.

## 3. Motion profiles

The plan carries one `motionProfile`. Each profile is a **bounded** set of behaviors
(timing curves, zoom/pan ranges, text animation style, transition palette). Profiles
never introduce unbounded or random motion — bounds keep output stable and on-brand.

| Profile id | Feel | Bounded behavior sketch |
| --- | --- | --- |
| `premium-clean` | Upscale, restrained | Slow subtle zoom, gentle fades, generous whitespace, minimal text motion. |
| `bold-retail` | Punchy store promo | Firmer cuts, moderate zoom, strong headline pops, bright backgrounds. |
| `high-energy-promo` | Fast sale energy | Quicker scene changes, snappier transitions, kinetic text, higher motion cap. |
| `calm-professional` | Trustworthy, steady | Very slow motion, soft crossfades, stable text, low motion cap. |
| `food-showcase` | Appetizing | Slow push-ins on the dish, warm holds, minimal distracting motion. |
| `product-hero` | Feature the object | Centered product, controlled zoom to detail, clean reveals. |
| `local-service-trust` | Reassuring local biz | Steady pacing, human-scale motion, clear legible text, trust cues. |
| `urgent-sale` | Countdown urgency | Fastest allowed transitions, emphatic CTA motion, high contrast. |
| `social-kinetic` | Feed-native | Rhythmic text-forward motion tuned for mobile viewing. |

Each profile is defined as data with hard caps:

```ts
interface MotionProfile {
  id: MotionProfileId;
  zoom: { min: number; max: number };      // scale bounds for mediaMotion
  panMaxFraction: number;                  // max pan as fraction of frame
  transitionFrames: { min: number; max: number };
  textAnim: 'none' | 'fade' | 'rise' | 'pop';
  motionCap: number;                       // global intensity ceiling 0..1
}
```

The engine clamps every `mediaMotion`/`transitionIn` value from the plan to the active
profile's bounds — the plan proposes, the profile constrains.

### Category motion priorities (from the brief)

| Category | Priority | Motion posture |
| --- | --- | --- |
| Food | Make it appetizing | Slow, warm push-ins and holds (`food-showcase`); avoid frantic motion that reads as cheap. |
| Phone / electronics | Show the product cleanly | Crisp reveals and controlled detail zooms (`product-hero`); precision over flash. |
| Local service | Build trust | Steady, legible, human pacing (`local-service-trust`); calm transitions, clear text. |

## 4. Aspect-ratio adaptation

- The composition takes `width`/`height` from the plan; the engine must render correctly
  for vertical (9:16), square (1:1), and landscape (16:9).
- Layout is expressed in relative units and safe-area fractions so the same scene reflows
  across aspect ratios without hardcoded pixels.
- Media fitting and text safe areas (below) are recomputed per aspect ratio.

## 5. Media fitting

| Directive | Behavior |
| --- | --- |
| Cover (default) | Fill the frame, center-crop; combined with `mediaMotion` pan/zoom within bounds. |
| Contain | Fit whole media, letterbox with `background`; used when cropping would harm the subject. |
| Orientation-aware | A portrait photo in a landscape frame favors contain or a controlled fill respecting `orientation` from the `MediaAsset`. |

Video scenes play their clip trimmed to `durationFrames`; `mediaMotion` for video is
limited to gentle scale to avoid fighting the footage's own motion.

## 6. Text-safe positioning and fitting

- Text is placed inside an aspect-aware **safe area** (margins as frame fractions) so it
  is never clipped by platform UI overlays on Reels/Shorts.
- `TextLayer` content is **fitted**: font size auto-shrinks within min/max bounds to fit
  its box; long strings wrap or truncate deterministically rather than overflow.
- Text animation is dictated by the profile's `textAnim`, keeping motion on-brand.

```ts
interface TextLayer {
  text: string;
  role: 'headline' | 'subhead' | 'cta' | 'caption';
  anchor: 'top' | 'center' | 'bottom';
  maxLines: number;
}
```

## 7. Transition rules

- `transitionIn` describes a scene's entrance; its duration is clamped to the profile's
  `transitionFrames` range.
- Transitions never exceed the incoming scene's `durationFrames`; overlap is bounded so
  no scene is swallowed.
- Allowed transition types are drawn from the profile palette (e.g. fade, soft push);
  the plan cannot request a transition outside what the profile permits.

```ts
interface TransitionSpec { type: 'cut' | 'fade' | 'push' | 'zoom'; frames: number; }
```

## 8. Preview ↔ render consistency

- The **same components** and the **same plan** drive both the Remotion Player (preview,
  in the renderer) and `@remotion/renderer` (export, in a Node process). There is no
  preview-only or render-only visual code path.
- All animation is a deterministic function of frame index and plan data (no
  wall-clock, no randomness without a seed carried in the plan). Given a `ScenePlan`,
  frame N is identical every time, everywhere.
- Validation: on load, the engine asserts `sum(scene.durationFrames) === totalFrames`
  and that every referenced `mediaId` resolves (missing media falls back to
  `background` + text so preview/export never crash).

## 9. Boundaries summary

| Belongs in the video engine | Does NOT belong here |
| --- | --- |
| Turning plan fields into pixels | Deciding scene order/length/media |
| Clamping motion to profile bounds | Choosing the motion profile |
| Fitting text/media to the frame | Writing/altering copy (AI/rules do that) |
| Frame-deterministic animation | DB reads, network, AI calls, fs access |
