import type { Project } from '@shared/domain/project'
import type { VisualPlan } from '@features/visual/visualPlan'
import type { AudioPlan } from '@features/audio/audioPlan'
import { validateVisualPlan } from '@features/visual/visualPlan'
import { validateAudioPlan } from '@features/audio/audioPlan'

/**
 * Export gating (§6): "Descargar video" is enabled only when everything the
 * render needs provably exists. Each blocker carries a stable code AND the
 * owner-facing Spanish message, so the UI never invents copy and never leaks an
 * internal reason.
 *
 * Pure: filesystem checks are injected (`fileExists`), so every rule is
 * unit-testable, and main/renderer cannot drift on what "ready" means.
 */

export type RenderBlockerCode =
  | 'no-project'
  | 'no-creative'
  | 'invalid-visual-plan'
  | 'invalid-audio-plan'
  | 'missing-media'
  | 'missing-audio'
  | 'render-active'

export interface RenderBlocker {
  code: RenderBlockerCode
  /** Owner-facing Spanish message describing the exact blocking condition. */
  message: string
}

export interface RenderReadiness {
  ready: boolean
  blockers: RenderBlocker[]
}

export interface ReadinessInput {
  project: Project | null | undefined
  /** Built plans; pass null when compilation itself failed. */
  visualPlan: VisualPlan | null
  audioPlan: AudioPlan | null
  /** True when a render is already active for this project. */
  renderActive: boolean
  /** Does this project-relative managed file exist right now? */
  fileExists: (relPath: string) => boolean
}

export function evaluateRenderReadiness(input: ReadinessInput): RenderReadiness {
  const blockers: RenderBlocker[] = []
  const { project, visualPlan, audioPlan } = input

  if (!project) {
    return {
      ready: false,
      blockers: [{ code: 'no-project', message: 'No encontramos el proyecto.' }],
    }
  }

  if (!project.creative) {
    blockers.push({
      code: 'no-creative',
      message: 'Primero crea tu comercial: descríbelo y elige un estilo.',
    })
  }

  if (project.creative && (!visualPlan || !validateVisualPlan(visualPlan).ok)) {
    blockers.push({
      code: 'invalid-visual-plan',
      message: 'El plan del comercial no es válido. Vuelve a generar el comercial.',
    })
  }

  if (project.creative && (!audioPlan || !validateAudioPlan(audioPlan).ok)) {
    blockers.push({
      code: 'invalid-audio-plan',
      message: 'El plan de audio no es válido. Vuelve a generar el comercial.',
    })
  }

  // Every media asset the picture actually uses must resolve to a real file.
  if (visualPlan) {
    const usedIds = new Set(visualPlan.scenes.flatMap((s) => s.media.map((m) => m.assetId)))
    const byId = new Map(project.media.map((m) => [m.id, m]))
    const missing: string[] = []
    for (const id of usedIds) {
      const asset = byId.get(id)
      if (!asset || !asset.valid || !input.fileExists(asset.relPath)) {
        missing.push(asset?.originalName ?? id)
      }
    }
    if (missing.length > 0) {
      blockers.push({
        code: 'missing-media',
        message: `Falta material del comercial: ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? '…' : ''}. Vuelve a agregarlo o genera el comercial de nuevo.`,
      })
    }
  }

  // A SELECTED-but-missing audio track blocks — silence by omission is a lie.
  // A plan that is silent BY CHOICE (nothing selected) is a valid state and
  // does not block (§6): audioPlan.silent with no missingTracks.
  if (audioPlan && audioPlan.missingTracks.length > 0) {
    const roles = audioPlan.missingTracks
      .map((t) => (t.role === 'music' ? 'la música' : t.role === 'narration' ? 'la narración' : 'un sonido'))
      .join(' y ')
    blockers.push({
      code: 'missing-audio',
      message: `No encontramos ${roles} seleccionada. Elige otro archivo o quítalo antes de exportar.`,
    })
  }

  // Audio tracks that DO resolve in the plan must still exist on disk now.
  if (audioPlan && project) {
    const audioIds = [
      ...(audioPlan.music ? [audioPlan.music.assetId] : []),
      ...audioPlan.narration.map((t) => t.assetId),
      ...audioPlan.effects.map((t) => t.assetId),
    ]
    const byId = new Map(project.media.map((m) => [m.id, m]))
    const gone = audioIds.filter((id) => {
      const asset = byId.get(id)
      return !asset || !input.fileExists(asset.relPath)
    })
    if (gone.length > 0 && !blockers.some((b) => b.code === 'missing-audio')) {
      blockers.push({
        code: 'missing-audio',
        message: 'El archivo de audio seleccionado ya no está disponible. Elige otro o quítalo antes de exportar.',
      })
    }
  }

  if (input.renderActive) {
    blockers.push({
      code: 'render-active',
      message: 'Ya hay una exportación en curso para este proyecto. Espera a que termine o cancélala.',
    })
  }

  return { ready: blockers.length === 0, blockers }
}
