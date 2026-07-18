import { nanoid } from 'nanoid'
import type {
  CommercialPlan,
  CommercialPlanRevision,
  ProductFact,
} from '@shared/domain/commercialPlan'
import { buildCommercialPlan } from './planBuilder'

/**
 * CommercialPlanRegenerator — a fact change regenerates only the AFFECTED
 * content. Because the deterministic build is a pure function of (request +
 * owner facts), we rebuild with the new facts and diff against the old plan:
 * scene ids are role-stable, so unchanged scenes keep their id (and thus their
 * manual text-layout overrides), and only removed scenes are reported as
 * dropped. Unrelated choices (angle when unaffected, structure) stay put.
 */

export interface RegenerateResult {
  plan: CommercialPlan
  revision: CommercialPlanRevision
}

function factsDiffer(a: readonly ProductFact[], b: readonly ProductFact[]): string[] {
  const byKeyA = new Map(a.map((f) => [f.key, f.value]))
  const byKeyB = new Map(b.map((f) => [f.key, f.value]))
  const keys = new Set([...byKeyA.keys(), ...byKeyB.keys()])
  return [...keys].filter((k) => byKeyA.get(k) !== byKeyB.get(k))
}

/** Which scene roles' spoken/overlay text changed between two plans (by id). */
function changedSections(oldPlan: CommercialPlan, next: CommercialPlan): string[] {
  const oldById = new Map(oldPlan.narrationScenes.map((s) => [s.sceneId, s]))
  const changed = new Set<string>()
  for (const s of next.narrationScenes) {
    const prev = oldById.get(s.sceneId)
    if (!prev || prev.spokenText !== s.spokenText || prev.overlayText !== s.overlayText) changed.add(s.role)
  }
  return [...changed]
}

export function regenerateForFacts(
  oldPlan: CommercialPlan,
  ownerFacts: readonly ProductFact[],
  now?: string,
): RegenerateResult {
  const next = buildCommercialPlan(oldPlan.request, {
    ownerFacts,
    factsAuthoritative: true, // the passed facts are the complete edited set
    id: oldPlan.id,
    now: now ?? new Date().toISOString(),
    generatedBy: oldPlan.generatedBy,
  })

  const changedFactKeys = factsDiffer(oldPlan.knownFacts, next.knownFacts)
  const regeneratedSections = changedSections(oldPlan, next)

  // Text-layout overrides live per (sceneId, role); a scene that no longer
  // exists in the new plan cannot keep its manual layout — report it rather than
  // silently discarding.
  const newSceneIds = new Set(next.storyboardScenes.map((s) => s.sceneId))
  const droppedLayoutKeys = oldPlan.storyboardScenes
    .filter((s) => !newSceneIds.has(s.sceneId))
    .map((s) => s.sceneId)

  return {
    plan: next,
    revision: {
      revisionId: `crev_${nanoid(10)}`,
      planId: oldPlan.id,
      changedFactKeys,
      regeneratedSections,
      droppedLayoutKeys,
      createdAt: next.updatedAt,
    },
  }
}

/**
 * Which of a project's text-layout overrides survive a plan change: keep those
 * whose scene still exists AND whose role is still rendered by that scene.
 */
export function surviveableLayoutSceneIds(next: CommercialPlan): Set<string> {
  return new Set(next.storyboardScenes.map((s) => s.sceneId))
}
