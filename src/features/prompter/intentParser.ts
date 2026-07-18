import type {
  CommercialRequest,
  DetectedIntent,
  ProductFact,
  ProductIdentity,
  ProductCategory,
  CommercialObjective,
} from '@shared/domain/commercialPlan'

/**
 * CommercialIntentParser — deterministic, provider-neutral extraction of the
 * product and any OWNER-STATED facts from a plain request. It never infers
 * technical specifications: it only reads back what the owner actually wrote.
 * Anything it is unsure about becomes a missing fact downstream, never a claim.
 *
 * Pure and isomorphic (no Node/AI), so the browser preview, the demo and unit
 * tests all run the same code.
 */

const PHONE_BRANDS = [
  'samsung', 'apple', 'iphone', 'motorola', 'moto', 'xiaomi', 'redmi', 'huawei',
  'lg', 'nokia', 'oppo', 'vivo', 'realme', 'google', 'pixel', 'oneplus', 'zte', 'tcl', 'honor',
]

/** Owner-facing labels per fact key, per locale. */
const FACT_LABELS: Record<string, { es: string; en: string }> = {
  price: { es: 'Precio', en: 'Price' },
  storage: { es: 'Almacenamiento', en: 'Storage' },
  condition: { es: 'Nuevo o usado', en: 'Condition' },
  color: { es: 'Colores', en: 'Colors' },
  promotion: { es: 'Promoción', en: 'Promotion' },
  accessories: { es: 'Accesorios incluidos', en: 'Included accessories' },
  availability: { es: 'Disponibilidad', en: 'Availability' },
  financing: { es: 'Financiamiento', en: 'Financing' },
  store: { es: 'Negocio', en: 'Business' },
  warranty: { es: 'Garantía', en: 'Warranty' },
}

function fact(key: string, value: string, locale: 'es' | 'en'): ProductFact {
  return {
    key,
    label: FACT_LABELS[key]?.[locale] ?? key,
    value,
    source: 'owner_provided',
    confidence: 'high',
    claimable: true,
  }
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase())
}

/** Detect the product being promoted (brand + model when present). */
export function detectProduct(text: string): ProductIdentity {
  const lower = text.toLowerCase()
  let brand = ''
  let model = ''
  let category: ProductCategory = 'other'

  for (const b of PHONE_BRANDS) {
    const idx = lower.indexOf(b)
    if (idx === -1) continue
    category = 'phone'
    brand = b === 'iphone' || b === 'pixel' || b === 'redmi' || b === 'moto' ? '' : titleCase(b)
    // A model token immediately after the brand: letters+digits like "A16", "15 Pro".
    const after = text.slice(idx + b.length).match(/^\s*([A-Za-z]?\d+[A-Za-z0-9+]*(?:\s+(?:pro|max|plus|ultra|lite|fe))?)/i)
    if (after) model = after[1]!.trim().toUpperCase()
    // iPhone/Pixel/Redmi/Moto ARE the brand+line already.
    if (b === 'iphone') { brand = 'iPhone'; }
    if (b === 'pixel') brand = 'Pixel'
    if (b === 'redmi') brand = 'Redmi'
    if (b === 'moto') brand = 'Moto'
    break
  }

  const displayName = [brand, model].filter(Boolean).join(' ').trim()
  return {
    displayName: displayName || guessGenericSubject(text),
    brand,
    model,
    variant: '',
    category,
    rawText: text.trim(),
  }
}

/** When no known product is found, use a short generic subject from the text. */
function guessGenericSubject(text: string): string {
  const m = text.match(/promocionar\s+(?:un|una|el|la|mi|mis|los|las|unos|unas)?\s*([^.,;]{2,60})/i)
  if (m) return m[1]!.trim()
  return text.trim().slice(0, 60)
}

