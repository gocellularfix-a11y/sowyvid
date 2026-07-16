import { useMemo } from 'react'
import { Player } from '@remotion/player'
import { CommercialComposition } from '@render/compositions/CommercialComposition'
import { visualPlanToCompositionProps } from '@render/remotionProps'
import type { VisualPlan } from '@features/visual/visualPlan'
import type { MediaAsset } from '@shared/domain/media'
import { ErrorBoundary } from '../../ErrorBoundary'
import styles from './HomeWorkspace.module.css'

/**
 * Real Remotion <Player> preview. Consumes the FrameLogic VisualPlan (via the
 * SowyVid Remotion adapter) and imported MediaVault assets (through the
 * controlled media protocol). Play/pause/seek/duration come from the Player's
 * built-in controls; missing media draws a placeholder in-composition; an error
 * boundary keeps a preview failure from crashing the app.
 */
export function PreviewPlayer({
  visualPlan,
  projectId,
  media,
}: {
  visualPlan: VisualPlan
  projectId: string
  media: readonly MediaAsset[]
}): JSX.Element {
  const props = useMemo(
    () => visualPlanToCompositionProps(visualPlan, projectId, media),
    [visualPlan, projectId, media],
  )

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
    </ErrorBoundary>
  )
}
