import { z } from 'zod'
import {
  AspectRatio,
  BusinessCategory,
  EnergyLevel,
  MotionProfile,
  Platform,
  PromotionObjective,
} from './enums'
import { MediaMotion, SceneType, TextRole, TransitionType } from './scenePlan'

/**
 * A declarative slot in a template's scene structure. The deterministic engine
 * expands slots into concrete scenes based on the project's inputs and the
 * available media (see docs/TEMPLATE-SYSTEM.md).
 */
export const SceneSlot = z.object({
  type: SceneType,
  /** Whether this slot needs a media asset to be included. */
  requiresMedia: z.boolean(),
  /** If true and no media/text is available, the slot is skipped (fallback). */
  optional: z.boolean(),
  minDurationSec: z.number().positive(),
  maxDurationSec: z.number().positive(),
  /** Text roles this slot can display, in priority order. */
  textRoles: z.array(TextRole),
  preferredMotion: MediaMotion,
  transitionIn: TransitionType,
})
export type SceneSlot = z.infer<typeof SceneSlot>

export const TypographyRules = z.object({
  headlineWeight: z.number().int(),
  /** Relative type scale multiplier applied by the composition. */
  scale: z.number().positive(),
  uppercaseHeadline: z.boolean(),
})
export type TypographyRules = z.infer<typeof TypographyRules>

export const TextLimits = z.object({
  headlineMaxChars: z.number().int().positive(),
  subheadMaxChars: z.number().int().positive(),
  offerMaxChars: z.number().int().positive(),
  ctaMaxChars: z.number().int().positive(),
})
export type TextLimits = z.infer<typeof TextLimits>

export const MediaRequirements = z.object({
  minImages: z.number().int().nonnegative(),
  minClips: z.number().int().nonnegative(),
  recommendedTotal: z.number().int().nonnegative(),
})
export type MediaRequirements = z.infer<typeof MediaRequirements>

export const Template = z.object({
  id: z.string(),
  version: z.number().int().positive(),
  name: z.string(),
  description: z.string(),
  /** Business categories this template suits well. */
  categories: z.array(BusinessCategory).min(1),
  objectives: z.array(PromotionObjective).min(1),
  visualStyle: z.string(),
  motionProfile: MotionProfile,
  energyDefault: EnergyLevel,
  sceneStructure: z.array(SceneSlot).min(1),
  durationRangeSec: z.object({ min: z.number().positive(), max: z.number().positive() }),
  supportedAspectRatios: z.array(AspectRatio).min(1),
  typography: TypographyRules,
  textLimits: TextLimits,
  mediaRequirements: MediaRequirements,
  audioMood: z.string(),
  platformCompatibility: z.array(Platform).min(1),
  /** How the template degrades when inputs/media are missing. */
  fallbackBehavior: z.string(),
})
export type Template = z.infer<typeof Template>
