import type { CommercialRenderPlan } from '@jorge-engines/northstar-creative'
import type { Project } from '@shared/domain/project'
import { buildVisualPlan } from './frameLogicAdapter'
import type { VisualPlan } from './visualPlan'

export { buildVisualPlan } from './frameLogicAdapter'
export {
  VisualPlanSchema,
  VisualSceneSchema,
  validateVisualPlan,
  VISUAL_PLAN_VERSION,
  type VisualPlan,
  type VisualScene,
} from './visualPlan'

/** Convenience: build a project's VisualPlan from its compiled render plan. */
export function visualPlanForProject(project: Project, renderPlan: CommercialRenderPlan): VisualPlan {
  return buildVisualPlan({
    renderPlan,
    brand: project.brand,
    media: project.media,
    industry: project.brief.category,
  })
}
