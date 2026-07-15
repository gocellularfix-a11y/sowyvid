import type { CommercialBrief } from '@shared/domain/project'
import type { PromotionObjective } from '@shared/domain/enums'
import type { TextLimits } from '@shared/domain/template'
import type { TextRole } from '@shared/domain/scenePlan'

/** Sensible Spanish default headlines per objective when the owner leaves it blank. */
const OBJECTIVE_HEADLINE: Record<PromotionObjective, string> = {
  'product-promotion': 'Descubre lo que tenemos para ti',
  'limited-time-sale': 'Oferta por tiempo limitado',
  'local-service': 'Servicio en el que puedes confiar',
  'restaurant-food': 'Sabor que vas a querer repetir',
  'phone-electronics': 'Tecnología en la que puedes confiar',
  'event-announcement': 'No te lo puedes perder',
  'new-arrival': 'Nuevo, ya disponible',
  testimonial: 'Lo que dicen nuestros clientes',
  'before-after': 'Mira la diferencia',
  'business-introduction': 'Con gusto te atendemos',
}

const DEFAULT_CTA = 'Visítanos hoy'

/** Deterministic truncation that respects a max length, adding an ellipsis. */
export function clampText(text: string, max: number): string {
  const trimmed = text.trim()
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, Math.max(1, max - 1)).trimEnd()}…`
}

/**
 * Resolve the text for a scene text role from the brief, or null when there is
 * nothing meaningful to show (so the layer is omitted rather than left blank).
 * Pure and deterministic.
 */
export function textForRole(
  role: TextRole,
  brief: CommercialBrief,
  limits: TextLimits,
): string | null {
  switch (role) {
    case 'headline': {
      const base =
        brief.productOrService.trim() ||
        brief.businessName.trim() ||
        OBJECTIVE_HEADLINE[brief.objective]
      return clampText(base, limits.headlineMaxChars)
    }
    case 'subhead': {
      const s = brief.supportingDetails.trim()
      return s ? clampText(s, limits.subheadMaxChars) : null
    }
    case 'offer': {
      const s = brief.offer.trim()
      return s ? clampText(s, limits.offerMaxChars) : null
    }
    case 'price': {
      const s = brief.price.trim()
      return s ? clampText(s, limits.offerMaxChars) : null
    }
    case 'cta': {
      const s = brief.callToAction.trim() || DEFAULT_CTA
      return clampText(s, limits.ctaMaxChars)
    }
    case 'business-name': {
      const s = brief.businessName.trim()
      return s ? clampText(s, limits.headlineMaxChars) : null
    }
    default:
      return null
  }
}

const ROLE_EMPHASIS: Record<TextRole, number> = {
  headline: 1.4,
  subhead: 0.9,
  offer: 1.2,
  price: 1.3,
  cta: 1.1,
  'business-name': 1,
}

export function emphasisForRole(role: TextRole): number {
  return ROLE_EMPHASIS[role]
}
