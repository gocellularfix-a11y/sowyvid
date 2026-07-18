import type { DetectedIntent, ProductFact, SalesAngle } from '@shared/domain/commercialPlan'
import { hasClaimableFact } from './factResolver'

/**
 * SalesAngleSelector — picks a safe angle deterministically. Never selects a
 * price or promotion angle (`affordability` / `limited_offer`) unless the owner
 * actually supplied a price or a promotion; the validator enforces this too.
 */
export function selectSalesAngle(intent: DetectedIntent, knownFacts: readonly ProductFact[]): SalesAngle {
  const has = (k: string): boolean => hasClaimableFact(knownFacts, k)

  if (has('promotion')) return 'limited_offer'
  if (intent.objective === 'same-day-service') return 'same_day_service'
  if (has('availability')) return 'convenience'
  if (has('price')) return 'affordability' // price supplied → an affordability angle is honest
  if (intent.objective === 'upgrade') return 'upgrade'
  if (has('condition')) return 'reliability'
  return 'convenience' // safe generic default without any price/promotion
}

/** Angles that require a price / a promotion to be honest. */
export const PRICE_ANGLES: ReadonlySet<SalesAngle> = new Set<SalesAngle>(['affordability'])
export const PROMO_ANGLES: ReadonlySet<SalesAngle> = new Set<SalesAngle>(['limited_offer'])
