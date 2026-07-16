import type {
  ArtDirection,
  BackgroundMotion,
  CampaignObjective,
  CreativeFamily,
  EmotionalDirection,
  MediaRole,
  MotionMove,
  MotionProfile,
  PacingProfileName,
  SceneRole,
  ShotBehavior,
  SupportedLocale,
  TextDensity,
  Transition,
} from './contracts.js';

export type LocalizedText = Record<SupportedLocale, string>;

export interface FamilyBeat {
  beatPurpose: string;
  role: SceneRole;
  shotBehavior: ShotBehavior;
  motion: MotionMove;
  transitionIn: Transition;
  textDensity: TextDensity;
  holdBias: number;
  mediaSlots: MediaRole[];
  emphasis: 'none' | 'offer' | 'proof' | 'cta' | 'hook';
}

export interface FamilyVariant {
  id: string;
  ownerNameSuffix: LocalizedText;
  ownerDescription: LocalizedText;
  beatOrder?: string[];
  beatOverrides?: Record<string, Partial<Omit<FamilyBeat, 'beatPurpose'>>>;
  hookStrategy?: string;
  proofStrategy?: string;
  offerStrategy?: string;
  ctaStrategy?: string;
  transitionStyle?: string;
  targetDurationDeltaSec?: number;
}

export interface FamilyRecipe {
  family: CreativeFamily;
  ownerName: LocalizedText;
  ownerDescription: LocalizedText;
  objective: CampaignObjective;
  emotionalDirection: EmotionalDirection;
  hookStrategy: string;
  proofStrategy: string;
  offerStrategy: string;
  ctaStrategy: string;
  audienceIntent: string;
  promiseTemplate: LocalizedText;
  pacingProfile: PacingProfileName;
  motionProfile: MotionProfile;
  artDirection: ArtDirection;
  backgroundMotion: BackgroundMotion;
  transitionStyle: string;
  typography: {
    density: TextDensity;
    emphasis: 'calm' | 'bold' | 'impact';
    case: 'sentence' | 'title' | 'upper';
  };
  musicDirection: { style: string; energy: 'low' | 'medium' | 'high' };
  narrationDirection: { tone: string; pace: 'slow' | 'medium' | 'fast' };
  beats: FamilyBeat[];
  variants: FamilyVariant[];
}

const emptySuffix: LocalizedText = { en: '', es: '', pt: '' };

