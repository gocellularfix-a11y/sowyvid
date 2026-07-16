import type { CommercialRenderPlan } from '../contracts.js';
import type { RendererAdapter } from '../adapters.js';

export interface RemotionSceneInput {
  id: string;
  from: number;
  durationInFrames: number;
  role: string;
  beatPurpose: string;
  transitionIn: string;
  shotBehavior: string;
  motion: string;
  copy: {
    kicker: string;
    headline: string;
    body: string;
    caption: string;
    spokenText: string;
  };
  media: Array<{ slotRole: string; assetId: string }>;
  fallbackQuery: string;
}

export interface RemotionInputProps {
  compositionId: string;
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
  scenes: RemotionSceneInput[];
  creativeDirection: CommercialRenderPlan['creativeDirection'];
  audioDirection: CommercialRenderPlan['audioDirection'];
  warnings: string[];
}

function secondsToFrames(seconds: number, fps: number): number {
  return Math.max(1, Math.round(seconds * fps));
}

/**
 * This adapter has no dependency on Remotion itself. It returns serializable
 * input props that a Remotion composition can consume.
 */
export const remotionAdapter: RendererAdapter<RemotionInputProps> = {
  id: 'remotion-input-props-v1',
  adapt(plan): RemotionInputProps {
    const fps = plan.platform.fps;
    let frameCursor = 0;
    const scenes = plan.scenes.map((scene) => {
      const durationInFrames = secondsToFrames(scene.durationSec, fps);
      const output: RemotionSceneInput = {
        id: scene.id,
        from: frameCursor,
        durationInFrames,
        role: scene.role,
        beatPurpose: scene.beatPurpose,
        transitionIn: scene.transitionIn,
        shotBehavior: scene.shotBehavior,
        motion: scene.motion,
        copy: scene.copy,
        media: scene.media.map((item) => ({ slotRole: item.slotRole, assetId: item.assetId })),
        fallbackQuery: scene.fallbackQuery,
      };
      frameCursor += durationInFrames;
      return output;
    });

    return {
      compositionId: plan.projectId,
      width: plan.platform.width,
      height: plan.platform.height,
      fps,
      durationInFrames: frameCursor,
      scenes,
      creativeDirection: plan.creativeDirection,
      audioDirection: plan.audioDirection,
      warnings: plan.warnings,
    };
  },
};
