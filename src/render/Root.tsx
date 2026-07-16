import { Composition } from 'remotion'
import { CommercialComposition } from './compositions/CommercialComposition'
import type { CommercialCompositionProps } from './remotionProps'
import { COMMERCIAL_COMPOSITION_ID } from './compositionId'

/**
 * The Remotion root — the ONLY composition registry, used by the production
 * render. The preview `<Player>` mounts `<CommercialComposition>` directly with
 * the same props from the same adapters, so preview and export consume
 * compatible composition code by construction rather than by convention.
 */

export { COMMERCIAL_COMPOSITION_ID }

/**
 * Placeholder metadata only. Every real value comes from `calculateMetadata`
 * below, because a commercial's size/fps/length are decided by the VisualPlan,
 * not by this file.
 */
const FALLBACK_PROPS: CommercialCompositionProps = {
  width: 1080,
  height: 1920,
  fps: 30,
  durationInFrames: 150,
  brandColors: [],
  palette: { backgroundDepth: 0, glow: 0, hueShiftDeg: 0, saturation: 1, vignette: 0 },
  motion: {
    name: 'none',
    cameraTravel: 0,
    zoomStart: 1,
    zoomEnd: 1,
    transitionFrames: 0,
    springDamping: 1,
    springStiffness: 1,
    textDelayFrames: 0,
    maxRotationDeg: 0,
  },
  scenes: [],
  audio: null,
}

export const RemotionRoot: React.FC = () => (
  <Composition
    id={COMMERCIAL_COMPOSITION_ID}
    component={CommercialComposition}
    durationInFrames={FALLBACK_PROPS.durationInFrames}
    fps={FALLBACK_PROPS.fps}
    width={FALLBACK_PROPS.width}
    height={FALLBACK_PROPS.height}
    defaultProps={FALLBACK_PROPS}
    // The plan is authoritative: the rendered file's dimensions, frame rate and
    // length are taken from the props, never from the registration above.
    calculateMetadata={({ props }) => ({
      durationInFrames: props.durationInFrames,
      fps: props.fps,
      width: props.width,
      height: props.height,
    })}
  />
)
