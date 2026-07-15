import type { Template, SceneSlot } from '@shared/domain/template'

/**
 * Six genuinely distinct, functional templates. They differ in scene structure,
 * motion profile, typography, pacing, text limits, audio mood, and CTA behavior
 * — not just color. Each produces a valid commercial through the deterministic
 * engine. See docs/TEMPLATE-SYSTEM.md.
 */

const slot = (s: SceneSlot): SceneSlot => s

// ---------------------------------------------------------------- 1. Direct & fast
const directFast: Template = {
  id: 'direct-fast',
  version: 1,
  name: 'Directo y rápido',
  description: 'Enfocado en velocidad y resultados. Mensajes cortos y contundentes.',
  categories: ['phone-electronics', 'retail-product', 'local-service', 'other'],
  objectives: ['product-promotion', 'phone-electronics', 'limited-time-sale'],
  visualStyle: 'Alto contraste, tipografía grande, cortes rápidos.',
  motionProfile: 'bold-retail',
  energyDefault: 'energetic',
  sceneStructure: [
    slot({ type: 'intro', requiresMedia: false, optional: false, minDurationSec: 1.2, maxDurationSec: 2.5, textRoles: ['headline'], preferredMotion: 'none', transitionIn: 'fade' }),
    slot({ type: 'product', requiresMedia: true, optional: false, minDurationSec: 1.5, maxDurationSec: 3, textRoles: ['subhead'], preferredMotion: 'ken-burns-in', transitionIn: 'cut' }),
    slot({ type: 'feature', requiresMedia: true, optional: true, minDurationSec: 1.5, maxDurationSec: 3, textRoles: ['offer'], preferredMotion: 'ken-burns-in', transitionIn: 'cut' }),
    slot({ type: 'offer', requiresMedia: false, optional: true, minDurationSec: 1.5, maxDurationSec: 3, textRoles: ['offer', 'price'], preferredMotion: 'none', transitionIn: 'slide' }),
    slot({ type: 'cta', requiresMedia: false, optional: false, minDurationSec: 1.5, maxDurationSec: 3, textRoles: ['cta', 'business-name'], preferredMotion: 'none', transitionIn: 'zoom' }),
  ],
  durationRangeSec: { min: 8, max: 22 },
  supportedAspectRatios: ['9:16', '1:1', '4:5'],
  typography: { headlineWeight: 800, scale: 1.15, uppercaseHeadline: true },
  textLimits: { headlineMaxChars: 42, subheadMaxChars: 60, offerMaxChars: 34, ctaMaxChars: 28 },
  mediaRequirements: { minImages: 1, minClips: 0, recommendedTotal: 4 },
  audioMood: 'Percusión enérgica, ritmo alto.',
  platformCompatibility: ['instagram-reel', 'facebook-reel', 'tiktok', 'youtube-shorts', 'square'],
  fallbackBehavior: 'Sin fotos, usa escenas de texto con color de marca y mantiene el mensaje.',
}

// ------------------------------------------------------------- 2. Trust & quality
const trustQuality: Template = {
  id: 'trust-quality',
  version: 1,
  name: 'Confianza y calidad',
  description: 'Transmite profesionalismo y confianza con un ritmo calmado y estable.',
  categories: ['local-service', 'professional-services', 'health-beauty', 'automotive', 'other'],
  objectives: ['local-service', 'business-introduction', 'testimonial'],
  visualStyle: 'Composiciones estables, tipografía sobria, transiciones suaves.',
  motionProfile: 'calm-professional',
  energyDefault: 'calm',
  sceneStructure: [
    slot({ type: 'intro', requiresMedia: true, optional: false, minDurationSec: 2, maxDurationSec: 4, textRoles: ['business-name'], preferredMotion: 'ken-burns-in', transitionIn: 'fade' }),
    slot({ type: 'feature', requiresMedia: true, optional: false, minDurationSec: 2.5, maxDurationSec: 4.5, textRoles: ['headline'], preferredMotion: 'ken-burns-in', transitionIn: 'fade' }),
    slot({ type: 'feature', requiresMedia: true, optional: true, minDurationSec: 2.5, maxDurationSec: 4.5, textRoles: ['subhead'], preferredMotion: 'ken-burns-in', transitionIn: 'fade' }),
    slot({ type: 'cta', requiresMedia: false, optional: false, minDurationSec: 2.5, maxDurationSec: 4, textRoles: ['cta', 'business-name'], preferredMotion: 'none', transitionIn: 'fade' }),
  ],
  durationRangeSec: { min: 12, max: 26 },
  supportedAspectRatios: ['9:16', '1:1', '16:9', '4:5'],
  typography: { headlineWeight: 600, scale: 1, uppercaseHeadline: false },
  textLimits: { headlineMaxChars: 56, subheadMaxChars: 80, offerMaxChars: 40, ctaMaxChars: 34 },
  mediaRequirements: { minImages: 2, minClips: 0, recommendedTotal: 4 },
  audioMood: 'Piano/ambiente cálido, tranquilo.',
  platformCompatibility: ['instagram-reel', 'facebook-reel', 'instagram-feed', 'facebook-feed', 'youtube-shorts', 'landscape', 'square'],
  fallbackBehavior: 'Con poco material, alarga escenas disponibles manteniendo estabilidad.',
}

