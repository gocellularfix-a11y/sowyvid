import type {
  CommercialPlan,
  CommercialPlanValidationResult,
  PlanViolation,
  ProductFact,
  SalesAngle,
  ValidationStatus,
} from '@shared/domain/commercialPlan'
import { hasClaimableFact, factValue } from './factResolver'
import { PRICE_ANGLES, PROMO_ANGLES } from './salesAngle'

/**
 * CommercialPlanValidator — the authoritative fact-safety gate. It rejects any
 * copy that states a technical/product claim not backed by a CLAIMABLE fact,
 * regardless of whether the deterministic engine or an AI provider wrote it.
 * The deterministic engine is built to produce zero violations; AI proposals
 * are run through here before they can ever be applied.
 */

/** Spec patterns that are ALWAYS unsupported (SowyVid has no such facts). */
const HARD_SPEC_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /\b\d{3,5}\s?mAh\b/i, label: 'battery capacity' },
  { re: /\b\d{1,3}\s?(?:mp|megapixel|megap[ií]xeles)\b/i, label: 'camera megapixels' },
  { re: /\b(snapdragon|mediatek|exynos|dimensity)\b/i, label: 'processor' },
  { re: /\b\d(?:\.\d)?\s?ghz\b/i, label: 'processor speed' },
  { re: /\b5\s?g\b/i, label: '5G' },
  { re: /\b(resistente al agua|water[- ]?resistant|ip6\d|ip5\d)\b/i, label: 'water resistance' },
  { re: /\b\d(?:\.\d)?\s?(?:pulgadas|inch|")\b/i, label: 'screen size' },
  { re: /\b\d{2,3}\s?hz\b/i, label: 'refresh rate' },
]

/** Claims allowed ONLY when a matching claimable fact carries the same value. */
function conditionalViolations(text: string, facts: readonly ProductFact[]): string[] {
  const out: string[] = []
  const gb = text.match(/\b(\d{2,4})\s?(?:gb|tb)\b/i)
  if (gb) {
    const storage = factValue(facts, 'storage')
    if (!storage || !storage.includes(gb[1]!)) out.push('storage capacity')
  }
  const price = text.match(/\$\s?(\d{2,5})\b/)
  if (price) {
    const pf = factValue(facts, 'price')
    if (!pf || !pf.includes(price[1]!)) out.push('price')
  }
  if (/\bgarant[ií]a|warranty\b/i.test(text) && !hasClaimableFact(facts, 'warranty')) out.push('warranty')
  if (/\bfinanciamiento|a meses|meses sin intereses|financing\b/i.test(text) && !hasClaimableFact(facts, 'financing')) {
    out.push('financing')
  }
  return out
}

/** Every unsupported claim in a block of text, given the claimable facts. */
export function scanUnsupportedClaims(text: string, facts: readonly ProductFact[]): string[] {
  const found = new Set<string>()
  for (const p of HARD_SPEC_PATTERNS) if (p.re.test(text)) found.add(p.label)
  for (const c of conditionalViolations(text, facts)) found.add(c)
  return [...found]
}

function statusFrom(violations: PlanViolation[], warnings: string[]): ValidationStatus {
  if (violations.length > 0) return 'invalid'
  return warnings.length > 0 ? 'valid_with_warnings' : 'valid'
}

/** Count how many scenes speak the full product name (should be ≤ 2). */
function nameRepeats(plan: Pick<CommercialPlan, 'product' | 'narrationScenes'>): number {
  const name = plan.product.displayName.toLowerCase()
  if (!name) return 0
  return plan.narrationScenes.filter((s) => s.spokenText.toLowerCase().includes(name)).length
}

export function validateCommercialPlanContent(
  plan: Pick<CommercialPlan, 'product' | 'knownFacts' | 'narrationScenes' | 'overlayCues' | 'selectedAngle' | 'cta'>,
): CommercialPlanValidationResult {
  const violations: PlanViolation[] = []
  const warnings: string[] = []
  const facts = plan.knownFacts

  // Unsupported product claims in narration/overlay.
  for (const s of plan.narrationScenes) {
    for (const label of scanUnsupportedClaims(`${s.spokenText} ${s.overlayText}`, facts)) {
      violations.push({ code: 'unsupported-claim', message: `Afirmación sin respaldo: ${label}`, sceneId: s.sceneId, factKey: null })
    }
  }
  for (const c of plan.overlayCues) {
    for (const label of scanUnsupportedClaims(c.text, facts)) {
      violations.push({ code: 'unsupported-claim', message: `Texto en pantalla sin respaldo: ${label}`, sceneId: c.sceneId, factKey: null })
    }
  }

  // Angle honesty.
  if (PRICE_ANGLES.has(plan.selectedAngle) && !hasClaimableFact(facts, 'price')) {
    violations.push({ code: 'price-angle-without-price', message: 'Enfoque de precio sin un precio confirmado.', sceneId: null, factKey: 'price' })
  }
  if (PROMO_ANGLES.has(plan.selectedAngle as SalesAngle) && !hasClaimableFact(facts, 'promotion')) {
    violations.push({ code: 'promo-angle-without-promotion', message: 'Enfoque de promoción sin una promoción confirmada.', sceneId: null, factKey: 'promotion' })
  }

  // Structure.
  if (plan.narrationScenes.length === 0 || plan.narrationScenes.every((s) => !s.spokenText.trim())) {
    violations.push({ code: 'empty-narration', message: 'La narración está vacía.', sceneId: null, factKey: null })
  }
  if (!plan.cta.trim()) {
    violations.push({ code: 'missing-cta', message: 'Falta un llamado a la acción.', sceneId: null, factKey: null })
  }

  // Scene → fact traceability: a claimed fact key must be a known claimable fact.
  for (const s of plan.narrationScenes) {
    for (const key of s.sourceFactKeys) {
      if (!hasClaimableFact(facts, key)) {
        violations.push({ code: 'fact-not-traceable', message: `Escena usa un dato no confirmado: ${key}`, sceneId: s.sceneId, factKey: key })
      }
    }
  }

  // Name over-repetition is a soft warning, not a hard failure.
  if (nameRepeats(plan) > 2) {
    warnings.push('El nombre del producto se repite demasiado.')
  }

  return { status: statusFrom(violations, warnings), violations, warnings }
}
