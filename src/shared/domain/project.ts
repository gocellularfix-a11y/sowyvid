import { z } from 'zod'
import {
  AspectRatio,
  BusinessCategory,
  EnergyLevel,
  Platform,
  ProjectStatus,
  PromotionObjective,
} from './enums'
import { MediaAsset } from './media'

const hexColor = z
  .string()
  .regex(/^#([0-9a-fA-F]{6})$/, 'Expected a #RRGGBB color')

export const BrandPreferences = z.object({
  colors: z.array(hexColor).max(4).default([]),
  /** Media id of the logo asset, if provided. */
  logoMediaId: z.string().nullable().default(null),
})
export type BrandPreferences = z.infer<typeof BrandPreferences>

export const AudioConfig = z.object({
  musicId: z.string().nullable().default(null),
  narrationEnabled: z.boolean().default(false),
  /** Use the audio embedded in imported video clips. */
  useSourceAudio: z.boolean().default(false),
  musicVolume: z.number().min(0).max(1).default(0.8),
  narrationVolume: z.number().min(0).max(1).default(1),
})
export type AudioConfig = z.infer<typeof AudioConfig>

export const VideoConfig = z.object({
  aspectRatio: AspectRatio.default('9:16'),
  targetDurationSec: z.number().min(5).max(60).default(20),
  energy: EnergyLevel.default('balanced'),
})
export type VideoConfig = z.infer<typeof VideoConfig>

export const RenderConfig = z.object({
  platform: Platform.default('instagram-reel'),
  /** Long-edge resolution in pixels. */
  resolution: z.number().int().positive().default(1920),
})
export type RenderConfig = z.infer<typeof RenderConfig>

/** The owner's simple business inputs — the only required creative decisions. */
export const CommercialBrief = z.object({
  businessName: z.string().default(''),
  category: BusinessCategory.default('other'),
  objective: PromotionObjective.default('product-promotion'),
  productOrService: z.string().default(''),
  offer: z.string().default(''),
  price: z.string().default(''),
  supportingDetails: z.string().default(''),
  callToAction: z.string().default(''),
})
export type CommercialBrief = z.infer<typeof CommercialBrief>

/**
 * The complete persisted project. Survives restart; validated with Zod at every
 * boundary. `ruleEngineVersion` + `templateVersion` are stored so a generated
 * plan stays reproducible even after the engine/template evolve.
 */
export const Project = z.object({
  id: z.string(),
  name: z.string().min(1),
  brief: CommercialBrief,
  brand: BrandPreferences,
  video: VideoConfig,
  audio: AudioConfig,
  render: RenderConfig,
  targetPlatform: Platform.default('instagram-reel'),
  templateId: z.string().nullable().default(null),
  templateVersion: z.number().int().positive().nullable().default(null),
  ruleEngineVersion: z.number().int().positive().nullable().default(null),
  media: z.array(MediaAsset).default([]),
  status: ProjectStatus.default('draft'),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
export type Project = z.infer<typeof Project>

/** Input accepted when creating a project — the rest is defaulted. */
export const CreateProjectInput = z.object({
  name: z.string().min(1).max(120),
  brief: CommercialBrief.partial().optional(),
})
export type CreateProjectInput = z.infer<typeof CreateProjectInput>

/** A saved version snapshot for undo / compare (see §5 version history). */
export const ProjectVersion = z.object({
  id: z.string(),
  projectId: z.string(),
  label: z.string(),
  createdAt: z.string().datetime(),
  /** Full project snapshot at save time. */
  snapshot: Project,
})
export type ProjectVersion = z.infer<typeof ProjectVersion>
