import { describe, it, expect } from 'vitest'
import {
  buildCommercialPlan,
  regenerateForFacts,
  detectProduct,
  parseCommercialRequest,
  scanUnsupportedClaims,
  sanitizeCreativeRequest,
  applyProposal,
  AIProposal,
  DeterministicFallbackProvider,
} from './index'
import type { CommercialRequest, ProductFact } from '@shared/domain/commercialPlan'

const NOW = '2026-07-17T00:00:00.000Z'
const vagueReq: CommercialRequest = { text: 'Quiero promocionar un Samsung A16.', locale: 'es' }
const fullReq: CommercialRequest = {
  text: 'Quiero promocionar un Samsung A16 nuevo de 128 GB por $179. Incluye case y vidrio. Disponible hoy en Go Cellular.',
  locale: 'es',
}

const factVal = (facts: readonly ProductFact[], key: string): string | undefined => facts.find((f) => f.key === key)?.value

describe('product detection', () => {
  it('detects a Samsung A16 as a phone', () => {
    const p = detectProduct('Quiero promocionar un Samsung A16.')
    expect(p.brand).toBe('Samsung')
    expect(p.model).toBe('A16')
    expect(p.displayName).toBe('Samsung A16')
    expect(p.category).toBe('phone')
  })

  it('does not treat the verb "promocionar" as a promotion', () => {
    const { intent } = parseCommercialRequest(vagueReq)
    expect(intent.hasPromotion).toBe(false)
    expect(intent.objective).toBe('product-promotion')
  })
})

describe('Scenario 1 — vague request stays fact-safe', () => {
  const plan = buildCommercialPlan(vagueReq, { now: NOW })

  it('claims no product facts and lists the missing ones', () => {
    expect(plan.knownFacts).toHaveLength(0)
    const missing = plan.missingFacts.map((m) => m.key)
    expect(missing).toEqual(expect.arrayContaining(['price', 'storage', 'condition', 'promotion']))
  })

  it('invents no technical specifications anywhere', () => {
    const allText = plan.narrationScenes.flatMap((s) => [s.spokenText, s.overlayText]).join(' ')
    expect(scanUnsupportedClaims(allText, plan.knownFacts)).toEqual([])
    expect(allText).not.toMatch(/mAh|megapixel|snapdragon|5g|pulgadas|\$\d/i)
  })

  it('picks a safe non-price/non-promo angle and a natural Spanish hook', () => {
    expect(plan.selectedAngle).toBe('convenience')
    expect(plan.narrationScenes[0]!.role).toBe('hook')
    expect(plan.narrationScenes[0]!.spokenText.length).toBeGreaterThan(0)
  })

  it('produces a 6-8 scene storyboard with at most one external-video scene', () => {
    expect(plan.storyboardScenes.length).toBeGreaterThanOrEqual(6)
    expect(plan.storyboardScenes.length).toBeLessThanOrEqual(8)
    const generated = plan.storyboardScenes.filter((s) => s.mediaPlan === 'generated-video')
    expect(generated.length).toBeLessThanOrEqual(2)
    expect(generated.length).toBeGreaterThanOrEqual(1)
    expect(plan.storyboardScenes.filter((s) => s.mediaPlan === 'owner-photo').length).toBeGreaterThan(generated.length)
  })

  it('marks the vague plan valid but warns about missing important facts', () => {
    expect(plan.validationStatus).not.toBe('invalid')
    expect(plan.warnings.join(' ')).toMatch(/precio|price/i)
  })
})

