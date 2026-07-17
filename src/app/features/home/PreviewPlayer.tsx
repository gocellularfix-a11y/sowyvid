import { useMemo, useState } from 'react'
import { Player } from '@remotion/player'
import { CommercialComposition } from '@render/compositions/CommercialComposition'
import { visualPlanToCompositionProps } from '@render/remotionProps'
import { audioPlanToCompositionAudio, type AudioMixControls } from '@render/remotionAudio'
import type { VisualPlan } from '@features/visual/visualPlan'
import type { AudioPlan } from '@features/audio/audioPlan'
import type { MediaAsset } from '@shared/domain/media'
import type { TextLayoutOverride } from '@shared/domain/textLayout'
import { Button } from '../../ui/Button'
import { TextLayoutEditor } from './TextLayoutEditor'
import { ErrorBoundary } from '../../ErrorBoundary'
import { copy } from '../../content/copy'
import styles from './HomeWorkspace.module.css'

/**
 * Real Remotion <Player> preview. Consumes the FrameLogic VisualPlan and the
 * SoundWeave AudioPlan (via the SowyVid Remotion adapters) plus imported
 * MediaVault assets (through the controlled media protocol).
 *
 * The controls here are PLAYBACK-ONLY (master volume, narration monitor):
 * they modulate what THIS preview plays and never re-plan anything. The
 * commercial's real sound decisions — music choice, music volume, source
 * audio on/off and its volume — are PERSISTED settings edited in the step-4
 * sound section, so the export renders exactly what the preview played.
 */
export function PreviewPlayer({
  visualPlan,
  audioPlan,
  projectId,
  media,
  textLayouts = [],
  onTextLayoutsChange,
}: {
  visualPlan: VisualPlan
  audioPlan: AudioPlan | null
  projectId: string
  media: readonly MediaAsset[]
  textLayouts?: readonly TextLayoutOverride[]
  /** Present → the "Editar texto" editor is available (desktop app). */
  onTextLayoutsChange?: (next: TextLayoutOverride[]) => void
}): JSX.Element {
  const [masterVolume, setMasterVolume] = useState(1)
  const [narrationEnabled, setNarrationEnabled] = useState(true)
  const [editing, setEditing] = useState(false)

  const controls: AudioMixControls = useMemo(
    () => ({ masterVolume, narrationEnabled }),
    [masterVolume, narrationEnabled],
  )

  const audio = useMemo(
    () => (audioPlan ? audioPlanToCompositionAudio(audioPlan, controls) : null),
    [audioPlan, controls],
  )

  const props = useMemo(
    () => visualPlanToCompositionProps(visualPlan, projectId, media, { audio, textLayouts }),
    [visualPlan, projectId, media, audio, textLayouts],
  )

  const hasNarration = (audioPlan?.narration.length ?? 0) > 0
  const canEdit = Boolean(onTextLayoutsChange)

  if (editing && onTextLayoutsChange) {
    return (
      <ErrorBoundary>
        <TextLayoutEditor
          visualPlan={visualPlan}
          projectId={projectId}
          media={media}
          textLayouts={textLayouts}
          onChange={onTextLayoutsChange}
          onClose={() => setEditing(false)}
        />
      </ErrorBoundary>
    )
  }

  return (
    <ErrorBoundary>
      <div className={styles.playerWrap} data-testid="preview-player">
        <Player
          component={CommercialComposition}
          inputProps={props}
          durationInFrames={props.durationInFrames}
          fps={props.fps}
          compositionWidth={props.width}
          compositionHeight={props.height}
          style={{ width: '100%', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}
          controls
          loop
        />
      </div>
      {canEdit ? (
        <Button variant="secondary" block leftIcon="image" onClick={() => setEditing(true)} data-testid="edit-text">
          {copy.textEditor.edit}
        </Button>
      ) : null}

      {audio && audio.warnings.length > 0 ? (
        <div className={styles.audioWarning} role="status" data-testid="audio-warning">
          {audio.warnings.map((w) => (
            <p key={`${w.role}-${w.reason}`}>⚠ {w.message}</p>
          ))}
        </div>
      ) : null}

      <div className={styles.audioControls} data-testid="audio-controls">
        <label className={styles.audioControl}>
          <span>Volumen general</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={masterVolume}
            onChange={(e) => setMasterVolume(Number(e.target.value))}
            data-testid="master-volume"
            aria-label="Volumen general"
          />
        </label>

        <label className={styles.audioToggle}>
          <input
            type="checkbox"
            checked={narrationEnabled}
            onChange={(e) => setNarrationEnabled(e.target.checked)}
            disabled={!hasNarration}
            data-testid="narration-toggle"
          />
          <span>Narración</span>
        </label>
      </div>
    </ErrorBoundary>
  )
}
