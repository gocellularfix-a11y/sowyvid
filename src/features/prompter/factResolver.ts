import type {
  DetectedIntent,
  ProductFact,
  MissingFact,
  Locale,
} from '@shared/domain/commercialPlan'

/**
 * ProductFactResolver — decides what is KNOWN (claimable) versus MISSING, and
 * offers only GENERIC, non-technical positioning as assumptions. It never turns
 * a guess into a product claim: model memory is not a source of facts here.
 *
 * Owner facts always win: they arrive as `owner_provided` and are returned
 * verbatim. Inventory/verified-catalog facts would merge here too (none wired
 * this session), and would never override an owner fact for the same key.
 */

/** Beneficial fact keys per category — the ones a commercial usually wants. */
const BENEFICIAL_FACTS: Record<string, Array<{ key: string; importance: MissingFact['importance'] }>> = {
  phone: [
    { key: 'price', importance: 'high' },
    { key: 'storage', importance: 'medium' },
    { key: 'condition', importance: 'medium' },
    { key: 'color', importance: 'low' },
    { key: 'promotion', importance: 'low' },
    { key: 'accessories', importance: 'low' },
    { key: 'availability', importance: 'medium' },
    { key: 'financing', importance: 'low' },
  ],
  electronics: [
    { key: 'price', importance: 'high' },
    { key: 'condition', importance: 'medium' },
    { key: 'promotion', importance: 'low' },
    { key: 'availability', importance: 'medium' },
  ],
  service: [
    { key: 'price', importance: 'high' },
    { key: 'availability', importance: 'high' },
    { key: 'promotion', importance: 'low' },
  ],
  default: [
    { key: 'price', importance: 'high' },
    { key: 'availability', importance: 'medium' },
    { key: 'promotion', importance: 'low' },
  ],
}

const MISSING_PROMPTS: Record<string, { es: string; en: string; label: { es: string; en: string } }> = {
  price: { es: '¿Cuál es el precio?', en: 'What is the price?', label: { es: 'Precio', en: 'Price' } },
  storage: { es: '¿Cuánto almacenamiento?', en: 'How much storage?', label: { es: 'Almacenamiento', en: 'Storage' } },
  condition: { es: '¿Nuevo o usado?', en: 'New or used?', label: { es: 'Nuevo o usado', en: 'Condition' } },
  color: { es: '¿Qué colores hay?', en: 'Which colors?', label: { es: 'Colores', en: 'Colors' } },
  promotion: { es: '¿Hay alguna promoción?', en: 'Any promotion?', label: { es: 'Promoción', en: 'Promotion' } },
  accessories: { es: '¿Incluye accesorios?', en: 'Any accessories included?', label: { es: 'Accesorios incluidos', en: 'Included accessories' } },
  availability: { es: '¿Disponible cuándo?', en: 'When is it available?', label: { es: 'Disponibilidad', en: 'Availability' } },
  financing: { es: '¿Ofreces financiamiento?', en: 'Do you offer financing?', label: { es: 'Financiamiento', en: 'Financing' } },
}

/** GENERIC positioning only — never a technical or spec claim. */
const GENERIC_ASSUMPTIONS: Record<string, { es: string[]; en: string[] }> = {
  phone: {
    es: ['Una opción práctica para el día a día', 'Presentación moderna', 'Buena alternativa para quienes buscan cambiar de teléfono'],
    en: ['A practical everyday option', 'Modern presentation', 'A convenient choice for an upgrade'],
  },
  default: {
    es: ['Una opción conveniente', 'Presentación clara y directa'],
    en: ['A convenient choice', 'A clear, direct presentation'],
  },
}

export interface ResolvedFacts {
  knownFacts: ProductFact[]
  missingFacts: MissingFact[]
  assumptions: string[]
}

export function resolveFacts(
  intent: DetectedIntent,
  ownerFacts: readonly ProductFact[],
  locale: Locale,
): ResolvedFacts {
  // Owner facts win; keep them exactly. (Inventory/catalog merges would go here,
  // never replacing an owner fact for the same key.)
  const knownByKey = new Map<string, ProductFact>()
  for (const f of ownerFacts) knownByKey.set(f.key, f)
  const knownFacts = [...knownByKey.values()]

  const beneficial = BENEFICIAL_FACTS[intent.product.category] ?? BENEFICIAL_FACTS.default!
  const missingFacts: MissingFact[] = beneficial
    .filter((b) => !knownByKey.has(b.key) && MISSING_PROMPTS[b.key])
    .map((b) => {
      const p = MISSING_PROMPTS[b.key]!
      return { key: b.key, label: p.label[locale], prompt: p[locale], importance: b.importance }
    })

  const assumptions = (GENERIC_ASSUMPTIONS[intent.product.category] ?? GENERIC_ASSUMPTIONS.default!)[locale]

  return { knownFacts, missingFacts, assumptions }
}

/** True when a fact key names a claimable, owner-known value. */
export function hasClaimableFact(facts: readonly ProductFact[], key: string): boolean {
  return facts.some((f) => f.key === key && f.claimable)
}

export function factValue(facts: readonly ProductFact[], key: string): string | null {
  return facts.find((f) => f.key === key && f.claimable)?.value ?? null
}
