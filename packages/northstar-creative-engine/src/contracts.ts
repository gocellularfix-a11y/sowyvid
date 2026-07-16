import { z } from 'zod';
import { canonicalStringify } from './stable.js';

export const ENGINE_VERSION = '2.0.0';
export const CREATIVE_PLAN_VERSION = 2 as const;
export const RENDER_PLAN_VERSION = 1 as const;

export const SUPPORTED_LOCALES = ['en', 'es', 'pt'] as const;
export const SupportedLocaleSchema = z.enum(SUPPORTED_LOCALES);
export type SupportedLocale = z.infer<typeof SupportedLocaleSchema>;

export const SCENE_ROLES = [
  'hook',
  'intro',
  'problem',
  'solution',
  'feature',
  'proof',
  'testimonial',
  'comparison',
  'offer',
  'announcement',
  'cta',
] as const;
export const SceneRoleSchema = z.enum(SCENE_ROLES);
export type SceneRole = z.infer<typeof SceneRoleSchema>;

export const CREATIVE_FAMILIES = [
  'problem_solution',
  'before_after',
  'fast_retail',
  'trust_craft',
  'social_native',
] as const;
export const CreativeFamilySchema = z.enum(CREATIVE_FAMILIES);
export type CreativeFamily = z.infer<typeof CreativeFamilySchema>;

export const CAMPAIGN_OBJECTIVES = [
  'drive_action',
  'build_trust',
  'show_transformation',
  'announce',
  'stop_scroll',
] as const;
export const CampaignObjectiveSchema = z.enum(CAMPAIGN_OBJECTIVES);
export type CampaignObjective = z.infer<typeof CampaignObjectiveSchema>;

export const EMOTIONAL_DIRECTIONS = [
  'reassuring',
  'urgent',
  'aspirational',
  'confident',
  'energetic',
  'empathetic',
] as const;
export const EmotionalDirectionSchema = z.enum(EMOTIONAL_DIRECTIONS);
export type EmotionalDirection = z.infer<typeof EmotionalDirectionSchema>;

export const PLATFORM_INTENTS = [
  'vertical_social',
  'story',
  'square_social',
  'landscape_video',
  'portrait_video',
  'generic',
] as const;
export const PlatformIntentSchema = z.enum(PLATFORM_INTENTS);
export type PlatformIntent = z.infer<typeof PlatformIntentSchema>;

export const TEXT_DENSITIES = ['low', 'medium', 'high'] as const;
export const TextDensitySchema = z.enum(TEXT_DENSITIES);
export type TextDensity = z.infer<typeof TextDensitySchema>;

export const SHOT_BEHAVIORS = [
  'static',
  'full_frame_hold',
  'detail_crop',
  'subtle_push',
  'fast_push',
  'snap_zoom',
  'impact_scale',
  'pull_back',
  'pan_h',
  'pan_v',
  'parallax',
  'split_reveal',
  'before_after_reveal',
  'rapid_montage',
] as const;
export const ShotBehaviorSchema = z.enum(SHOT_BEHAVIORS);
export type ShotBehavior = z.infer<typeof ShotBehaviorSchema>;

export const MOTION_MOVES = [
  'hard_cut',
  'clean_cut',
  'clean_fade',
  'subtle_push',
  'fast_push',
  'snap_zoom',
  'pull_back',
  'horizontal_reveal',
  'vertical_reveal',
  'masked_wipe',
  'split_screen',
  'before_after_reveal',
  'kinetic_text',
  'staggered_text',
  'impact_scale',
  'parallax',
  'static_hold',
  'rapid_cut_sequence',
  'proof_hold',
] as const;
export const MotionMoveSchema = z.enum(MOTION_MOVES);
export type MotionMove = z.infer<typeof MotionMoveSchema>;

export const TRANSITIONS = [
  'hard_cut',
  'clean_cut',
  'clean_fade',
  'masked_wipe',
  'split_screen',
  'before_after_reveal',
] as const;
export const TransitionSchema = z.enum(TRANSITIONS);
export type Transition = z.infer<typeof TransitionSchema>;

export const BACKGROUND_MOTIONS = ['off', 'subtle', 'active'] as const;
export const BackgroundMotionSchema = z.enum(BACKGROUND_MOTIONS);
export type BackgroundMotion = z.infer<typeof BackgroundMotionSchema>;

export const PACING_PROFILES = [
  'social_fast',
  'retail_energy',
  'transformation',
  'trust_precision',
  'premium_controlled',
] as const;
export const PacingProfileNameSchema = z.enum(PACING_PROFILES);
export type PacingProfileName = z.infer<typeof PacingProfileNameSchema>;

export const MOTION_PROFILES = [
  'calm',
  'retail_energy',
  'premium',
  'urgent_sale',
  'social_reel',
] as const;
export const MotionProfileSchema = z.enum(MOTION_PROFILES);
export type MotionProfile = z.infer<typeof MotionProfileSchema>;

