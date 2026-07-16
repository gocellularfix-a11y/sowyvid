import { useMemo, useState } from 'react'
import { Player } from '@remotion/player'
import { CommercialComposition } from '@render/compositions/CommercialComposition'
import { visualPlanToCompositionProps } from '@render/remotionProps'
import { audioPlanToCompositionAudio, type AudioMixControls } from '@render/remotionAudio'
import type { VisualPlan } from '@features/visual/visualPlan'
import type { AudioPlan } from '@features/audio/audioPlan'
import type { MediaAsset } from '@shared/domain/media'
import { ErrorBoundary } from '../../ErrorBoundary'
import styles from './HomeWorkspace.module.css'

/**
 * Real Remotion <Player> preview. Consumes the FrameLogic VisualPlan and the
 * SoundWeave AudioPlan (via the SowyVid Remotion adapters) plus imported
 * MediaVault assets (through the controlled media protocol).
 *
 * The controls here are PLAYBACK controls: they modulate an existing plan and
 * never re-plan anything — SoundWeave owns every timing decision. Missing audio
 * shows a visible warning but must never break the preview.
 */
export function PreviewPlayer({
  visualPlan,
  audioPlan,
  projectId,
  media,
}: {
  visualPlan: VisualPlan
  audioPlan: AudioPlan | null
  projectId: string
  media: readonly MediaAsset[]
}): JSX.Element {
  const [masterVolume, setMasterVolume] = useState(1)
  const [musicVolume, setMusicVolume] = useState<number | null>(null)
  const [narrationEnabled, setNarrationEnabled] = useState(true)
  const [sourceAudioEnabled, setSourceAudioEnabled] = useState<boolean | null>(null)

  const controls: AudioMixControls = useMemo(
    () => ({ masterVolume, musicVolume, narrationEnabled, sourceAudioEnabled }),
    [masterVolume, musicVolume, narrationEnabled, sourceAudioEnabled],
  )

  const audio = useMemo(
    () => (audioPlan ? audioPlanToCompositionAudio(audioPlan, controls) : null),
    [audioPlan, controls],
  )

  const props = useMemo(
    () => visualPlanToCompositionProps(visualPlan, projectId, media, { audio }),
    [visualPlan, projectId, media, audio],
  )

  const hasMusic = Boolean(audio?.music)
  const hasNarration = (audioPlan?.narration.length ?? 0) > 0

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

        <label className={styles.audioControl}>
          <span>Volumen de música</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={musicVolume ?? audioPlan?.music?.volume ?? 0}
            onChange={(e) => setMusicVolume(Number(e.target.value))}
            disabled={!hasMusic}
            data-testid="music-volume"
            aria-label="Volumen de música"
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

        <label className={styles.audioToggle}>
          <input
            type="checkbox"
            checked={sourceAudioEnabled ?? audioPlan?.sourceAudio.enabled ?? false}
            onChange={(e) => setSourceAudioEnabled(e.target.checked)}
            data-testid="source-audio-toggle"
          />
          <span>Audio de mis videos</span>
        </label>
      </div>
    </ErrorBoundary>
  )
}