// -------------------------------------------------------------- 3. Before & after
const beforeAfter: Template = {
  id: 'before-after',
  version: 1,
  name: 'Antes y después',
  description: 'Muestra la transformación que obtiene el cliente con una comparación clara.',
  categories: ['local-service', 'health-beauty', 'automotive', 'phone-electronics', 'other'],
  objectives: ['before-after', 'local-service', 'testimonial'],
  visualStyle: 'Comparación antes/después, revelación controlada.',
  motionProfile: 'local-service-trust',
  energyDefault: 'balanced',
  sceneStructure: [
    slot({ type: 'intro', requiresMedia: false, optional: false, minDurationSec: 1.5, maxDurationSec: 3, textRoles: ['headline'], preferredMotion: 'none', transitionIn: 'fade' }),
    slot({ type: 'before-after', requiresMedia: true, optional: false, minDurationSec: 2, maxDurationSec: 3.5, textRoles: ['subhead'], preferredMotion: 'pan-left', transitionIn: 'wipe' }),
    slot({ type: 'before-after', requiresMedia: true, optional: false, minDurationSec: 2, maxDurationSec: 3.5, textRoles: ['offer'], preferredMotion: 'pan-right', transitionIn: 'wipe' }),
    slot({ type: 'cta', requiresMedia: false, optional: false, minDurationSec: 2, maxDurationSec: 3.5, textRoles: ['cta', 'business-name'], preferredMotion: 'none', transitionIn: 'slide' }),
  ],
  durationRangeSec: { min: 10, max: 22 },
  supportedAspectRatios: ['9:16', '1:1', '4:5'],
  typography: { headlineWeight: 700, scale: 1.05, uppercaseHeadline: false },
  textLimits: { headlineMaxChars: 48, subheadMaxChars: 40, offerMaxChars: 40, ctaMaxChars: 30 },
  mediaRequirements: { minImages: 2, minClips: 0, recommendedTotal: 2 },
  audioMood: 'Construcción con resolución satisfactoria.',
  platformCompatibility: ['instagram-reel', 'facebook-reel', 'tiktok', 'youtube-shorts', 'square'],
  fallbackBehavior: 'Con una sola imagen, usa transición de revelado sobre la misma foto.',
}

// -------------------------------------------------------------- 4. Limited-time sale
const limitedSale: Template = {
  id: 'limited-sale',
  version: 1,
  name: 'Oferta relámpago',
  description: 'Crea urgencia. Prioriza oferta y precio con energía alta.',
  categories: ['retail-product', 'phone-electronics', 'restaurant-food', 'other'],
  objectives: ['limited-time-sale', 'product-promotion', 'new-arrival'],
  visualStyle: 'Urgencia, precio destacado, movimiento marcado.',
  motionProfile: 'urgent-sale',
  energyDefault: 'energetic',
  sceneStructure: [
    slot({ type: 'intro', requiresMedia: false, optional: false, minDurationSec: 1, maxDurationSec: 2, textRoles: ['headline'], preferredMotion: 'none', transitionIn: 'zoom' }),
    slot({ type: 'product', requiresMedia: true, optional: false, minDurationSec: 1.2, maxDurationSec: 2.5, textRoles: ['subhead'], preferredMotion: 'ken-burns-in', transitionIn: 'cut' }),
    slot({ type: 'offer', requiresMedia: false, optional: false, minDurationSec: 1.5, maxDurationSec: 3, textRoles: ['offer', 'price'], preferredMotion: 'none', transitionIn: 'zoom' }),
    slot({ type: 'product', requiresMedia: true, optional: true, minDurationSec: 1.2, maxDurationSec: 2.5, textRoles: ['price'], preferredMotion: 'ken-burns-out', transitionIn: 'cut' }),
    slot({ type: 'cta', requiresMedia: false, optional: false, minDurationSec: 1.5, maxDurationSec: 3, textRoles: ['cta'], preferredMotion: 'none', transitionIn: 'slide' }),
  ],
  durationRangeSec: { min: 7, max: 18 },
  supportedAspectRatios: ['9:16', '1:1'],
  typography: { headlineWeight: 800, scale: 1.25, uppercaseHeadline: true },
  textLimits: { headlineMaxChars: 36, subheadMaxChars: 48, offerMaxChars: 28, ctaMaxChars: 24 },
  mediaRequirements: { minImages: 1, minClips: 0, recommendedTotal: 3 },
  audioMood: 'Beat intenso con acentos.',
  platformCompatibility: ['instagram-reel', 'facebook-reel', 'tiktok', 'youtube-shorts', 'square'],
  fallbackBehavior: 'Sin material, la oferta y el precio dominan con fondo de marca.',
}

