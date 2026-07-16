import { CatalogItemSchema, type CatalogItem } from './contracts.js'

export interface CatalogContext { industry?: string; tone?: string; subjectType?: CatalogItem['subjectType']; preferTags?: string[]; orientation?: CatalogItem['orientation'] }
export interface CatalogScene { role: string }
const hash = (value: string): number => { let h = 0x811c9dc5; for (let i=0;i<value.length;i++){ h ^= value.charCodeAt(i); h = Math.imul(h,0x01000193) }; return h >>> 0 }
function eligible(context: CatalogContext, catalog: CatalogItem[]): CatalogItem[] {
  return catalog.map((item) => CatalogItemSchema.parse(item)).filter((item) => item.license.commercialUseAllowed && (item.industry === 'generic' || !context.industry || item.industry === context.industry))
}
function score(item: CatalogItem, scene: CatalogScene, context: CatalogContext, seed: string): number {
  let value = item.qualityScore
  if (context.industry && item.industry === context.industry) value += 0.25
  if (item.roles.includes(scene.role)) value += 0.3
  if (context.tone && item.tones.includes(context.tone)) value += 0.18
  if (context.subjectType && item.subjectType === context.subjectType) value += 0.2
  if (context.orientation && item.orientation === context.orientation) value += 0.2
  if (context.preferTags?.some((tag) => item.tags.includes(tag))) value += 0.5
  return value + (hash(`${seed}|${item.id}|${scene.role}`) % 5) / 100
}
export function selectCatalogItem(scene: CatalogScene, context: CatalogContext, seed: string, catalog: CatalogItem[]): CatalogItem | null {
  return eligible(context, catalog).map((item) => ({ item, score: score(item,scene,context,seed) })).sort((a,b) => b.score-a.score || a.item.id.localeCompare(b.item.id))[0]?.item ?? null
}
export function planCatalogItems(scenes: CatalogScene[], context: CatalogContext, seed: string, catalog: CatalogItem[]): Array<CatalogItem | null> {
  let last: string | null = null
  return scenes.map((scene,index) => {
    const ranked = eligible(context,catalog).map((item) => ({ item, score: score(item,scene,context,`${seed}|${index}`) })).sort((a,b) => b.score-a.score || a.item.id.localeCompare(b.item.id))
    const picked = ranked.find((row) => row.item.id !== last)?.item ?? ranked[0]?.item ?? null
    if (picked) last = picked.id
    return picked
  })
}
export type MediaSource = 'user' | 'library' | 'catalog' | 'surface' | 'fallback'
export function resolveMediaSource(input: { hasUserAsset: boolean; hasLibraryAsset: boolean; catalogItem: CatalogItem | null; hasSurface: boolean }): MediaSource {
  if (input.hasUserAsset) return 'user'; if (input.hasLibraryAsset) return 'library'; if (input.catalogItem) return 'catalog'; if (input.hasSurface) return 'surface'; return 'fallback'
}
