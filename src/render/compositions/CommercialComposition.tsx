import { AbsoluteFill, Img, Sequence, useCurrentFrame, interpolate } from 'remotion'
import type { CommercialCompositionProps, CompositionScene } from '../remotionProps'

/**
 * The SowyVid commercial composition. Renders a VisualPlan (via composition
 * props) with imported media, text layers, motion, and transitions. Media is
 * loaded through the controlled `sowyvid-media://` protocol; missing media draws
 * a safe placeholder rather than failing. Used by the Remotion <Player> preview.
 */

const DARK = '#0a0a0f'

function sceneBackground(scene: CompositionScene, colors: string[]): string {
  if (scene.background === 'brand-gradient') {
    const a = colors[0] ?? '#7c5cff'
    const b = colors[1] ?? DARK
    return `linear-gradient(160deg, ${a} 0%, ${b} 100%)`
  }
  if (scene.background === 'brand-solid') return colors[0] ?? '#7c5cff'
  return `radial-gradient(120% 90% at 50% 30%, #16161f 0%, ${DARK} 70%)`
}

function SceneView({
  scene,
  width,
  zoomStart,
  zoomEnd,
}: {
  scene: CompositionScene
  width: number
  zoomStart: number
  zoomEnd: number
}): JSX.Element {
  const frame = useCurrentFrame()
  const opacity = interpolate(frame, [0, Math.max(1, scene.transitionFrames)], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const scale = interpolate(frame, [0, scene.durationInFrames], [zoomStart, zoomEnd], {
    extrapolateRight: 'clamp',
  })
  const primary = scene.media.find((m) => !m.missing)
  const objectPosition =
    scene.focal === 'top' ? 'center top' : scene.focal === 'bottom' ? 'center bottom' : 'center'

  const tf = scene.textFrame
  const headlineSize = Math.round(width * (scene.emphasis === 'cta' ? 0.07 : 0.06))
  const bodySize = Math.round(width * 0.032)

  return (
    <AbsoluteFill style={{ opacity, background: sceneBackground(scene, []) }}>
      {primary ? (
        <AbsoluteFill style={{ transform: `scale(${scale})` }}>
          <Img
            src={primary.url}
            style={{
              width: '100%',
              height: '100%',
              objectFit: scene.mediaFit === 'contain' ? 'contain' : 'cover',
              objectPosition,
            }}
          />
          <AbsoluteFill style={{ background: 'linear-gradient(180deg, transparent 40%, rgba(0,0,0,0.65) 100%)' }} />
        </AbsoluteFill>
      ) : null}

      <AbsoluteFill
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: tf.justifyContent,
          alignItems: tf.alignItems,
          textAlign: tf.textAlign,
          paddingTop: tf.paddingTop,
          paddingRight: tf.paddingRight,
          paddingBottom: tf.paddingBottom,
          paddingLeft: tf.paddingLeft,
        }}
      >
        <div style={{ maxWidth: tf.maxWidth, transform: `translateY(${tf.translateYPercent}%)` }}>
          {scene.copy.kicker ? (
            <div style={{ color: '#c9b8ff', fontSize: Math.round(width * 0.03), fontWeight: 600, marginBottom: 8 }}>
              {scene.copy.kicker}
            </div>
          ) : null}
          <div
            style={{
              color: '#fff',
              fontSize: headlineSize,
              fontWeight: 800,
              lineHeight: 1.05,
              textShadow: '0 2px 24px rgba(0,0,0,0.5)',
            }}
          >
            {scene.copy.headline}
          </div>
          {scene.copy.body ? (
            <div style={{ color: '#eee', fontSize: bodySize, marginTop: 12, lineHeight: 1.3 }}>
              {scene.copy.body}
            </div>
          ) : null}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  )
}

export function CommercialComposition(props: CommercialCompositionProps): JSX.Element {
  const { scenes, width, brandColors, motion } = props
  return (
    <AbsoluteFill style={{ background: DARK, fontFamily: 'Inter, Segoe UI, sans-serif' }}>
      {scenes.map((scene) => (
        <Sequence key={scene.id} from={scene.from} durationInFrames={scene.durationInFrames}>
          <AbsoluteFill style={{ background: sceneBackground(scene, brandColors) }}>
            <SceneView
              scene={scene}
              width={width}
              zoomStart={motion.zoomStart}
              zoomEnd={motion.zoomEnd}
            />
          </AbsoluteFill>
        </Sequence>
      ))}
    </AbsoluteFill>
  )
}