const PROBLEM_SOLUTION: FamilyRecipe = {
  family: 'problem_solution',
  ownerName: {
    en: 'Clear problem, strong solution',
    es: 'Problema claro, solución fuerte',
    pt: 'Problema claro, solução forte',
  },
  ownerDescription: {
    en: 'Names the pain, demonstrates the solution, and closes with proof.',
    es: 'Muestra el problema, presenta la solución y cierra con prueba.',
    pt: 'Mostra o problema, apresenta a solução e fecha com prova.',
  },
  objective: 'drive_action',
  emotionalDirection: 'empathetic',
  hookStrategy: 'name the pain immediately',
  proofStrategy: 'show process and a credible result',
  offerStrategy: 'place the offer immediately after the result',
  ctaStrategy: 'benefit-led direct call to action',
  audienceIntent: 'a viewer who has an immediate problem and wants a practical solution',
  promiseTemplate: {
    en: '{product} — solved fast and done right',
    es: '{product}: solución rápida y bien hecha',
    pt: '{product}: solução rápida e bem-feita',
  },
  pacingProfile: 'retail_energy',
  motionProfile: 'retail_energy',
  artDirection: 'retail_energy',
  backgroundMotion: 'subtle',
  transitionStyle: 'hard cuts with clean proof holds',
  typography: { density: 'medium', emphasis: 'bold', case: 'title' },
  musicDirection: { style: 'driving', energy: 'medium' },
  narrationDirection: { tone: 'reassuring', pace: 'medium' },
  beats: [
    { beatPurpose: 'problem_hook', role: 'hook', shotBehavior: 'fast_push', motion: 'fast_push', transitionIn: 'hard_cut', textDensity: 'high', holdBias: 0.9, mediaSlots: ['product'], emphasis: 'hook' },
    { beatPurpose: 'consequence', role: 'problem', shotBehavior: 'detail_crop', motion: 'clean_cut', transitionIn: 'hard_cut', textDensity: 'medium', holdBias: 0.9, mediaSlots: ['product'], emphasis: 'none' },
    { beatPurpose: 'service_reveal', role: 'solution', shotBehavior: 'snap_zoom', motion: 'snap_zoom', transitionIn: 'hard_cut', textDensity: 'medium', holdBias: 1, mediaSlots: ['process'], emphasis: 'none' },
    { beatPurpose: 'process_proof', role: 'proof', shotBehavior: 'subtle_push', motion: 'proof_hold', transitionIn: 'clean_cut', textDensity: 'low', holdBias: 1.1, mediaSlots: ['process'], emphasis: 'proof' },
    { beatPurpose: 'finished_result', role: 'solution', shotBehavior: 'pull_back', motion: 'pull_back', transitionIn: 'clean_cut', textDensity: 'medium', holdBias: 1, mediaSlots: ['result'], emphasis: 'none' },
    { beatPurpose: 'offer', role: 'offer', shotBehavior: 'impact_scale', motion: 'impact_scale', transitionIn: 'hard_cut', textDensity: 'high', holdBias: 1, mediaSlots: [], emphasis: 'offer' },
    { beatPurpose: 'direct_cta', role: 'cta', shotBehavior: 'static', motion: 'kinetic_text', transitionIn: 'clean_cut', textDensity: 'medium', holdBias: 1, mediaSlots: ['logo'], emphasis: 'cta' },
  ],
  variants: [
    {
      id: 'pain_first',
      ownerNameSuffix: emptySuffix,
      ownerDescription: {
        en: 'Leads with the customer pain before revealing the answer.',
        es: 'Empieza con el problema del cliente antes de revelar la respuesta.',
        pt: 'Começa com a dor do cliente antes de revelar a resposta.',
      },
    },
    {
      id: 'result_first',
      ownerNameSuffix: { en: ' — result first', es: ' — resultado primero', pt: ' — resultado primeiro' },
      ownerDescription: {
        en: 'Opens with the finished result, then explains how the problem was solved.',
        es: 'Abre con el resultado final y después explica cómo se resolvió el problema.',
        pt: 'Abre com o resultado final e depois explica como o problema foi resolvido.',
      },
      beatOrder: ['finished_result', 'problem_hook', 'consequence', 'service_reveal', 'process_proof', 'offer', 'direct_cta'],
      beatOverrides: {
        finished_result: { role: 'hook', shotBehavior: 'impact_scale', motion: 'impact_scale', emphasis: 'hook' },
        problem_hook: { role: 'problem', emphasis: 'none' },
      },
      hookStrategy: 'open on the successful result, then reveal the original pain',
      targetDurationDeltaSec: -1,
    },
    {
      id: 'proof_first',
      ownerNameSuffix: { en: ' — proof-led', es: ' — guiado por prueba', pt: ' — guiado por prova' },
      ownerDescription: {
        en: 'Uses process credibility as the hook before presenting the offer.',
        es: 'Usa la credibilidad del proceso como gancho antes de presentar la oferta.',
        pt: 'Usa a credibilidade do processo como gancho antes de apresentar a oferta.',
      },
      beatOrder: ['process_proof', 'problem_hook', 'consequence', 'service_reveal', 'finished_result', 'offer', 'direct_cta'],
      beatOverrides: {
        process_proof: { role: 'hook', shotBehavior: 'detail_crop', emphasis: 'hook' },
        problem_hook: { role: 'problem', emphasis: 'none' },
      },
      hookStrategy: 'lead with skilled process and credibility',
      proofStrategy: 'show expertise first and outcome second',
      transitionStyle: 'clean cuts with deliberate detail holds',
      targetDurationDeltaSec: 2,
    },
  ],
};

