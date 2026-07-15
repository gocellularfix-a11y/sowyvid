import { z } from 'zod'
import { AspectRatio, MotionProfile } from './enums'

export const SceneType = z.enum([
  'intro',
  'product',
  'feature',
  'offer',
  'testimonial',
  'before-after',
  'cta',
  'outro',
])
export type SceneType = z.infer<typeof SceneType>

export const TextRole = z.enum(['headline', 'subhead', 'offer', 'price', 'cta', 'business-name'])
export type TextRole = z.infer<typeof TextRole>

export const TransitionType = z.enum(['cut', 'fade', 'slide', 'zoom', 'wipe'])
export type TransitionType = z.infer<typeof TransitionType>

export const MediaMotion = z.enum([
  'none',
  'ken-burns-in',
  'ken-burns-out',
  'pan-left',
  'pan-right',
])
export type MediaMotion = z.infer<typeof MediaMotion>

/** A single text element placed within a scene, with a safe-zone anchor. */
export const TextLayer = z.object({
  role: TextRole,
  text: z.string(),
  /** Vertical anchor within the text-safe area. */
  anchor: z.enum(['top', 'center', 'bottom']),
  /** Relative emphasis, drives type scale in the composition. 1 = normal. */
  emphasis: z.number().min(0.5).max(2),
})
export type TextLayer = z.infer<typeof TextLayer>

export const Scene = z.object({
  id: z.string(),
  index: z.number().int().nonnegative(),
  type: SceneType,
  /** Duration in frames (fps lives on the plan). */
  durationFrames: z.number().int().positive(),
  /** Assigned media id, or null for text/color-only scenes. */
  mediaId: z.string().nullable(),
  mediaMotion: MediaMotion,
  /** Transition INTO this scene from the previous one. */
  transitionIn: TransitionType,
  transitionFrames: z.number().int().nonnegative(),
  textLayers: z.array(TextLayer),
  /** Background used when there is no media (brand color / gradient). */
  background: z.enum(['media', 'brand-solid', 'brand-gradient', 'dark']),
})
export type Scene = z.infer<typeof Scene>

/**
 * A fully-resolved, deterministic plan for one commercial. Given the same
 * project inputs + templateVersion + engineVersion, the engine produces an
 * identical plan (see docs/COMMERCIAL-RULE-ENGINE.md). This is the single
 * artifact the Remotion composition renders.
 */
export const ScenePlan = z.object({
  engineVersion: z.number().int().positive(),
  templateId: z.string(),
  templateVersion: z.number().int().positive(),
  aspectRatio: AspectRatio,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  fps: z.number().int().positive(),
  motionProfile: MotionProfile,
  totalFrames: z.number().int().positive(),
  scenes: z.array(Scene).min(1),
  /** Stable hash of the normalized inputs used to build this plan. */
  inputsHash: z.string(),
})
export type ScenePlan = z.infer<typeof ScenePlan>

export function planDurationSeconds(plan: ScenePlan): number {
  return plan.totalFrames / plan.fps
}
