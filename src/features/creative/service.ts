import type { Project, CreativeSelection } from '@shared/domain/project'
import {
  developConcepts,
  developAllConcepts,
  compileCreativePlan,
  canonicalStringify,
  fnv1aHex,
  type CreativePlan,
  type CommercialRenderPlan,
} from '@jorge-engines/northstar-creative'
import { projectToDirectorInput, projectToContent } from './projectToCreativeInput'
import {
  creativePlanToRenderer,
  type SowyvidRendererPlan,
  type AssetResolver,
} from './creativePlanToRenderer'

/**
 * The narrow public surface the SowyVid application uses to drive the creative
 * engine. UI and IPC call these functions; they never touch the engine core
 * directly, and no engine business logic lives in components.
 *
 * Pipeline: Project → (ProjectToCreativeInputAdapter) → engine concepts →
 * compiled CommercialRenderPlan → (CreativePlanToRendererAdapter) → renderer plan.
 */

/** A full stable fingerprint of the normalized engine input (all fields). */
function inputFingerprint(project: Project): string {
  return fnv1aHex(canonicalStringify(projectToDirectorInput(project)))
}

/** Develop N ranked creative concepts for a project (different families first). */
export function developProjectConcepts(project: Project, count: number): CreativePlan[] {
  return developConcepts(projectToDirectorInput(project), count)
}

/** Resolve a specific concept deterministically from the project's inputs. */
export function findProjectConcept(project: Project, conceptId: string): CreativePlan | undefined {
  return developAllConcepts(projectToDirectorInput(project)).find((p) => p.conceptId === conceptId)
}

export interface CompiledConcept {
  renderPlan: CommercialRenderPlan
  selection: CreativeSelection
}

/**
 * Compile the chosen concept into a validated, renderer-neutral render plan and
 * the reproducible selection to persist with the project.
 */
export function compileProjectConcept(project: Project, conceptId: string): CompiledConcept {
  const plan = findProjectConcept(project, conceptId)
  if (!plan) throw new Error(`Concept not found for this project: ${conceptId}`)

  const renderPlan = compileCreativePlan({
    plan,
    content: projectToContent(project),
    projectId: project.id,
  })

  const selection: CreativeSelection = {
    engineVersion: plan.engineVersion,
    family: plan.family,
    variantId: plan.variantId,
    conceptId: plan.conceptId,
    seed: plan.seed,
    inputFingerprint: inputFingerprint(project),
    targetDurationSec: plan.targetDurationSec,
  }

  return { renderPlan, selection }
}

/** Build the SowyVid renderer plan from a compiled render plan. */
export function toRendererPlan(
  renderPlan: CommercialRenderPlan,
  resolveAsset?: AssetResolver,
): SowyvidRendererPlan {
  return creativePlanToRenderer(renderPlan, resolveAsset)
}

/** A resolver that maps engine media IDs back to the project's managed relPaths. */
export function projectAssetResolver(project: Project): AssetResolver {
  const byId = new Map(project.media.map((m) => [m.id, m.relPath]))
  return (assetId) => byId.get(assetId) ?? null
}