const BEFORE_AFTER: FamilyRecipe = {
  family: 'before_after',
  ownerName: {
    en: 'See the transformation',
    es: 'Mira la transformación',
    pt: 'Veja a transformação',
  },
  ownerDescription: {
    en: 'Makes the visible change the central argument.',
    es: 'Convierte el cambio visual en el argumento principal.',
    pt: 'Transforma a mudança visual no argumento principal.',
  },
  objective: 'show_transformation',
  emotionalDirection: 'aspirational',
  hookStrategy: 'open on the before state with restraint',
  proofStrategy: 'make the before-and-after reveal the proof',
  offerStrategy: 'place the promise after the reveal',
  ctaStrategy: 'calm and confident close',
  audienceIntent: 'a viewer who needs to believe the result is real',
  promiseTemplate: {
    en: 'From before to better — {product}',
    es: 'Del antes a algo mejor: {product}',
    pt: 'Do antes para algo melhor: {product}',
  },
  pacingProfile: 'transformation',
  motionProfile: 'premium',
  artDirection: 'clean_modern',
  backgroundMotion: 'off',
  transitionStyle: 'before-and-after reveals and clean split screens',
  typography: { density: 'low', emphasis: 'calm', case: 'sentence' },
  musicDirection: { style: 'uplifting', energy: 'medium' },
  narrationDirection: { tone: 'warm', pace: 'medium' },
  beats: [
    { beatPurpose: 'before_state', role: 'problem', shotBehavior: 'full_frame_hold', motion: 'static_hold', transitionIn: 'clean_cut', textDensity: 'low', holdBias: 1, mediaSlots: ['before'], emphasis: 'none' },
    { beatPurpose: 'before_detail', role: 'problem', shotBehavior: 'detail_crop', motion: 'proof_hold', transitionIn: 'clean_cut', textDensity: 'low', holdBias: 1, mediaSlots: ['before'], emphasis: 'none' },
    { beatPurpose: 'transition_setup', role: 'solution', shotBehavior: 'static', motion: 'masked_wipe', transitionIn: 'masked_wipe', textDensity: 'low', holdBias: 0.8, mediaSlots: ['process'], emphasis: 'none' },
    { beatPurpose: 'transformation_reveal', role: 'proof', shotBehavior: 'before_after_reveal', motion: 'before_after_reveal', transitionIn: 'before_after_reveal', textDensity: 'medium', holdBias: 1.5, mediaSlots: ['before', 'after'], emphasis: 'proof' },
    { beatPurpose: 'after_detail', role: 'solution', shotBehavior: 'detail_crop', motion: 'proof_hold', transitionIn: 'clean_cut', textDensity: 'low', holdBias: 1.2, mediaSlots: ['after'], emphasis: 'none' },
    { beatPurpose: 'service_promise', role: 'offer', shotBehavior: 'subtle_push', motion: 'subtle_push', transitionIn: 'clean_fade', textDensity: 'medium', holdBias: 1, mediaSlots: [], emphasis: 'offer' },
    { beatPurpose: 'confident_cta', role: 'cta', shotBehavior: 'static', motion: 'clean_fade', transitionIn: 'clean_fade', textDensity: 'low', holdBias: 1, mediaSlots: ['logo'], emphasis: 'cta' },
  ],
  variants: [
    {
      id: 'split_reveal',
      ownerNameSuffix: emptySuffix,
      ownerDescription: {
        en: 'Builds toward a clear split-screen before-and-after reveal.',
        es: 'Construye hacia una revelación clara de antes y después en pantalla dividida.',
        pt: 'Constrói uma revelação clara de antes e depois em tela dividida.',
      },
    },
    {
      id: 'after_first',
      ownerNameSuffix: { en: ' — reveal first', es: ' — revelación primero', pt: ' — revelação primeiro' },
      ownerDescription: {
        en: 'Starts with the final result, then proves how dramatic the change was.',
        es: 'Empieza con el resultado final y después demuestra qué tan grande fue el cambio.',
        pt: 'Começa com o resultado final e depois prova o tamanho da mudança.',
      },
      beatOrder: ['after_detail', 'before_state', 'before_detail', 'transition_setup', 'transformation_reveal', 'service_promise', 'confident_cta'],
      beatOverrides: {
        after_detail: { role: 'hook', shotBehavior: 'impact_scale', motion: 'impact_scale', emphasis: 'hook' },
      },
      hookStrategy: 'show the aspirational result before revealing the original state',
      targetDurationDeltaSec: -1,
    },
    {
      id: 'process_reveal',
      ownerNameSuffix: { en: ' — process reveal', es: ' — proceso visible', pt: ' — processo visível' },
      ownerDescription: {
        en: 'Makes the transformation process nearly as important as the final result.',
        es: 'Hace que el proceso de transformación sea casi tan importante como el resultado.',
        pt: 'Torna o processo de transformação quase tão importante quanto o resultado.',
      },
      beatOrder: ['before_state', 'transition_setup', 'before_detail', 'transformation_reveal', 'after_detail', 'service_promise', 'confident_cta'],
      beatOverrides: {
        transition_setup: { role: 'hook', shotBehavior: 'rapid_montage', motion: 'rapid_cut_sequence', mediaSlots: ['process'], emphasis: 'hook' },
        before_state: { role: 'problem' },
      },
      hookStrategy: 'hook with an active glimpse of the transformation process',
      proofStrategy: 'combine process evidence with the final before-and-after reveal',
      targetDurationDeltaSec: 2,
    },
  ],
};

