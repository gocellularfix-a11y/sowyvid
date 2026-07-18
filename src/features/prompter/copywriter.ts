import type {
  ProductIdentity,
  SalesAngle,
  SceneRole,
  MediaPlan,
  Locale,
} from '@shared/domain/commercialPlan'
import type { ResolvedFacts } from './factResolver'
import { factValue } from './factResolver'

/**
 * NarrationWriter + OverlayCopyWriter — deterministic, fact-safe copy. Claims
 * only ever use claimable owner facts (`factValue`); anything else is generic
 * positioning. The full product name appears ONCE (the solution scene) so the
 * commercial never machine-guns the model number.
 *
 * Spanish is natural, informal "tú", concise; English is plain local-business
 * language. Every spoken line is short enough to speak within its scene.
 */

export interface PlannedScene {
  id: string
  role: SceneRole
  visualPurpose: string
  spoken: string
  overlay: string
  overlayRole: 'headline' | 'subtitle' | 'offer' | 'cta' | 'business-name'
  durationSec: number
  sourceFactKeys: string[]
  mediaPlan: MediaPlan
  localMediaInstruction: string | null
  generationReason: string | null
}

const T = {
  es: {
    hook: {
      value: '¿Buscas un buen teléfono sin gastar de más?',
      affordability: '¿Quieres cambiar de teléfono sin que te duela el bolsillo?',
      limited_offer: 'Aprovecha antes de que se acabe.',
      same_day_service: '¿Lo necesitas hoy mismo?',
      convenience: '¿Listo para estrenar teléfono?',
      reliability: 'Un teléfono en el que puedes confiar.',
      premium: 'Dale un upgrade a tu día.',
      product_feature: 'Justo lo que necesitas, sin complicaciones.',
      upgrade: 'Es momento de mejorar tu teléfono.',
      problem_solution: 'Deja atrás ese teléfono lento.',
    } as Record<SalesAngle, string>,
    need: 'Sabemos que quieres algo que funcione y te dure.',
    solutionIntro: (name: string) => `Te presentamos el ${name}.`,
    trust: (store: string | null) => (store ? `Con la confianza de ${store}.` : 'Con la confianza que mereces.'),
    ctaWith: (store: string | null) => (store ? `Ven hoy a ${store}.` : 'Ven hoy y pregúntanos.'),
    itPronoun: 'Este equipo',
    genericBenefit: (a: string) => a,
    offerLead: 'Llévatelo',
  },
  en: {
    hook: {
      value: 'Looking for a solid phone without overspending?',
      affordability: 'Want a new phone without breaking the bank?',
      limited_offer: 'Grab it before it is gone.',
      same_day_service: 'Need it today?',
      convenience: 'Ready for a new phone?',
      reliability: 'A phone you can count on.',
      premium: 'Give your day an upgrade.',
      product_feature: 'Exactly what you need, no fuss.',
      upgrade: 'Time to upgrade your phone.',
      problem_solution: 'Leave that slow phone behind.',
    } as Record<SalesAngle, string>,
    need: 'You want something that just works and lasts.',
    solutionIntro: (name: string) => `Meet the ${name}.`,
    trust: (store: string | null) => (store ? `Backed by ${store}.` : 'Backed by service you can trust.'),
    ctaWith: (store: string | null) => (store ? `Come by ${store} today.` : 'Come by today and ask us.'),
    itPronoun: 'This one',
    genericBenefit: (a: string) => a,
    offerLead: 'Get it',
  },
}

const SEC = { hook: 2.5, need: 2.5, solution: 3, benefit: 3, offer: 3.5, trust: 2.5, cta: 3 }