export const ART_DIRECTIONS = [
  'premium_dark',
  'retail_energy',
  'urgent_sale',
  'clean_modern',
  'social_reel',
] as const;
export const ArtDirectionSchema = z.enum(ART_DIRECTIONS);
export type ArtDirection = z.infer<typeof ArtDirectionSchema>;

export const MEDIA_ROLES = [
  'product',
  'process',
  'result',
  'person',
  'store',
  'proof',
  'testimonial',
  'logo',
  'before',
  'after',
  'any',
] as const;
export const MediaRoleSchema = z.enum(MEDIA_ROLES);
export type MediaRole = z.infer<typeof MediaRoleSchema>;

export const MediaKindSchema = z.enum(['image', 'video', 'logo']);
export type MediaKind = z.infer<typeof MediaKindSchema>;

export const OrientationSchema = z.enum(['portrait', 'landscape', 'square', 'unknown']);
export type Orientation = z.infer<typeof OrientationSchema>;

export const MediaAssetSchema = z.object({
  id: z.string().min(1),
  kind: MediaKindSchema,
  roles: z.array(MediaRoleSchema).default([]),
  orientation: OrientationSchema.default('unknown'),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  durationSec: z.number().positive().optional(),
  qualityScore: z.number().min(0).max(1).default(0.5),
  tags: z.array(z.string().min(1)).default([]),
  hasAudio: z.boolean().optional(),
});
export type MediaAsset = z.infer<typeof MediaAssetSchema>;

export const AssignedMediaSchema = z.object({
  slotRole: MediaRoleSchema,
  assetId: z.string().min(1),
  score: z.number(),
  reasons: z.array(z.string()),
});
export type AssignedMedia = z.infer<typeof AssignedMediaSchema>;

export const SceneDirectiveSchema = z.object({
  role: SceneRoleSchema,
  beatPurpose: z.string().min(1),
  shotBehavior: ShotBehaviorSchema,
  motion: MotionMoveSchema,
  transitionIn: TransitionSchema,
  textDensity: TextDensitySchema,
  holdBias: z.number().min(0.1).max(4),
  durationSec: z.number().positive(),
  mediaSlots: z.array(MediaRoleSchema).max(4).default([]),
  assignedMedia: z.array(AssignedMediaSchema).max(4).default([]),
  emphasis: z.enum(['none', 'offer', 'proof', 'cta', 'hook']).default('none'),
});
export type SceneDirective = z.infer<typeof SceneDirectiveSchema>;

export const PromotionCategorySchema = z.enum([
  'repair',
  'transformation',
  'retail_offer',
  'service_trust',
  'announcement',
  'food',
  'event',
  'product_launch',
  'testimonial',
  'generic',
]);
export type PromotionCategory = z.infer<typeof PromotionCategorySchema>;

export const ClassificationResultSchema = z.object({
  category: PromotionCategorySchema,
  confidence: z.number().min(0).max(1),
  scores: z.record(PromotionCategorySchema, z.number().nonnegative()),
  reasons: z.array(z.string()),
});
export type ClassificationResult = z.infer<typeof ClassificationResultSchema>;

export const TypographySchema = z.object({
  density: TextDensitySchema,
  emphasis: z.enum(['calm', 'bold', 'impact']),
  case: z.enum(['sentence', 'title', 'upper']),
});
export type TypographyDirection = z.infer<typeof TypographySchema>;

export const MusicDirectionSchema = z.object({
  style: z.string().min(1),
  energy: z.enum(['low', 'medium', 'high']),
}).nullable();
export type MusicDirection = z.infer<typeof MusicDirectionSchema>;

export const NarrationDirectionSchema = z.object({
  tone: z.string().min(1),
  pace: z.enum(['slow', 'medium', 'fast']),
}).nullable();
export type NarrationDirection = z.infer<typeof NarrationDirectionSchema>;

export const CreativePlanSchema = z.object({
  version: z.literal(CREATIVE_PLAN_VERSION),
  engineVersion: z.string().min(1),
  conceptId: z.string().min(1),
  seed: z.string().min(1),
  family: CreativeFamilySchema,
  variantId: z.string().min(1),
  ownerName: z.string().min(1),
  ownerDescription: z.string().min(1),
  promise: z.string().min(1),
  objective: CampaignObjectiveSchema,
  audienceIntent: z.string().min(1),
  hookStrategy: z.string().min(1),
  emotionalDirection: EmotionalDirectionSchema,
  storyStructure: z.array(z.string().min(1)).min(3),
  scenes: z.array(SceneDirectiveSchema).min(3).max(10),
  pacingProfile: PacingProfileNameSchema,
  motionProfile: MotionProfileSchema,
  artDirection: ArtDirectionSchema,
  backgroundMotion: BackgroundMotionSchema,
  transitionStyle: z.string().min(1),
  typography: TypographySchema,
  proofStrategy: z.string().min(1),
  offerStrategy: z.string().min(1),
  ctaStrategy: z.string().min(1),
  targetDurationSec: z.number().positive().max(90),
  platformIntent: PlatformIntentSchema,
  classification: ClassificationResultSchema,
  mediaRequirements: z.object({
    minItems: z.number().int().min(0).max(30),
    roles: z.array(MediaRoleSchema),
  }),
  mediaWarnings: z.array(z.string()).default([]),
  musicDirection: MusicDirectionSchema,
  narrationDirection: NarrationDirectionSchema,
}).superRefine((plan, context) => {
  if (plan.scenes.length !== plan.storyStructure.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['storyStructure'],
      message: `scenes (${plan.scenes.length}) must align 1:1 with storyStructure (${plan.storyStructure.length})`,
    });
  }
  const finalScene = plan.scenes.at(-1);
  if (finalScene?.role !== 'cta') {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['scenes'],
      message: 'the final scene must be a cta scene',
    });
  }
  const durationTotal = plan.scenes.reduce((sum, scene) => sum + scene.durationSec, 0);
  if (Math.abs(durationTotal - plan.targetDurationSec) > 0.001) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['targetDurationSec'],
      message: `scene durations (${durationTotal}) must equal targetDurationSec (${plan.targetDurationSec})`,
    });
  }
});
export type CreativePlan = z.infer<typeof CreativePlanSchema>;