const FAST_RETAIL: FamilyRecipe = {
  family: 'fast_retail',
  ownerName: {
    en: 'Fast and urgent',
    es: 'Rápido y urgente',
    pt: 'Rápido e urgente',
  },
  ownerDescription: {
    en: 'Uses quick cuts and a strong offer to drive immediate action.',
    es: 'Usa cortes rápidos y una oferta fuerte para impulsar acción inmediata.',
    pt: 'Usa cortes rápidos e uma oferta forte para gerar ação imediata.',
  },
  objective: 'drive_action',
  emotionalDirection: 'urgent',
  hookStrategy: 'pattern interrupt followed by the offer',
  proofStrategy: 'quick credibility flashes without losing momentum',
  offerStrategy: 'lead with the offer and reinforce it once',
  ctaStrategy: 'urgent time-sensitive call to action',
  audienceIntent: 'a fast-scrolling viewer who reacts to a strong deal',
  promiseTemplate: {
    en: '{product} — {offer}',
    es: '{product}: {offer}',
    pt: '{product}: {offer}',
  },
  pacingProfile: 'social_fast',
  motionProfile: 'urgent_sale',
  artDirection: 'urgent_sale',
  backgroundMotion: 'active',
  transitionStyle: 'hard cuts and rapid visual resets',
  typography: { density: 'high', emphasis: 'impact', case: 'upper' },
  musicDirection: { style: 'high-energy', energy: 'high' },
  narrationDirection: { tone: 'excited', pace: 'fast' },
  beats: [
    { beatPurpose: 'pattern_interrupt', role: 'hook', shotBehavior: 'snap_zoom', motion: 'snap_zoom', transitionIn: 'hard_cut', textDensity: 'high', holdBias: 0.7, mediaSlots: ['product'], emphasis: 'hook' },
    { beatPurpose: 'big_offer', role: 'offer', shotBehavior: 'impact_scale', motion: 'impact_scale', transitionIn: 'hard_cut', textDensity: 'high', holdBias: 1.1, mediaSlots: [], emphasis: 'offer' },
    { beatPurpose: 'rapid_benefit', role: 'solution', shotBehavior: 'rapid_montage', motion: 'rapid_cut_sequence', transitionIn: 'hard_cut', textDensity: 'high', holdBias: 0.8, mediaSlots: ['product', 'product'], emphasis: 'none' },
    { beatPurpose: 'speed_claim', role: 'proof', shotBehavior: 'fast_push', motion: 'fast_push', transitionIn: 'hard_cut', textDensity: 'medium', holdBias: 0.8, mediaSlots: ['process'], emphasis: 'none' },
    { beatPurpose: 'social_proof', role: 'proof', shotBehavior: 'rapid_montage', motion: 'rapid_cut_sequence', transitionIn: 'hard_cut', textDensity: 'medium', holdBias: 0.8, mediaSlots: ['proof'], emphasis: 'proof' },
    { beatPurpose: 'urgent_cta', role: 'cta', shotBehavior: 'impact_scale', motion: 'impact_scale', transitionIn: 'hard_cut', textDensity: 'high', holdBias: 1, mediaSlots: ['logo'], emphasis: 'cta' },
  ],
  variants: [
    {
      id: 'offer_first',
      ownerNameSuffix: emptySuffix,
      ownerDescription: {
        en: 'Gets the deal on screen immediately and maintains a fast pace.',
        es: 'Pone la oferta en pantalla de inmediato y mantiene un ritmo rápido.',
        pt: 'Coloca a oferta na tela imediatamente e mantém um ritmo rápido.',
      },
      beatOrder: ['big_offer', 'pattern_interrupt', 'rapid_benefit', 'speed_claim', 'social_proof', 'urgent_cta'],
      beatOverrides: {
        big_offer: { role: 'hook', emphasis: 'hook' },
        pattern_interrupt: { role: 'offer', emphasis: 'offer' },
      },
      hookStrategy: 'put the strongest offer in the first frame',
    },
    {
      id: 'product_first',
      ownerNameSuffix: { en: ' — product first', es: ' — producto primero', pt: ' — produto primeiro' },
      ownerDescription: {
        en: 'Hooks with the product, then lands the deal as the payoff.',
        es: 'Engancha con el producto y presenta la oferta como recompensa.',
        pt: 'Prende com o produto e apresenta a oferta como recompensa.',
      },
      beatOrder: ['pattern_interrupt', 'rapid_benefit', 'big_offer', 'speed_claim', 'social_proof', 'urgent_cta'],
      hookStrategy: 'lead with an unmistakable product visual',
      offerStrategy: 'reveal the offer after product desire is established',
    },
    {
      id: 'proof_then_offer',
      ownerNameSuffix: { en: ' — proof then offer', es: ' — prueba y oferta', pt: ' — prova e oferta' },
      ownerDescription: {
        en: 'Builds quick credibility before delivering the strongest price or promotion.',
        es: 'Construye credibilidad rápidamente antes de presentar el precio o promoción.',
        pt: 'Constrói credibilidade rapidamente antes de apresentar o preço ou promoção.',
      },
      beatOrder: ['pattern_interrupt', 'social_proof', 'speed_claim', 'big_offer', 'rapid_benefit', 'urgent_cta'],
      proofStrategy: 'establish credibility before revealing the deal',
      targetDurationDeltaSec: 1,
    },
  ],
};

