import type { MediaRecord } from './contracts.js'

const KEYWORDS: Array<[string, MediaRecord['group']]> = [
  ['logo','logo'],['marca','logo'],['brand','logo'],['ícone','logo'],['icone','logo'],
  ['before','before'],['antes','before'],['after','after'],['despues','after'],['después','after'],['depois','after'],
  ['team','team'],['equipo','team'],['equipe','team'],['staff','team'],['empleado','team'],['funcionario','team'],
  ['people','people'],['cliente','people'],['customer','people'],['gente','people'],['pessoa','people'],
  ['store','store'],['tienda','store'],['loja','store'],['shop','store'],['fachada','store'],['mostrador','store'],['counter','store'],
  ['product','products'],['producto','products'],['produto','products'],['item','products'],['menu','products'],['menú','products'],['servicio','products'],['service','products'],['serviço','products'],
  ['music','music'],['musica','music'],['música','music'],['song','music'],['cancion','music'],['canção','music'],
  ['voice','voice'],['voz','voice'],['narration','voice'],['narracion','voice'],['narração','voice'],
]
const normalize = (value: string): string => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
export function classifyMedia(input: { originalName: string; kind: MediaRecord['kind']; width?: number | null; height?: number | null; explicitGroup?: MediaRecord['group'] }): Pick<MediaRecord, 'group' | 'classificationConfidence' | 'classificationMethod'> {
  if (input.explicitGroup) return { group: input.explicitGroup, classificationConfidence: 1, classificationMethod: 'explicit' }
  const name = normalize(input.originalName)
  const scores = new Map<MediaRecord['group'], number>()
  for (const [keywordRaw, group] of KEYWORDS) {
    const keyword = normalize(keywordRaw)
    if (name.includes(keyword)) scores.set(group, (scores.get(group) ?? 0) + Math.max(1, keyword.length / 5))
  }
  if (scores.size > 0) {
    const ranked = [...scores.entries()].sort((a,b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    return { group: ranked[0]![0], classificationConfidence: Math.min(0.95, 0.65 + ranked[0]![1] * 0.05), classificationMethod: 'filename' }
  }
  if ((input.kind === 'image' || input.kind === 'logo') && input.width && input.height && input.width === input.height && input.width <= 1024) return { group: 'logo', classificationConfidence: 0.5, classificationMethod: 'shape' }
  if (input.kind === 'audio') return { group: 'music', classificationConfidence: 0.25, classificationMethod: 'default' }
  return { group: 'unknown', classificationConfidence: 0, classificationMethod: 'default' }
}