export interface ValidationResult<T> {
  ok: boolean;
  value?: T;
  errors: string[];
}

export function validateCreativePlan(candidate: unknown): ValidationResult<CreativePlan> {
  const result = CreativePlanSchema.safeParse(candidate);
  if (result.success) return { ok: true, value: result.data, errors: [] };
  return {
    ok: false,
    errors: result.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`),
  };
}

export function serializeCreativePlan(plan: CreativePlan): string {
  return canonicalStringify(CreativePlanSchema.parse(plan));
}

export const SceneCopySchema = z.object({
  kicker: z.string(),
  headline: z.string(),
  body: z.string(),
  caption: z.string(),
  spokenText: z.string(),
});
export type SceneCopy = z.infer<typeof SceneCopySchema>;

export const RenderSceneSchema = z.object({
  id: z.string().min(1),
  order: z.number().int().nonnegative(),
  role: SceneRoleSchema,
  beatPurpose: z.string().min(1),
  startSec: z.number().nonnegative(),
  durationSec: z.number().positive(),
  transitionIn: TransitionSchema,
  shotBehavior: ShotBehaviorSchema,
  motion: MotionMoveSchema,
  textDensity: TextDensitySchema,
  copy: SceneCopySchema,
  media: z.array(AssignedMediaSchema),
  fallbackQuery: z.string().min(1),
});
export type RenderScene = z.infer<typeof RenderSceneSchema>;

export const PlatformPresetSchema = z.object({
  intent: PlatformIntentSchema,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  fps: z.number().int().positive(),
  safeMarginRatio: z.number().min(0).max(0.3),
});
export type PlatformPreset = z.infer<typeof PlatformPresetSchema>;

export const CommercialRenderPlanSchema = z.object({
  version: z.literal(RENDER_PLAN_VERSION),
  engineVersion: z.string().min(1),
  projectId: z.string().min(1),
  conceptId: z.string().min(1),
  family: CreativeFamilySchema,
  variantId: z.string().min(1),
  locale: SupportedLocaleSchema,
  platform: PlatformPresetSchema,
  durationSec: z.number().positive(),
  scenes: z.array(RenderSceneSchema).min(3),
  creativeDirection: z.object({
    pacingProfile: PacingProfileNameSchema,
    motionProfile: MotionProfileSchema,
    artDirection: ArtDirectionSchema,
    backgroundMotion: BackgroundMotionSchema,
    transitionStyle: z.string().min(1),
    typography: TypographySchema,
  }),
  audioDirection: z.object({
    music: MusicDirectionSchema,
    narration: NarrationDirectionSchema,
    duckMusicUnderNarration: z.boolean(),
  }),
  warnings: z.array(z.string()),
}).superRefine((plan, context) => {
  let cursor = 0;
  for (let index = 0; index < plan.scenes.length; index += 1) {
    const scene = plan.scenes[index];
    if (!scene) continue;
    if (scene.order !== index) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['scenes', index, 'order'], message: `scene order must be ${index}` });
    }
    if (Math.abs(scene.startSec - cursor) > 0.001) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['scenes', index, 'startSec'], message: `scene must start at ${cursor}` });
    }
    cursor += scene.durationSec;
  }
  if (plan.scenes.at(-1)?.role !== 'cta') {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['scenes'], message: 'the final render scene must be a cta scene' });
  }
  if (Math.abs(cursor - plan.durationSec) > 0.001) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['durationSec'], message: `scene timeline (${cursor}) must equal durationSec (${plan.durationSec})` });
  }
});
export type CommercialRenderPlan = z.infer<typeof CommercialRenderPlanSchema>;

export function validateRenderPlan(candidate: unknown): ValidationResult<CommercialRenderPlan> {
  const result = CommercialRenderPlanSchema.safeParse(candidate);
  if (result.success) return { ok: true, value: result.data, errors: [] };
  return {
    ok: false,
    errors: result.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`),
  };
}

export function serializeRenderPlan(plan: CommercialRenderPlan): string {
  return canonicalStringify(CommercialRenderPlanSchema.parse(plan));
}