const TRUST_CRAFT: FamilyRecipe = {
  family: 'trust_craft',
  ownerName: {
    en: 'Professional and trustworthy',
    es: 'Profesional y confiable',
    pt: 'Profissional e confiável',
  },
  ownerDescription: {
    en: 'Uses calm pacing and visible proof to reduce customer hesitation.',
    es: 'Usa un ritmo calmado y pruebas visibles para reducir la desconfianza.',
    pt: 'Usa ritmo calmo e provas visíveis para reduzir a desconfiança.',
  },
  objective: 'build_trust',
  emotionalDirection: 'reassuring',
  hookStrategy: 'acknowledge the customer concern first',
  proofStrategy: 'use careful process and quality-detail holds',
  offerStrategy: 'prioritize assurance and value over discount',
  ctaStrategy: 'calm low-pressure invitation',
  audienceIntent: 'a cautious viewer who wants confidence before buying',
  promiseTemplate: {
    en: '{product} — handled by people who care',
    es: '{product}: en manos de gente que sí se preocupa',
    pt: '{product}: nas mãos de quem realmente se importa',
  },
  pacingProfile: 'trust_precision',
  motionProfile: 'calm',
  artDirection: 'premium_dark',
  backgroundMotion: 'off',
  transitionStyle: 'clean cuts and gentle fades',
  typography: { density: 'low', emphasis: 'calm', case: 'sentence' },
  musicDirection: { style: 'warm', energy: 'low' },
  narrationDirection: { tone: 'calm', pace: 'slow' },
  beats: [
    { beatPurpose: 'customer_concern', role: 'problem', shotBehavior: 'static', motion: 'clean_fade', transitionIn: 'clean_fade', textDensity: 'low', holdBias: 1, mediaSlots: ['person'], emphasis: 'none' },
    { beatPurpose: 'professional_intro', role: 'solution', shotBehavior: 'subtle_push', motion: 'subtle_push', transitionIn: 'clean_fade', textDensity: 'low', holdBias: 1, mediaSlots: ['person'], emphasis: 'none' },
    { beatPurpose: 'careful_process', role: 'proof', shotBehavior: 'static', motion: 'proof_hold', transitionIn: 'clean_cut', textDensity: 'low', holdBias: 1.3, mediaSlots: ['process'], emphasis: 'proof' },
    { beatPurpose: 'quality_detail', role: 'proof', shotBehavior: 'detail_crop', motion: 'proof_hold', transitionIn: 'clean_cut', textDensity: 'low', holdBias: 1.3, mediaSlots: ['result'], emphasis: 'proof' },
    { beatPurpose: 'finished_result', role: 'solution', shotBehavior: 'pull_back', motion: 'pull_back', transitionIn: 'clean_fade', textDensity: 'low', holdBias: 1.1, mediaSlots: ['result'], emphasis: 'none' },
    { beatPurpose: 'guarantee', role: 'proof', shotBehavior: 'static', motion: 'static_hold', transitionIn: 'clean_fade', textDensity: 'medium', holdBias: 1.1, mediaSlots: ['proof'], emphasis: 'proof' },
    { beatPurpose: 'calm_cta', role: 'cta', shotBehavior: 'static', motion: 'clean_fade', transitionIn: 'clean_fade', textDensity: 'low', holdBias: 1, mediaSlots: ['logo'], emphasis: 'cta' },
  ],
  variants: [
    {
      id: 'process_first',
      ownerNameSuffix: emptySuffix,
      ownerDescription: {
        en: 'Builds confidence through a careful process and visible quality.',
        es: 'Construye confianza mostrando un proceso cuidadoso y calidad visible.',
        pt: 'Constrói confiança mostrando um processo cuidadoso e qualidade visível.',
      },
      beatOrder: ['careful_process', 'customer_concern', 'professional_intro', 'quality_detail', 'finished_result', 'guarantee', 'calm_cta'],
      beatOverrides: {
        careful_process: { role: 'hook', emphasis: 'hook' },
      },
      hookStrategy: 'hook with careful craftsmanship instead of urgency',
    },
    {
      id: 'person_first',
      ownerNameSuffix: { en: ' — people first', es: ' — personas primero', pt: ' — pessoas primeiro' },
      ownerDescription: {
        en: 'Introduces the people behind the service before showing the technical proof.',
        es: 'Presenta a las personas detrás del servicio antes de mostrar la prueba técnica.',
        pt: 'Apresenta as pessoas por trás do serviço antes da prova técnica.',
      },
      beatOrder: ['professional_intro', 'customer_concern', 'careful_process', 'quality_detail', 'finished_result', 'guarantee', 'calm_cta'],
      beatOverrides: {
        professional_intro: { role: 'hook', emphasis: 'hook' },
      },
      hookStrategy: 'lead with a human face and professional presence',
    },
    {
      id: 'guarantee_first',
      ownerNameSuffix: { en: ' — assurance first', es: ' — garantía primero', pt: ' — garantia primeiro' },
      ownerDescription: {
        en: 'Removes risk immediately, then proves the business can deliver.',
        es: 'Elimina el riesgo desde el inicio y después demuestra que el negocio cumple.',
        pt: 'Elimina o risco no início e depois prova que o negócio entrega.',
      },
      beatOrder: ['guarantee', 'customer_concern', 'professional_intro', 'careful_process', 'quality_detail', 'finished_result', 'calm_cta'],
      beatOverrides: {
        guarantee: { role: 'hook', shotBehavior: 'impact_scale', motion: 'staggered_text', emphasis: 'hook' },
      },
      hookStrategy: 'lead with the strongest risk-reversal message',
      proofStrategy: 'support the assurance with people, process and finished quality',
      targetDurationDeltaSec: -1,
    },
  ],
};

