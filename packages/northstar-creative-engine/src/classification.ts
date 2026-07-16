import type {
  CampaignObjective,
  ClassificationResult,
  CreativeFamily,
  PromotionCategory,
  SupportedLocale,
} from './contracts.js';

export interface ClassificationInput {
  productOrService: string;
  offer?: string | undefined;
  businessName?: string | undefined;
  industry?: string | undefined;
  notes?: string | undefined;
  locale: SupportedLocale;
  objective?: CampaignObjective | undefined;
}

type KeywordRule = {
  category: PromotionCategory;
  weight: number;
  pattern: RegExp;
  reason: string;
};

const RULES: KeywordRule[] = [
  { category: 'repair', weight: 4, pattern: /\b(repair|fix|fixed|screen|cracked|broken|battery|charging port|reparaci[oó]n|reparar|arreglo|pantalla|roto|quebrado|bater[ií]a|conserto|consertar|tela|rachad[ao]|quebrad[ao])\b/i, reason: 'repair language' },
  { category: 'transformation', weight: 4, pattern: /\b(before|after|transform|makeover|restore|restoration|antes|despu[eé]s|transformaci[oó]n|restauraci[oó]n|antes|depois|transforma[cç][aã]o|restaura[cç][aã]o)\b/i, reason: 'transformation language' },
  { category: 'retail_offer', weight: 4, pattern: /\b(sale|deal|discount|clearance|coupon|save|off|oferta|descuento|promoci[oó]n|rebaja|liquidaci[oó]n|ahorra|promo[cç][aã]o|desconto|liquida[cç][aã]o|economize)\b/i, reason: 'retail offer language' },
  { category: 'announcement', weight: 4, pattern: /\b(grand opening|now open|new location|coming soon|announcement|inaugura[cç][aã]o|apertura|inauguraci[oó]n|nuevo local|nova unidade|em breve|anuncio)\b/i, reason: 'announcement language' },
  { category: 'service_trust', weight: 3, pattern: /\b(trust|warranty|certified|professional|licensed|insured|expert|guarantee|garant[ií]a|certificado|profesional|calidad|experto|confianza|garantia|certificado|profissional|qualidade|especialista|confian[cç]a)\b/i, reason: 'trust language' },
  { category: 'food', weight: 4, pattern: /\b(food|restaurant|menu|dish|taco|pizza|burger|coffee|bakery|comida|restaurante|men[uú]|platillo|caf[eé]|panader[ií]a|comida|restaurante|card[aá]pio|prato|caf[eé]|padaria)\b/i, reason: 'food language' },
  { category: 'event', weight: 4, pattern: /\b(event|concert|festival|party|workshop|class|conference|evento|concierto|fiesta|taller|clase|conferencia|show|festa|oficina|aula|confer[eê]ncia)\b/i, reason: 'event language' },
  { category: 'product_launch', weight: 4, pattern: /\b(new arrival|new product|launch|introducing|just arrived|nuevo producto|nuevo modelo|lanzamiento|reci[eé]n llegado|novo produto|lan[cç]amento|acabou de chegar)\b/i, reason: 'product launch language' },
  { category: 'testimonial', weight: 4, pattern: /\b(testimonial|review|customer says|five stars|rese[nñ]a|testimonio|cliente dice|cinco estrellas|depoimento|avalia[cç][aã]o|cliente diz|cinco estrelas)\b/i, reason: 'testimonial language' },
];

const OBJECTIVE_CATEGORY_BOOSTS: Partial<Record<CampaignObjective, Partial<Record<PromotionCategory, number>>>> = {
  drive_action: { retail_offer: 2, repair: 1, product_launch: 1 },
  build_trust: { service_trust: 3, testimonial: 2 },
  show_transformation: { transformation: 4, repair: 1 },
  announce: { announcement: 4, event: 2, product_launch: 2 },
  stop_scroll: { retail_offer: 1, product_launch: 1, event: 1 },
};

const CATEGORIES: PromotionCategory[] = [
  'repair',
  'transformation',
  'retail_offer',
  'service_trust',
  'announcement',
  'food',
  'event',
  'product_launch',
  'testimonial',
  'generic',
];

