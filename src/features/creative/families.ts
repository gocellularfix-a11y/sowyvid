import { CREATIVE_FAMILIES, type CreativeFamily } from '@jorge-engines/northstar-creative'

/**
 * Spanish, owner-facing labels for the engine's creative families. Kept on the
 * app side so the engine stays brand/locale-neutral. A creative family is a
 * persuasive NARRATIVE structure — distinct from a visual template.
 */
const FAMILY_LABELS_ES: Record<CreativeFamily, { name: string; description: string }> = {
  problem_solution: {
    name: 'Problema y solución',
    description: 'Muestra un problema y cómo tu negocio lo resuelve.',
  },
  before_after: {
    name: 'Antes y después',
    description: 'Muestra la transformación que obtiene el cliente.',
  },
  fast_retail: {
    name: 'Venta directa',
    description: 'Rápido y enfocado en la oferta y el resultado.',
  },
  trust_craft: {
    name: 'Confianza y calidad',
    description: 'Transmite profesionalismo y confianza.',
  },
  social_native: {
    name: 'Estilo redes',
    description: 'Dinámico y pensado para redes sociales.',
  },
}

export interface CreativeFamilyInfo {
  id: CreativeFamily
  name: string
  description: string
}

export function listCreativeFamilies(): CreativeFamilyInfo[] {
  return CREATIVE_FAMILIES.map((id) => ({ id, ...FAMILY_LABELS_ES[id] }))
}
