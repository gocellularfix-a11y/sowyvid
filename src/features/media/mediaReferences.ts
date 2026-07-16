import type { Project, ProjectVersion } from '@shared/domain/project'
import type { MediaAsset } from '@shared/domain/media'
import { compileProjectConcept } from '@features/creative'

/**
 * Media-reference safety. Before deleting managed media, the app checks whether
 * it is still used (brand logo, the compiled creative plan, or a saved version)
 * so it is never silently removed out from under a plan. Isomorphic + pure
 * (the engine is isomorphic); the caller supplies project + versions.
 */

export interface MediaReference {
  kind: 'logo' | 'creative-plan' | 'project-version'
  /** Owner-facing Spanish label of where the media is used. */
  label: string
}

export function findMediaReferences(
  mediaId: string,
  opts: { project: Project; versions?: readonly ProjectVersion[] },
): MediaReference[] {
  const { project, versions = [] } = opts
  const refs: MediaReference[] = []

  if (project.brand.logoMediaId === mediaId) {
    refs.push({ kind: 'logo', label: 'el logo de tu marca' })
  }

  if (project.creative) {
    try {
      const { renderPlan } = compileProjectConcept(project, project.creative.conceptId)
      const used = renderPlan.scenes.some((s) => s.media.some((m) => m.assetId === mediaId))
      if (used) refs.push({ kind: 'creative-plan', label: 'tu comercial creado' })
    } catch {
      // The stored concept is no longer resolvable from current inputs — ignore.
    }
  }

  for (const version of versions) {
    if (
      version.snapshot.brand.logoMediaId === mediaId ||
      version.snapshot.media.some((m) => m.id === mediaId)
    ) {
      refs.push({ kind: 'project-version', label: `una versión guardada (${version.label})` })
      break
    }
  }

  return refs
}

/**
 * Flag media whose managed file is missing on disk (detected on project open).
 * `exists` is injected (project-relative path → boolean) so this stays pure and
 * testable; the node caller resolves against the project directory.
 */
export function markMissingMedia(
  media: readonly MediaAsset[],
  exists: (relPath: string) => boolean,
): MediaAsset[] {
  return media.map((m) =>
    exists(m.relPath) ? m : { ...m, valid: false, analysisError: m.analysisError ?? 'missing-managed-file' },
  )
}