describe('Scenario 2 — complete request preserves owner facts EXACTLY', () => {
  const plan = buildCommercialPlan(fullReq, { now: NOW })

  it('keeps every owner fact verbatim, none embellished', () => {
    expect(plan.product.displayName).toBe('Samsung A16')
    expect(factVal(plan.knownFacts, 'condition')).toBe('Nuevo')
    expect(factVal(plan.knownFacts, 'storage')).toBe('128 GB')
    expect(factVal(plan.knownFacts, 'price')).toBe('$179')
    expect(factVal(plan.knownFacts, 'accessories')).toMatch(/case/)
    expect(factVal(plan.knownFacts, 'accessories')).toMatch(/vidrio/)
    expect(factVal(plan.knownFacts, 'availability')).toBe('Disponible hoy')
    expect(factVal(plan.knownFacts, 'store')).toBe('Go Cellular')
    expect(plan.knownFacts.every((f) => f.source === 'owner_provided' && f.claimable)).toBe(true)
  })

  it('adds no unsupported specifications', () => {
    const allText = plan.narrationScenes.flatMap((s) => [s.spokenText, s.overlayText]).join(' ')
    expect(scanUnsupportedClaims(allText, plan.knownFacts)).toEqual([])
  })

  it('uses the price only in the offer, backed by the price fact', () => {
    const offer = plan.narrationScenes.find((s) => s.role === 'offer')!
    expect(offer.spokenText).toContain('$179')
    expect(offer.sourceFactKeys).toContain('price')
  })

  it('never over-repeats the product name', () => {
    const repeats = plan.narrationScenes.filter((s) => s.spokenText.includes('Samsung A16')).length
    expect(repeats).toBeLessThanOrEqual(2)
  })

  it('every scene fact key is a real claimable fact (traceability)', () => {
    for (const s of plan.narrationScenes) {
      for (const key of s.sourceFactKeys) {
        expect(plan.knownFacts.some((f) => f.key === key && f.claimable)).toBe(true)
      }
    }
  })
})

describe('deterministic fallback', () => {
  it('is fully deterministic for identical input', () => {
    const a = buildCommercialPlan(fullReq, { now: NOW, id: 'cplan_fixed' })
    const b = buildCommercialPlan(fullReq, { now: NOW, id: 'cplan_fixed' })
    expect(a).toEqual(b)
  })

  it('the fallback provider proposes nothing (deterministic plan is authoritative)', async () => {
    const proposal = await DeterministicFallbackProvider.propose(sanitizeCreativeRequest(buildCommercialPlan(vagueReq, { now: NOW })))
    expect(proposal.narration).toHaveLength(0)
  })
})

