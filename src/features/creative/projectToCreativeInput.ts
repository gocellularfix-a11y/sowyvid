import type { Project } from '@shared/domain/project'
import type { PromotionObjective, AspectRatio } from '@shared/domain/enums'
import type { DirectorInput, CommercialContent, CampaignObjective, PlatformIntent } from '@jorge-engines/northstar-creative'
import { toEngineMedia } from './mediaAdapter'

/**
 * ProjectToCreativeInputAdapter — the ONE place where SowyVid's UI/DB wording is
 * normalized into the engine's neutral input contract. No SowyVid enum slug or
 * database column name leaks past this boundary into the engine core.
 */

const OBJECTIVE_MAP: Record<PromotionObjective, CampaignObjective> = {
  'product-promotion': 'drive_action',
  'limited-time-sale': 'drive_action',
  'local-service': 'build_trust',
  'restaurant-food': 'stop_scroll',
  'phone-electronics': 'drive_action',
  'event-announcement': 'announce',
  'new-arrival': 'announce',
  testimonial: 'build_trust',
  'before-after': 'show_transformation',
  'business-introduction': 'build_trust',
}

const PLATFORM_INTENT_MAP: Record<AspectRatio, PlatformIntent> = {
  '9:16': 'vertical_social',
  '4:5': 'portrait_video',
  '1:1': 'square_social',
  '16:9': 'landscape_video',
}

/** SowyVid is a Spanish-first product; locale defaults to Spanish. */
const DEFAULT_LOCALE = 'es' as const

function firstNonEmpty(...values: string[]): string {
  for (const v of values) {
    const t = v.trim()
    if (t) return t
  }
  return ''
}

function splitDetails(text: string): string[] {
  return text
    .split(/[\n.]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

/** Neutral engine input for concept development. */
export function projectToDirectorInput(project: Project): DirectorInput {
  const { brief } = project
  const productOrService = firstNonEmpty(brief.productOrService, brief.businessName, 'nuestro producto')
  const businessName = firstNonEmpty(brief.businessName, brief.productOrService, 'Nuestro negocio')
  const offer = brief.offer.trim() || undefined
  const notes = brief.supportingDetails.trim() || undefined

  return {
    businessName,
    productOrService,
    ...(offer ? { offer } : {}),
    ...(notes ? { notes } : {}),
    industry: brief.category,
    locale: DEFAULT_LOCALE,
    objective: OBJECTIVE_MAP[brief.objective],
    platformIntent: PLATFORM_INTENT_MAP[project.video.aspectRatio],
    requestedDurationSec: project.video.targetDurationSec,
    media: toEngineMedia(project.media),
  }
}

/** Neutral engine content for compilation (copy source). */
export function projectToContent(project: Project): CommercialContent {
  const { brief } = project
  const productOrService = firstNonEmpty(brief.productOrService, brief.businessName, 'nuestro producto')
  const businessName = firstNonEmpty(brief.businessName, brief.productOrService, 'Nuestro negocio')
  return {
    businessName,
    productOrService,
    ...(brief.offer.trim() ? { offer: brief.offer.trim() } : {}),
    ...(brief.price.trim() ? { price: brief.price.trim() } : {}),
    ...(brief.callToAction.trim() ? { callToAction: brief.callToAction.trim() } : {}),
    supportingDetails: splitDetails(brief.supportingDetails),
    locale: DEFAULT_LOCALE,
  }
}