export function classifyPromotion(input: ClassificationInput): ClassificationResult {
  const text = [input.businessName, input.productOrService, input.offer, input.industry, input.notes]
    .filter((part): part is string => Boolean(part?.trim()))
    .join(' ')
    .toLocaleLowerCase(input.locale);

  const scores = Object.fromEntries(CATEGORIES.map((category) => [category, 0])) as Record<PromotionCategory, number>;
  const reasons: string[] = [];

  for (const rule of RULES) {
    const flags = rule.pattern.flags.includes('g') ? rule.pattern.flags : `${rule.pattern.flags}g`;
    const matches = Array.from(text.matchAll(new RegExp(rule.pattern.source, flags)));
    if (matches.length === 0) continue;
    const multiplier = Math.min(3, matches.length);
    const points = rule.weight * multiplier;
    scores[rule.category] += points;
    const terms = Array.from(new Set(matches.map((match) => match[0]))).join(', ');
    reasons.push(`${rule.category}: ${rule.reason} (${terms}) +${points}`);
  }

  if (input.objective) {
    const boosts = OBJECTIVE_CATEGORY_BOOSTS[input.objective] ?? {};
    for (const [category, boost] of Object.entries(boosts) as Array<[PromotionCategory, number]>) {
      scores[category] += boost;
      reasons.push(`${category}: objective ${input.objective} +${boost}`);
    }
  }

  const nonGeneric = CATEGORIES.filter((category) => category !== 'generic');
  const ranked = nonGeneric
    .map((category) => ({ category, score: scores[category] }))
    .sort((a, b) => b.score - a.score || a.category.localeCompare(b.category));
  const best = ranked[0];

  if (!best || best.score <= 0) {
    scores.generic = 1;
    return {
      category: 'generic',
      confidence: 0.25,
      scores,
      reasons: ['generic: no deterministic category signal found'],
    };
  }

  const secondScore = ranked[1]?.score ?? 0;
  const total = ranked.reduce((sum, item) => sum + item.score, 0);
  const dominance = total > 0 ? best.score / total : 0;
  const margin = best.score > 0 ? (best.score - secondScore) / best.score : 0;
  const confidence = Math.min(1, Math.max(0.35, dominance * 0.65 + margin * 0.35));

  return {
    category: best.category,
    confidence: Number(confidence.toFixed(3)),
    scores,
    reasons,
  };
}

const CATEGORY_FAMILY_WEIGHTS: Record<PromotionCategory, Record<CreativeFamily, number>> = {
  repair: { problem_solution: 5, before_after: 3, fast_retail: 2, trust_craft: 4, social_native: 1 },
  transformation: { problem_solution: 2, before_after: 5, fast_retail: 1, trust_craft: 3, social_native: 2 },
  retail_offer: { problem_solution: 3, before_after: 1, fast_retail: 5, trust_craft: 1, social_native: 4 },
  service_trust: { problem_solution: 3, before_after: 2, fast_retail: 1, trust_craft: 5, social_native: 2 },
  announcement: { problem_solution: 2, before_after: 1, fast_retail: 4, trust_craft: 2, social_native: 5 },
  food: { problem_solution: 2, before_after: 2, fast_retail: 4, trust_craft: 2, social_native: 5 },
  event: { problem_solution: 2, before_after: 1, fast_retail: 4, trust_craft: 1, social_native: 5 },
  product_launch: { problem_solution: 3, before_after: 2, fast_retail: 4, trust_craft: 2, social_native: 5 },
  testimonial: { problem_solution: 2, before_after: 2, fast_retail: 1, trust_craft: 5, social_native: 3 },
  generic: { problem_solution: 5, before_after: 3, fast_retail: 4, trust_craft: 2, social_native: 1 },
};

const OBJECTIVE_FAMILY_BOOSTS: Record<CampaignObjective, Partial<Record<CreativeFamily, number>>> = {
  drive_action: { fast_retail: 3, problem_solution: 2, social_native: 1 },
  build_trust: { trust_craft: 4, problem_solution: 1 },
  show_transformation: { before_after: 5, problem_solution: 1 },
  announce: { social_native: 3, fast_retail: 3 },
  stop_scroll: { social_native: 4, fast_retail: 2 },
};

export function rankFamilies(
  classification: ClassificationResult,
  objective?: CampaignObjective,
): Array<{ family: CreativeFamily; score: number }> {
  const base = CATEGORY_FAMILY_WEIGHTS[classification.category];
  const boosts = objective ? OBJECTIVE_FAMILY_BOOSTS[objective] : {};
  return (Object.keys(base) as CreativeFamily[])
    .map((family) => ({ family, score: base[family] + (boosts[family] ?? 0) }))
    .sort((a, b) => b.score - a.score || a.family.localeCompare(b.family));
}
