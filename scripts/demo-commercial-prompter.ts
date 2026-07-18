import { buildCommercialPlan } from '../src/features/prompter'
import { sanitizeCreativeRequest } from '../src/features/prompter'
import type { CommercialPlan } from '../src/shared/domain/commercialPlan'

/**
 * `npm run demo:commercial-prompter`
 *
 * Prints the two Samsung acceptance scenarios so the fact-safe Commercial
 * Prompter is inspectable end to end WITHOUT any AI or network. It shows the
 * accepted facts, missing facts, selected angle, narration, overlays,
 * storyboard, external-video recommendations, provider-neutral prompts and
 * warnings. Deterministic clock so the output is stable.
 */

const NOW = '2026-07-17T00:00:00.000Z'

function line(char = '─', n = 72): string {
  return char.repeat(n)
}

function printPlan(title: string, plan: CommercialPlan): void {
  console.log('\n' + line('═'))
  console.log(title)
  console.log(line('═'))
  console.log(`Producto detectado : ${plan.product.displayName}  (${plan.product.category})`)
  console.log(`Objetivo           : ${plan.objective}`)
  console.log(`Enfoque            : ${plan.selectedAngle}`)
  console.log(`Audiencia          : ${plan.targetAudience}`)
  console.log(`Duración objetivo  : ${plan.durationTarget}s`)
  console.log(`Validación         : ${plan.validationStatus}   (generado por: ${plan.generatedBy})`)

  console.log('\nHECHOS ACEPTADOS (claimable):')
  if (plan.knownFacts.length === 0) console.log('  (ninguno — el dueño no dio datos)')
  for (const f of plan.knownFacts) console.log(`  • ${f.label}: ${f.value}   [${f.source}]`)

  console.log('\nINFORMACIÓN POR CONFIRMAR (missing):')
  for (const m of plan.missingFacts) console.log(`  • ${m.label}  (${m.importance})  → ${m.prompt}`)

  console.log('\nSUPUESTOS GENÉRICOS (nunca son specs):')
  for (const a of plan.assumptions) console.log(`  • ${a}`)

  console.log('\nNARRACIÓN + TEXTO EN PANTALLA:')
  for (const s of plan.narrationScenes) {
    const facts = s.sourceFactKeys.length ? `  ⟵ ${s.sourceFactKeys.join(', ')}` : ''
    console.log(`  [${s.role}] ${s.targetDurationSec}s`)
    console.log(`     voz     : ${s.spokenText}${facts}`)
    console.log(`     pantalla: ${s.overlayText}`)
  }

  console.log('\nSTORYBOARD:')
  for (const b of plan.storyboardScenes) {
    const gen = b.mediaPlan === 'generated-video' ? `  ★ VIDEO EXTERNO: ${b.generationReason}` : ''
    console.log(`  ${b.order + 1}. [${b.role}] ${b.mediaPlan}${gen}`)
  }

  const gen = plan.storyboardScenes.filter((s) => s.mediaPlan === 'generated-video')
  console.log(`\nCLIPS EXTERNOS SUGERIDOS: ${gen.length} (máximo 2)`)
  for (const p of plan.videoPrompts) {
    console.log(`  escena ${p.sceneId}  ~${p.durationSec}s  audio=${p.audio}  aspect=${p.aspect}`)
    console.log(`     prompt   : ${p.prompt}`)
    console.log(`     prohibido: ${p.negativePrompt}`)
  }

  console.log('\nOFERTA:', plan.offer || '(sin oferta — no hubo precio/promoción)')
  console.log('CTA   :', plan.cta)

  console.log('\nADVERTENCIAS:')
  if (plan.warnings.length === 0) console.log('  (ninguna)')
  for (const w of plan.warnings) console.log(`  ⚠ ${w}`)

  console.log('\nCONTEXTO ENVIADO A AI (privacy preview — solo texto):')
  console.log('  ' + JSON.stringify(sanitizeCreativeRequest(plan)))
}

const vague = buildCommercialPlan({ text: 'Quiero promocionar un Samsung A16.', locale: 'es' }, { now: NOW })
printPlan('ESCENARIO 1 — solicitud vaga', vague)

const complete = buildCommercialPlan(
  { text: 'Quiero promocionar un Samsung A16 nuevo de 128 GB por $179. Incluye case y vidrio. Disponible hoy en Go Cellular.', locale: 'es' },
  { now: NOW },
)
printPlan('ESCENARIO 2 — solicitud completa', complete)

console.log('\n' + line('═'))
console.log('Fin de la demo. Sin AI, sin red, sin Vidu — 100% determinista.')
console.log(line('═') + '\n')