/** Extract OWNER-STATED facts. Only what is literally present — never inferred. */
export function extractOwnerFacts(text: string, locale: 'es' | 'en'): ProductFact[] {
  const facts: ProductFact[] = []
  const lower = text.toLowerCase()

  const price = text.match(/\$\s?(\d{1,3}(?:[.,]\d{3})*(?:\.\d{1,2})?)\b|\b(\d{2,5})\s?(?:d[oó]lares|pesos|mxn|usd)\b/i)
  if (price) facts.push(fact('price', price[1] ? `$${price[1]}` : `$${price[2]}`, locale))

  const storage = text.match(/\b(\d{2,4})\s?(gb|tb)\b/i)
  if (storage) facts.push(fact('storage', `${storage[1]} ${storage[2]!.toUpperCase()}`, locale))

  if (/\b(nuevo|nueva|new|sellado|sealed)\b/i.test(text)) facts.push(fact('condition', locale === 'es' ? 'Nuevo' : 'New', locale))
  else if (/\b(usado|usada|used|seminuevo|pre-?owned)\b/i.test(text)) facts.push(fact('condition', locale === 'es' ? 'Usado' : 'Used', locale))

  // Accessories: each named accessory becomes part of the accessories fact.
  const acc: string[] = []
  if (/\b(case|funda|estuche)\b/i.test(text)) acc.push(locale === 'es' ? 'case' : 'case')
  if (/\b(vidrio|mica|cristal|screen protector|protector de pantalla)\b/i.test(text)) acc.push(locale === 'es' ? 'vidrio' : 'screen protector')
  if (/\b(cargador|charger)\b/i.test(text)) acc.push(locale === 'es' ? 'cargador' : 'charger')
  if (/\b(aud[ií]fonos|earphones|earbuds)\b/i.test(text)) acc.push(locale === 'es' ? 'audífonos' : 'earphones')
  if (acc.length > 0) facts.push(fact('accessories', acc.join(', '), locale))

  if (/\b(disponible hoy|hoy mismo|available today|en stock|in stock|disponible ahora)\b/i.test(text)) {
    facts.push(fact('availability', locale === 'es' ? 'Disponible hoy' : 'Available today', locale))
  }

  if (/\b(promoci[oó]n|oferta|descuento|rebaja|sale|%\s?off|\d+%\s?(?:de\s?)?descuento)\b/i.test(lower)) {
    const pct = text.match(/(\d{1,2})\s?%/)
    facts.push(fact('promotion', pct ? `${pct[1]}% de descuento` : (locale === 'es' ? 'En oferta' : 'On sale'), locale))
  }

  if (/\b(financiamiento|a meses|meses sin intereses|financing|installments)\b/i.test(lower)) {
    facts.push(fact('financing', locale === 'es' ? 'Financiamiento disponible' : 'Financing available', locale))
  }

  // Store: "en <Nombre>" late in the sentence (title-cased phrase). Trailing
  // punctuation is stripped so "en Go Cellular." yields exactly "Go Cellular".
  const store = text.match(/\b(?:en|at)\s+([A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑáéíóúñ'&-]*(?:\s+[A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑáéíóúñ'&-]*){0,3})/)
  if (store) facts.push(fact('store', store[1]!.trim().replace(/[.,;:]+$/, ''), locale))

  const colors = text.match(/\b(?:color(?:es)?|en color)\s+([a-záéíóúñ,\s]+?)(?:[.,;]|$)/i)
  if (colors) facts.push(fact('color', titleCase(colors[1]!.trim()), locale))

  // Deduplicate by key (first wins).
  const byKey = new Map<string, ProductFact>()
  for (const f of facts) if (!byKey.has(f.key)) byKey.set(f.key, f)
  return [...byKey.values()]
}

// Whole-word boundaries so the VERB "promocionar" never triggers a sale/promo
// objective (only the noun "promoción" / "oferta" / etc. does).
const OBJECTIVE_KEYWORDS: Array<[CommercialObjective, RegExp]> = [
  ['same-day-service', /\b(mismo d[ií]a|hoy mismo|reparaci[oó]n|servicio|same[- ]day)\b/i],
  ['limited-time-sale', /\boferta\b|\bpromoci[oó]n\b|\bdescuento\b|\bsale\b|\bliquidaci[oó]n\b|limitad/i],
  ['new-arrival', /\b(nuevo modelo|reci[eé]n lleg|new arrival|acaba de llegar)\b/i],
  ['upgrade', /\b(actualiza|upgrade|cambia tu|mejora tu)\b/i],
  ['business-introduction', /\b(conoce (?:mi|nuestro)|somos|te presentamos)\b/i],
]

function detectObjective(text: string, hasPromotion: boolean): CommercialObjective {
  for (const [obj, re] of OBJECTIVE_KEYWORDS) if (re.test(text)) return obj
  return hasPromotion ? 'limited-time-sale' : 'product-promotion'
}

/** Parse a request into a detected intent plus the owner-stated facts. */
export function parseCommercialRequest(request: CommercialRequest): {
  intent: DetectedIntent
  ownerFacts: ProductFact[]
} {
  const product = detectProduct(request.text)
  const ownerFacts = extractOwnerFacts(request.text, request.locale)
  const hasPrice = ownerFacts.some((f) => f.key === 'price')
  const hasPromotion = ownerFacts.some((f) => f.key === 'promotion')
  const hasAvailability = ownerFacts.some((f) => f.key === 'availability')
  const objective = detectObjective(request.text, hasPromotion)
  return {
    intent: { product, objective, hasPrice, hasPromotion, hasAvailability },
    ownerFacts,
  }
}
