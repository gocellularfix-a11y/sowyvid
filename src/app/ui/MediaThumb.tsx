import { Icon } from './Icon'
import styles from './MediaThumb.module.css'

export type ThumbKind = 'repair' | 'technician' | 'storefront' | 'product' | 'generic'

interface MediaThumbProps {
  kind: ThumbKind
  /** Show a centered play affordance (video thumbnail). */
  play?: boolean
  /** Optional overlaid label, e.g. a shop sign. */
  overlayText?: string
  ratio?: '16:9' | '9:16' | '1:1' | 'auto'
  rounded?: boolean
  className?: string
}

/**
 * A fully-local, deterministic media placeholder used by the interface shell so
 * the UI can be evaluated visually from the first run without any remote URLs
 * or copyrighted assets. Real imported media replaces these in the media
 * pipeline (Phase 6). Each `kind` renders a distinct scene-evoking gradient.
 */
export function MediaThumb({
  kind,
  play = false,
  overlayText,
  ratio = '16:9',
  rounded = true,
  className,
}: MediaThumbProps): JSX.Element {
  const classes = [
    styles.thumb,
    styles[kind],
    rounded ? styles.rounded : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')
  const ratioStyle =
    ratio === 'auto' ? undefined : { aspectRatio: ratio.replace(':', ' / ') }
  return (
    <div className={classes} style={ratioStyle} role="img" aria-label={`Vista previa: ${kind}`}>
      <div className={styles.grain} aria-hidden="true" />
      {overlayText && <span className={styles.overlayText}>{overlayText}</span>}
      {play && (
        <span className={styles.play} aria-hidden="true">
          <Icon name="play" size={22} />
        </span>
      )}
    </div>
  )
}