/** Build the ordered scene plan. Fact-safe: only claimable facts become claims. */
export function planScenes(
  product: ProductIdentity,
  angle: SalesAngle,
  facts: ResolvedFacts,
  locale: Locale,
): PlannedScene[] {
  const t = T[locale]
  const known = facts.knownFacts
  const store = factValue(known, 'store')
  const price = factValue(known, 'price')
  const storage = factValue(known, 'storage')
  const condition = factValue(known, 'condition')
  const accessories = factValue(known, 'accessories')
  const availability = factValue(known, 'availability')

  const scenes: PlannedScene[] = []
  // Role-STABLE ids: a fact change that keeps a scene keeps its id, so the
  // owner's manual text-layout overrides (keyed by sceneId + role) survive
  // regeneration. Only a scene that disappears drops its overrides.
  let benefitIdx = 0
  const id = (role: SceneRole): string => (role === 'benefit' ? `plan_benefit_${benefitIdx++}` : `plan_${role}`)

  // 1. Hook — generic, never a spec claim.
  scenes.push({
    id: id('hook'), role: 'hook', visualPurpose: locale === 'es' ? 'Llamar la atención' : 'Grab attention',
    spoken: t.hook[angle], overlay: t.hook[angle], overlayRole: 'headline', durationSec: SEC.hook,
    sourceFactKeys: [], mediaPlan: 'owner-photo',
    localMediaInstruction: locale === 'es' ? 'Foto llamativa de tu negocio o del producto' : 'An eye-catching photo of your shop or product',
    generationReason: null,
  })

  // 2. Need / context — generic.
  scenes.push({
    id: id('need'), role: 'need', visualPurpose: locale === 'es' ? 'Conectar con el cliente' : 'Connect with the customer',
    spoken: t.need, overlay: locale === 'es' ? 'Lo que necesitas' : 'What you need', overlayRole: 'subtitle', durationSec: SEC.need,
    sourceFactKeys: [], mediaPlan: 'owner-photo',
    localMediaInstruction: locale === 'es' ? 'Foto de una persona usando el teléfono' : 'A photo of someone using the phone',
    generationReason: null,
  })

  // 3. Solution — the ONE place the full product name is spoken.
  scenes.push({
    id: id('solution'), role: 'solution', visualPurpose: locale === 'es' ? 'Presentar el producto' : 'Introduce the product',
    spoken: t.solutionIntro(product.displayName), overlay: product.displayName, overlayRole: 'headline', durationSec: SEC.solution,
    sourceFactKeys: [], mediaPlan: 'generated-video',
    localMediaInstruction: null,
    generationReason: locale === 'es'
      ? 'Un clip corto muestra el producto con movimiento sutil, difícil de lograr con una sola foto'
      : 'A short clip shows the product with subtle motion that a single photo cannot',
  })

  // 4. Benefits — up to two, from claimable facts, else generic positioning.
  const benefitLines: Array<{ spoken: string; overlay: string; keys: string[] }> = []
  if (storage) benefitLines.push({ spoken: locale === 'es' ? `${storage} de espacio para todo lo tuyo.` : `${storage} of space for all your stuff.`, overlay: storage, keys: ['storage'] })
  if (condition) benefitLines.push({ spoken: locale === 'es' ? `${condition}, listo para estrenar.` : `${condition}, ready to go.`, overlay: condition, keys: ['condition'] })
  while (benefitLines.length < 2 && facts.assumptions.length > 0) {
    const a = facts.assumptions[benefitLines.length % facts.assumptions.length]!
    benefitLines.push({ spoken: `${a}.`, overlay: a, keys: [] })
  }
  for (const b of benefitLines.slice(0, 2)) {
    scenes.push({
      id: id('benefit'), role: 'benefit', visualPurpose: locale === 'es' ? 'Mostrar un beneficio' : 'Show a benefit',
      spoken: b.spoken, overlay: b.overlay, overlayRole: 'subtitle', durationSec: SEC.benefit,
      sourceFactKeys: b.keys, mediaPlan: 'owner-photo',
      localMediaInstruction: locale === 'es' ? 'Foto que resalte ese beneficio' : 'A photo that highlights this benefit',
      generationReason: null,
    })
  }

  // 5. Offer / availability — only from claimable facts.
  const offerBits: string[] = []
  const offerKeys: string[] = []
  if (price) { offerBits.push(`${t.offerLead} ${locale === 'es' ? 'por' : 'for'} ${price}`); offerKeys.push('price') }
  if (accessories) { offerBits.push(locale === 'es' ? `incluye ${accessories}` : `includes ${accessories}`); offerKeys.push('accessories') }
  if (availability) { offerBits.push(availability.toLowerCase()); offerKeys.push('availability') }
  if (offerBits.length > 0) {
    const spoken = offerBits.join(locale === 'es' ? ', ' : ', ') + '.'
    scenes.push({
      id: id('offer'), role: 'offer', visualPurpose: locale === 'es' ? 'Presentar la oferta' : 'Present the offer',
      spoken: spoken.charAt(0).toUpperCase() + spoken.slice(1), overlay: [price, accessories && `+ ${accessories}`].filter(Boolean).join(' '),
      overlayRole: 'offer', durationSec: SEC.offer, sourceFactKeys: offerKeys, mediaPlan: 'text-only',
      localMediaInstruction: null, generationReason: null,
    })
  }

  // 6. Trust.
  scenes.push({
    id: id('trust'), role: 'trust', visualPurpose: locale === 'es' ? 'Generar confianza' : 'Build trust',
    spoken: t.trust(store), overlay: store ?? (locale === 'es' ? 'Confianza' : 'Trusted'), overlayRole: 'business-name', durationSec: SEC.trust,
    sourceFactKeys: store ? ['store'] : [], mediaPlan: 'owner-photo',
    localMediaInstruction: locale === 'es' ? 'Foto de tu negocio o logo' : 'A photo of your shop or logo',
    generationReason: null,
  })

  // 7. CTA.
  scenes.push({
    id: id('cta'), role: 'cta', visualPurpose: locale === 'es' ? 'Invitar a la acción' : 'Call to action',
    spoken: t.ctaWith(store), overlay: store ? (locale === 'es' ? `Ven a ${store}` : `Visit ${store}`) : (locale === 'es' ? 'Ven hoy' : 'Come today'),
    overlayRole: 'cta', durationSec: SEC.cta, sourceFactKeys: store ? ['store'] : [], mediaPlan: 'owner-photo',
    localMediaInstruction: locale === 'es' ? 'Foto de la entrada de tu negocio' : 'A photo of your storefront',
    generationReason: null,
  })

  return scenes
}