// ------------------------------------------------------------- 5. Food showcase
const foodShowcase: Template = {
  id: 'food-showcase',
  version: 1,
  name: 'Sabor que enamora',
  description: 'Para restaurantes y comida. Enfoque apetitoso con ritmo cálido.',
  categories: ['restaurant-food', 'retail-product', 'other'],
  objectives: ['restaurant-food', 'new-arrival', 'product-promotion'],
  visualStyle: 'Encuadres apetitosos, movimiento selectivo, transiciones suaves.',
  motionProfile: 'food-showcase',
  energyDefault: 'balanced',
  sceneStructure: [
    slot({ type: 'intro', requiresMedia: true, optional: false, minDurationSec: 1.8, maxDurationSec: 3.5, textRoles: ['business-name'], preferredMotion: 'ken-burns-in', transitionIn: 'fade' }),
    slot({ type: 'product', requiresMedia: true, optional: false, minDurationSec: 2, maxDurationSec: 3.5, textRoles: ['headline'], preferredMotion: 'ken-burns-in', transitionIn: 'fade' }),
    slot({ type: 'product', requiresMedia: true, optional: true, minDurationSec: 2, maxDurationSec: 3.5, textRoles: ['offer'], preferredMotion: 'ken-burns-out', transitionIn: 'fade' }),
    slot({ type: 'cta', requiresMedia: false, optional: false, minDurationSec: 2, maxDurationSec: 3.5, textRoles: ['cta', 'business-name'], preferredMotion: 'none', transitionIn: 'fade' }),
  ],
  durationRangeSec: { min: 10, max: 24 },
  supportedAspectRatios: ['9:16', '1:1', '4:5'],
  typography: { headlineWeight: 700, scale: 1.05, uppercaseHeadline: false },
  textLimits: { headlineMaxChars: 50, subheadMaxChars: 70, offerMaxChars: 36, ctaMaxChars: 30 },
  mediaRequirements: { minImages: 2, minClips: 0, recommendedTotal: 4 },
  audioMood: 'Cálido, acogedor, ritmo medio.',
  platformCompatibility: ['instagram-reel', 'facebook-reel', 'tiktok', 'instagram-feed', 'youtube-shorts', 'square'],
  fallbackBehavior: 'Prioriza las mejores fotos; si faltan, alarga las disponibles.',
}

// ------------------------------------------------------------- 6. Product hero
const productHero: Template = {
  id: 'product-hero',
  version: 1,
  name: 'Producto estelar',
  description: 'Presentación premium de un producto con revelaciones limpias.',
  categories: ['phone-electronics', 'retail-product', 'automotive', 'other'],
  objectives: ['product-promotion', 'new-arrival', 'phone-electronics'],
  visualStyle: 'Premium, limpio, foco en el producto, tipografía nítida.',
  motionProfile: 'product-hero',
  energyDefault: 'balanced',
  sceneStructure: [
    slot({ type: 'intro', requiresMedia: false, optional: false, minDurationSec: 1.5, maxDurationSec: 3, textRoles: ['headline'], preferredMotion: 'none', transitionIn: 'fade' }),
    slot({ type: 'product', requiresMedia: true, optional: false, minDurationSec: 2, maxDurationSec: 4, textRoles: ['subhead'], preferredMotion: 'ken-burns-in', transitionIn: 'slide' }),
    slot({ type: 'feature', requiresMedia: true, optional: true, minDurationSec: 2, maxDurationSec: 4, textRoles: ['offer'], preferredMotion: 'ken-burns-out', transitionIn: 'slide' }),
    slot({ type: 'offer', requiresMedia: false, optional: true, minDurationSec: 1.5, maxDurationSec: 3, textRoles: ['price'], preferredMotion: 'none', transitionIn: 'fade' }),
    slot({ type: 'cta', requiresMedia: false, optional: false, minDurationSec: 2, maxDurationSec: 3.5, textRoles: ['cta', 'business-name'], preferredMotion: 'none', transitionIn: 'zoom' }),
  ],
  durationRangeSec: { min: 10, max: 24 },
  supportedAspectRatios: ['9:16', '1:1', '16:9', '4:5'],
  typography: { headlineWeight: 700, scale: 1.1, uppercaseHeadline: false },
  textLimits: { headlineMaxChars: 46, subheadMaxChars: 64, offerMaxChars: 34, ctaMaxChars: 30 },
  mediaRequirements: { minImages: 1, minClips: 0, recommendedTotal: 3 },
  audioMood: 'Elegante, moderno, con brillo.',
  platformCompatibility: ['instagram-reel', 'facebook-reel', 'tiktok', 'instagram-feed', 'facebook-feed', 'youtube-shorts', 'landscape', 'square'],
  fallbackBehavior: 'Con una imagen, la usa como héroe y complementa con escenas de texto.',
}

export const BUILTIN_TEMPLATES: Template[] = [
  directFast,
  trustQuality,
  beforeAfter,
  limitedSale,
  foodShowcase,
  productHero,
]