const SOCIAL_NATIVE: FamilyRecipe = {
  family: 'social_native',
  ownerName: {
    en: 'Made for social',
    es: 'Hecho para redes',
    pt: 'Feito para redes',
  },
  ownerDescription: {
    en: 'Feels native to Reels and TikTok instead of like a television ad.',
    es: 'Se siente natural en Reels y TikTok, no como un anuncio de televisión.',
    pt: 'Parece natural em Reels e TikTok, não como propaganda de televisão.',
  },
  objective: 'stop_scroll',
  emotionalDirection: 'energetic',
  hookStrategy: 'direct conversational hook in the opening seconds',
  proofStrategy: 'one fast credibility beat before moving on',
  offerStrategy: 'one simple offer stated plainly',
  ctaStrategy: 'mobile-first immediate close',
  audienceIntent: 'a phone-first viewer who skips conventional advertisements',
  promiseTemplate: {
    en: '{product}? Handled. {offer}.',
    es: '¿{product}? Resuelto. {offer}.',
    pt: '{product}? Resolvido. {offer}.',
  },
  pacingProfile: 'social_fast',
  motionProfile: 'social_reel',
  artDirection: 'social_reel',
  backgroundMotion: 'active',
  transitionStyle: 'jump cuts and visual resets',
  typography: { density: 'high', emphasis: 'impact', case: 'upper' },
  musicDirection: { style: 'trend-aware', energy: 'high' },
  narrationDirection: { tone: 'conversational', pace: 'fast' },
  beats: [
    { beatPurpose: 'direct_hook', role: 'hook', shotBehavior: 'static', motion: 'kinetic_text', transitionIn: 'hard_cut', textDensity: 'high', holdBias: 0.9, mediaSlots: ['person'], emphasis: 'hook' },
    { beatPurpose: 'unexpected_closeup', role: 'problem', shotBehavior: 'snap_zoom', motion: 'snap_zoom', transitionIn: 'hard_cut', textDensity: 'high', holdBias: 0.8, mediaSlots: ['product'], emphasis: 'none' },
    { beatPurpose: 'fast_demo', role: 'solution', shotBehavior: 'rapid_montage', motion: 'rapid_cut_sequence', transitionIn: 'hard_cut', textDensity: 'high', holdBias: 0.9, mediaSlots: ['process', 'product'], emphasis: 'none' },
    { beatPurpose: 'quick_proof', role: 'proof', shotBehavior: 'fast_push', motion: 'fast_push', transitionIn: 'hard_cut', textDensity: 'medium', holdBias: 0.8, mediaSlots: ['proof'], emphasis: 'proof' },
    { beatPurpose: 'simple_offer', role: 'offer', shotBehavior: 'impact_scale', motion: 'impact_scale', transitionIn: 'hard_cut', textDensity: 'high', holdBias: 1, mediaSlots: [], emphasis: 'offer' },
    { beatPurpose: 'mobile_cta', role: 'cta', shotBehavior: 'snap_zoom', motion: 'kinetic_text', transitionIn: 'hard_cut', textDensity: 'high', holdBias: 0.9, mediaSlots: ['logo'], emphasis: 'cta' },
  ],
  variants: [
    {
      id: 'question_hook',
      ownerNameSuffix: emptySuffix,
      ownerDescription: {
        en: 'Starts with a direct question that feels conversational and native.',
        es: 'Empieza con una pregunta directa que se siente natural y conversacional.',
        pt: 'Começa com uma pergunta direta, natural e conversacional.',
      },
    },
    {
      id: 'visual_hook',
      ownerNameSuffix: { en: ' — visual hook', es: ' — gancho visual', pt: ' — gancho visual' },
      ownerDescription: {
        en: 'Lets an unexpected close-up stop the scroll before any explanation.',
        es: 'Usa un acercamiento inesperado para detener el scroll antes de explicar.',
        pt: 'Usa um close inesperado para parar o scroll antes da explicação.',
      },
      beatOrder: ['unexpected_closeup', 'direct_hook', 'fast_demo', 'quick_proof', 'simple_offer', 'mobile_cta'],
      beatOverrides: {
        unexpected_closeup: { role: 'hook', emphasis: 'hook' },
        direct_hook: { role: 'problem', emphasis: 'none' },
      },
      hookStrategy: 'open with an unexpected product or detail close-up',
    },
    {
      id: 'demo_hook',
      ownerNameSuffix: { en: ' — demo first', es: ' — demostración primero', pt: ' — demonstração primeiro' },
      ownerDescription: {
        en: 'Begins in motion with the product or service already being demonstrated.',
        es: 'Empieza en movimiento con el producto o servicio ya en demostración.',
        pt: 'Começa em movimento com o produto ou serviço já sendo demonstrado.',
      },
      beatOrder: ['fast_demo', 'direct_hook', 'unexpected_closeup', 'quick_proof', 'simple_offer', 'mobile_cta'],
      beatOverrides: {
        fast_demo: { role: 'hook', emphasis: 'hook' },
        direct_hook: { role: 'solution', emphasis: 'none' },
      },
      hookStrategy: 'begin with immediate action rather than explanation',
      targetDurationDeltaSec: 1,
    },
  ],
};