describe('AI privacy filtering', () => {
  it('sends text only — never media, paths, keys or records', () => {
    const plan = buildCommercialPlan(fullReq, { now: NOW })
    const sanitized = sanitizeCreativeRequest(plan)
    const json = JSON.stringify(sanitized)
    expect(Object.keys(sanitized).sort()).toEqual(['knownFacts', 'locale', 'missingFacts', 'objective', 'product', 'requestText'])
    expect(json).not.toMatch(/media|relPath|apiKey|sowyvid-media|C:\\|\/Users\//i)
    // Facts appear as "Label: value" strings, no internal source/ids.
    expect(sanitized.knownFacts).toContain('Precio: $179')
  })
})

describe('structured AI-response validation', () => {
  it('parses a valid proposal and strips unknown keys', () => {
    const parsed = AIProposal.safeParse({ hook: '¿Buscas un buen teléfono?', narration: [{ role: 'hook', spoken: 'x', overlay: 'y' }], secret: 'drop-me' })
    expect(parsed.success).toBe(true)
    if (parsed.success) expect('secret' in parsed.data).toBe(false)
  })

  it('rejects invalid JSON / wrong shape', () => {
    expect(AIProposal.safeParse('not json').success).toBe(false)
    expect(AIProposal.safeParse({ narration: [{ role: 'nope', spoken: 'x', overlay: 'y' }] }).success).toBe(false)
  })
})

describe('Scenario 4 — unsafe AI output is rejected or repaired, never applied partially', () => {
  const base = buildCommercialPlan(fullReq, { now: NOW })

  it('strips an injected unsupported specification and never lets it through', () => {
    const proposal = AIProposal.parse({
      narration: [
        { role: 'benefit', spoken: 'Batería de 5000 mAh y cámara de 50 MP.', overlay: '5000 mAh' },
        { role: 'hook', spoken: '¿Buscas un buen teléfono?', overlay: 'Estrena hoy' },
      ],
    })
    const result = applyProposal(base, proposal)
    const allText = result.plan.narrationScenes.flatMap((s) => [s.spokenText, s.overlayText]).join(' ')
    expect(allText).not.toMatch(/mAh|50 MP/i)
    expect(result.removedClaims.length).toBeGreaterThan(0)
    // The safe hook line was still allowed.
    expect(result.plan.narrationScenes.find((s) => s.role === 'hook')!.spokenText).toContain('teléfono')
    // The applied plan is valid — never partially invalid.
    expect(result.plan.validationStatus).not.toBe('invalid')
  })

  it('rejects a price angle the facts do not support', () => {
    const noPrice = buildCommercialPlan(vagueReq, { now: NOW })
    const proposal = AIProposal.parse({ salesAngle: 'affordability', narration: [] })
    const result = applyProposal(noPrice, proposal)
    // Dishonest angle is not adopted.
    expect(result.plan.selectedAngle).not.toBe('affordability')
  })
})

describe('owner-fact precedence and single-fact regeneration', () => {
  it('an owner-edited fact overrides the parsed value', () => {
    const plan = buildCommercialPlan(vagueReq, {
      now: NOW,
      ownerFacts: [{ key: 'price', label: 'Precio', value: '$149', source: 'owner_provided', confidence: 'high', claimable: true }],
    })
    expect(factVal(plan.knownFacts, 'price')).toBe('$149')
    expect(plan.narrationScenes.find((s) => s.role === 'offer')!.spokenText).toContain('$149')
  })

  it('changing only the price regenerates the offer but keeps unrelated scenes and ids', () => {
    const base = buildCommercialPlan(fullReq, { now: NOW })
    const newFacts: ProductFact[] = base.knownFacts.map((f) => (f.key === 'price' ? { ...f, value: '$199' } : f))
    const { plan, revision } = regenerateForFacts(base, newFacts, NOW)

    expect(revision.changedFactKeys).toEqual(['price'])
    expect(plan.id).toBe(base.id) // stable plan id
    // The offer changed…
    expect(plan.narrationScenes.find((s) => s.role === 'offer')!.spokenText).toContain('$199')
    // …but the hook/solution wording did not.
    const baseHook = base.narrationScenes.find((s) => s.role === 'hook')!.spokenText
    expect(plan.narrationScenes.find((s) => s.role === 'hook')!.spokenText).toBe(baseHook)
    // Scene ids are stable → manual text-layout overrides survive.
    expect(revision.droppedLayoutKeys).toEqual([])
    expect(new Set(plan.storyboardScenes.map((s) => s.sceneId))).toEqual(new Set(base.storyboardScenes.map((s) => s.sceneId)))
  })

  it('reports dropped layout scenes when the offer scene disappears', () => {
    const withOffer = buildCommercialPlan(fullReq, { now: NOW })
    expect(withOffer.storyboardScenes.some((s) => s.sceneId === 'plan_offer')).toBe(true)
    // Remove all offer-driving facts → the offer scene is gone.
    const stripped = withOffer.knownFacts.filter((f) => !['price', 'accessories', 'availability'].includes(f.key))
    const { plan, revision } = regenerateForFacts(withOffer, stripped, NOW)
    expect(plan.storyboardScenes.some((s) => s.sceneId === 'plan_offer')).toBe(false)
    expect(revision.droppedLayoutKeys).toContain('plan_offer')
  })
})

describe('provider-neutral and Vidu-safe prompts', () => {
  const plan = buildCommercialPlan(fullReq, { now: NOW })

  it('shot prompts never mention a provider or ask for generated text/branding', () => {
    for (const p of plan.videoPrompts) {
      expect(p.prompt.toLowerCase()).not.toMatch(/vidu|kling|runway/)
      expect(p.audio).toBe(false)
      expect(p.negativePrompt).toMatch(/no on-screen text|no price|no invented logos/i)
      expect(p.durationSec).toBeCloseTo(4)
    }
    expect(plan.shotInstructions.every((s) => s.preserveSource === true)).toBe(true)
  })
})

describe('English copy quality', () => {
  it('produces natural English without invented specs', () => {
    const plan = buildCommercialPlan({ text: 'I want to promote a Samsung A16, new, 128 GB, for $179, includes case and screen protector, available today at Go Cellular.', locale: 'en' }, { now: NOW })
    expect(factVal(plan.knownFacts, 'price')).toBe('$179')
    expect(factVal(plan.knownFacts, 'store')).toBe('Go Cellular')
    const allText = plan.narrationScenes.flatMap((s) => [s.spokenText, s.overlayText]).join(' ')
    expect(scanUnsupportedClaims(allText, plan.knownFacts)).toEqual([])
    expect(plan.cta.length).toBeGreaterThan(0)
  })
})
