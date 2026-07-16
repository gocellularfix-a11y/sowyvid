import { z } from 'zod'

/**
 * SowyVid VisualPlan — the validated, renderer-neutral contract that combines
 * Northstar's timeline/copy/media with FrameLogic's visual direction. It carries
 * everything a renderer needs to draw predictable frames, WITHOUT any
 * Remotion-specific types (those live in the SowyVid Remotion adapter).
 *
 * Responsibilities stay separate (see docs/FRAMELOGIC-INTEGRATION.md):
 *   Northstar = what the commercial says + order
 *   FrameLogic = how each scene looks + moves
 *   Renderer   = how the plan becomes frames
 */

export const VISUAL_PLAN_VERSION = 1 as const

const MotionProfileSchema = z.object({
  name: z.string(),
  cameraTravel: z.number(),
  zoomStart: z.number(),
  zoomEnd: z.number(),
  transitionFrames: z.number().int().nonnegative(),
  springDamping: z.number(),
  springStiffness: z.number(),
  textDelayFrames: z.number().int().nonnegative(),
  maxRotationDeg: z.number(),
})

const ArtDirectionSchema = z.object({
  name: z.string(),
  motionProfile: z.string(),
  palette: z.object({
    backgroundDepth: z.number(),
    glow: z.number(),
    hueShiftDeg: z.number(),
    saturation: z.number(),
    vignette: z.number(),
  }),
  transitionIntensity: z.number(),
  contentScale: z.number(),
})

const TextFrameSchema = z.object({
  justifyContent: z.enum(['flex-start', 'center', 'flex-end']),
  alignItems: z.enum(['flex-start', 'center', 'flex-end']),
  textAlign: z.enum(['left', 'center', 'right']),
  maxWidth: z.number().int().positive(),
  paddingTop: z.number().int().nonnegative(),
  paddingRight: z.number().int().nonnegative(),
  paddingBottom: z.number().int().nonnegative(),
  paddingLeft: z.number().int().nonnegative(),
  translateYPercent: z.number(),
  cardTreatment: z.enum(['none', 'frame', 'panel']),
})

const SceneCopySchema = z.object({
  kicker: z.string(),
  headline: z.string(),
  body: z.string(),
  caption: z.string(),
  spokenText: z.string(),
})

export const VisualSceneSchema = z.object({
  id: z.string().min(1),
  order: z.number().int().nonnegative(),
  role: z.string().min(1),
  beatPurpose: z.string().min(1),
  startFrame: z.number().int().nonnegative(),
  durationInFrames: z.number().int().positive(),
  transitionIn: z.string(),
  transitionFrames: z.number().int().nonnegative(),
  media: z.array(z.object({ slotRole: z.string(), assetId: z.string() })),
  /** How assigned media fills the frame. */
  mediaFit: z.enum(['cover', 'contain']),
  /** FrameLogic layout treatment (null for text/color-only scenes). */
  placement: z
    .enum(['full', 'framed-hero', 'side-panel', 'floating-card', 'masked'])
    .nullable(),
  crop: z.enum(['center', 'top', 'bottom']).nullable(),
  focal: z.enum(['center', 'top', 'bottom']),
  shotBehavior: z.string(),
  motion: z.string(),
  grade: z
    .object({
      style: z.string(),
      filter: z.string(),
      multiply: z.number(),
      accent: z.number(),
      vignette: z.number(),
    })
    .nullable(),
  textFrame: TextFrameSchema,
  copy: SceneCopySchema,
  emphasis: z.string(),
  /** Background behavior when media is absent. */
  background: z.enum(['media', 'brand-gradient', 'brand-solid', 'dark']),
})
export type VisualScene = z.infer<typeof VisualSceneSchema>

export const VisualPlanSchema = z
  .object({
    version: z.literal(VISUAL_PLAN_VERSION),
    visualEngineName: z.string().min(1),
    visualEngineVersion: z.string().min(1),
    visualProfileVersion: z.number().int().positive(),
    projectId: z.string().min(1),
    conceptId: z.string().min(1),
    aspectRatio: z.string(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    fps: z.number().int().positive(),
    totalDurationInFrames: z.number().int().positive(),
    artDirection: ArtDirectionSchema,
    motion: MotionProfileSchema,
    brandColors: z.array(z.string()),
    scenes: z.array(VisualSceneSchema).min(1),
  })
  .superRefine((plan, ctx) => {
    let cursor = 0
    plan.scenes.forEach((scene, i) => {
      if (scene.order !== i) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['scenes', i, 'order'], message: `order must be ${i}` })
      }
      if (scene.startFrame !== cursor) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['scenes', i, 'startFrame'], message: `startFrame must be ${cursor}` })
      }
      cursor += scene.durationInFrames
    })
    if (plan.scenes.at(-1)?.role !== 'cta') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['scenes'], message: 'final scene must be a cta scene' })
    }
    if (cursor !== plan.totalDurationInFrames) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['totalDurationInFrames'], message: `timeline (${cursor}) must equal totalDurationInFrames` })
    }
  })
export type VisualPlan = z.infer<typeof VisualPlanSchema>

export function validateVisualPlan(candidate: unknown): { ok: boolean; errors: string[] } {
  const result = VisualPlanSchema.safeParse(candidate)
  return result.success
    ? { ok: true, errors: [] }
    : { ok: false, errors: result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`) }
}