export const FAMILY_RECIPES: Record<CreativeFamily, FamilyRecipe> = {
  problem_solution: PROBLEM_SOLUTION,
  before_after: BEFORE_AFTER,
  fast_retail: FAST_RETAIL,
  trust_craft: TRUST_CRAFT,
  social_native: SOCIAL_NATIVE,
};

export const ALL_FAMILIES: CreativeFamily[] = [
  'problem_solution',
  'before_after',
  'fast_retail',
  'trust_craft',
  'social_native',
];

export function getFamilyRecipe(family: CreativeFamily): FamilyRecipe {
  return FAMILY_RECIPES[family];
}

function cloneBeat(beat: FamilyBeat): FamilyBeat {
  return { ...beat, mediaSlots: [...beat.mediaSlots] };
}

export interface MaterializedFamily {
  recipe: FamilyRecipe;
  variant: FamilyVariant;
  beats: FamilyBeat[];
  ownerName: string;
  ownerDescription: string;
  hookStrategy: string;
  proofStrategy: string;
  offerStrategy: string;
  ctaStrategy: string;
  transitionStyle: string;
}

export function materializeFamilyVariant(
  family: CreativeFamily,
  variantId: string,
  locale: SupportedLocale,
): MaterializedFamily {
  const recipe = getFamilyRecipe(family);
  const variant = recipe.variants.find((candidate) => candidate.id === variantId);
  if (!variant) throw new Error(`Unknown variant '${variantId}' for family '${family}'`);

  const beatMap = new Map(recipe.beats.map((beat) => [beat.beatPurpose, cloneBeat(beat)]));
  const order = variant.beatOrder ?? recipe.beats.map((beat) => beat.beatPurpose);
  const beats = order.map((beatPurpose) => {
    const base = beatMap.get(beatPurpose);
    if (!base) throw new Error(`Variant '${variantId}' references unknown beat '${beatPurpose}'`);
    const override = variant.beatOverrides?.[beatPurpose];
    return {
      ...base,
      ...override,
      mediaSlots: override?.mediaSlots ? [...override.mediaSlots] : [...base.mediaSlots],
    };
  });

  return {
    recipe,
    variant,
    beats,
    ownerName: `${recipe.ownerName[locale]}${variant.ownerNameSuffix[locale]}`,
    ownerDescription: variant.ownerDescription[locale] || recipe.ownerDescription[locale],
    hookStrategy: variant.hookStrategy ?? recipe.hookStrategy,
    proofStrategy: variant.proofStrategy ?? recipe.proofStrategy,
    offerStrategy: variant.offerStrategy ?? recipe.offerStrategy,
    ctaStrategy: variant.ctaStrategy ?? recipe.ctaStrategy,
    transitionStyle: variant.transitionStyle ?? recipe.transitionStyle,
  };
}
