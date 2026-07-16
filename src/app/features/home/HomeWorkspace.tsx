import { useState } from 'react'
import { Icon } from '../../ui/Icon'
import { Button } from '../../ui/Button'
import { TextArea } from '../../ui/TextInput'
import { StepBadge } from '../../ui/Primitives'
import { MediaThumb, type ThumbKind } from '../../ui/MediaThumb'
import { useToast } from '../../ui/toastContext'
import { getBridge } from '../../bridge'
import { copy } from '../../content/copy'
import styles from './HomeWorkspace.module.css'

type GenState = 'idle' | 'generating' | 'ready'

const STYLE_THUMBS: Record<string, ThumbKind> = {
  direct: 'repair',
  trust: 'technician',
  'before-after': 'storefront',
}

/** Maps the three visible styles to Northstar creative families. */
const STYLE_FAMILY: Record<string, string> = {
  direct: 'fast_retail',
  trust: 'trust_craft',
  'before-after': 'before_after',
}

interface CommercialResult {
  scenes: number
  durationSec: number
}

export function HomeWorkspace(): JSX.Element {
  const toast = useToast()
  const [description, setDescription] = useState('')
  const [styleId, setStyleId] = useState<string>(copy.step3.styles[0].id)
  const [gen, setGen] = useState<GenState>('idle')
  const [result, setResult] = useState<CommercialResult | null>(null)

  const canGenerate = description.trim().length > 0

  const soon = () => toast.show(copy.common.unavailableHint, 'info')

  /**
   * Drives the REAL Northstar creative engine through the secure bridge:
   * create project → develop concepts → compile the selected style → persist.
   * In Electron this crosses IPC to the main process + SQLite; in browser
   * preview it runs the isomorphic engine in-memory. This is not yet a rendered
   * video — the Remotion renderer (FrameLogic phase) is still deferred.
   */
  const generate = async (): Promise<void> => {
    if (!canGenerate) {
      toast.show('Escribe primero qué quieres promocionar.', 'info')
      return
    }
    setGen('generating')
    try {
      const bridge = getBridge()
      const created = await bridge.projects.create({
        name: description.trim().slice(0, 60) || 'Comercial',
        brief: { productOrService: description.trim() },
      })
      if (!created.ok) throw new Error(created.error.message)
      const projectId = created.value.id

      const concepts = await bridge.engine.developConcepts({ projectId, count: 5 })
      if (!concepts.ok || concepts.value.length === 0) throw new Error('No concepts')

      const wantedFamily = STYLE_FAMILY[styleId]
      const chosen =
        concepts.value.find((c) => c.family === wantedFamily) ?? concepts.value[0]!

      const compiled = await bridge.engine.compile({ projectId, conceptId: chosen.conceptId })
      if (!compiled.ok) throw new Error(compiled.error.message)

      setResult({
        scenes: compiled.value.renderPlan.scenes.length,
        durationSec: Math.round(compiled.value.renderPlan.durationSec),
      })
      setGen('ready')
    } catch {
      setGen('idle')
      toast.show('No pudimos crear el comercial. Intenta de nuevo.', 'error')
    }
  }

  return (
    <section className={styles.workspace} aria-label="Crear comercial">
      <div className={styles.columns}>
        {/* ---------- Step 1 ---------- */}
        <div className={styles.col}>
          <div className={styles.stepHead}>
            <StepBadge n={copy.step1.n} />
            <div>
              <h2 className={styles.stepTitle}>{copy.step1.title}</h2>
            </div>
          </div>
          <p className={styles.stepSubtitle}>{copy.step1.subtitle}</p>
          <TextArea
            aria-label={copy.step1.title}
            placeholder={copy.step1.placeholder}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={280}
          />
          <Button block rightIcon="arrow-right" onClick={generate} disabled={!canGenerate}>
            {copy.step1.continue}
          </Button>
          <MediaThumb kind="product" ratio="auto" className={styles.heroPhone} />
        </div>

        {/* ---------- Step 2 ---------- */}
        <div className={styles.col}>
          <div className={styles.stepHead}>
            <StepBadge n={copy.step2.n} />
            <h2 className={styles.stepTitle}>{copy.step2.title}</h2>
          </div>
          <p className={styles.stepSubtitle}>{copy.step2.subtitle}</p>
          <button className={styles.dropzone} onClick={soon} type="button">
            <Icon name="upload-cloud" size={40} />
            <span className={styles.dropHint}>{copy.step2.dropzone}</span>
          </button>
          <div className={styles.sourceRow}>
            <button className={styles.sourceBtn} onClick={soon} type="button">
              <Icon name="folder" size={22} />
              <span>{copy.step2.sources.thisDevice}</span>
            </button>
            <button className={styles.sourceBtn} onClick={soon} type="button">
              <Icon name="phone" size={22} />
              <span>{copy.step2.sources.myPhone}</span>
            </button>
            <button className={styles.sourceBtn} onClick={soon} type="button">
              <Icon name="bookmark" size={22} />
              <span>{copy.step2.sources.saved}</span>
            </button>
          </div>
          <div className={styles.tip}>
            <Icon name="bulb" size={18} />
            <span>
              <span className={styles.tipLabel}>{copy.step2.tipLabel} </span>
              {copy.step2.tip}
            </span>
          </div>
        </div>

        {/* ---------- Step 3 ---------- */}
        <div className={styles.col}>
          <div className={styles.stepHead}>
            <StepBadge n={copy.step3.n} />
            <h2 className={styles.stepTitle}>{copy.step3.title}</h2>
          </div>
          <p className={styles.stepSubtitle}>{copy.step3.subtitle}</p>
          <div className={styles.styleList} role="radiogroup" aria-label={copy.step3.title}>
            {copy.step3.styles.map((option) => {
              const selected = option.id === styleId
              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={[styles.styleCard, selected ? styles.styleCardSelected : '']
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => setStyleId(option.id)}
                >
                  <MediaThumb
                    kind={STYLE_THUMBS[option.id] ?? 'generic'}
                    play
                    className={styles.styleThumb}
                  />
                  <div className={styles.styleMeta}>
                    <div className={styles.styleName}>{option.name}</div>
                    <div className={styles.styleDesc}>{option.description}</div>
                  </div>
                  <span className={[styles.radio, selected ? styles.radioOn : ''].join(' ')}>
                    {selected && <span className={styles.radioDot} />}
                  </span>
                </button>
              )
            })}
          </div>
          <Button variant="secondary" block onClick={generate}>
            {copy.step3.seeAll}
          </Button>
        </div>

        {/* ---------- Step 4 ---------- */}
        <div className={styles.col}>
          <div className={styles.stepHead}>
            <StepBadge n={copy.step4.n} />
            <h2 className={styles.stepTitle}>{copy.step4.title}</h2>
          </div>
          <p className={styles.stepSubtitle}>{copy.step4.subtitle}</p>

          {gen === 'idle' && (
            <div className={styles.previewEmpty}>
              <Icon name="play" size={28} />
              <strong>{copy.step4.notReadyTitle}</strong>
              <span>{copy.step4.notReadyBody}</span>
            </div>
          )}
          {gen === 'generating' && (
            <div className={styles.previewLoading}>
              <span className={styles.spinner} aria-hidden="true" />
              <span>Creando tu comercial…</span>
            </div>
          )}
          {gen === 'ready' && (
            <>
              <MediaThumb
                kind={STYLE_THUMBS[styleId] ?? 'generic'}
                play
                className={styles.preview}
              />
              {result && (
                <p className={styles.stepSubtitle} data-testid="commercial-summary">
                  Comercial creado: {result.scenes} escenas · {result.durationSec}s
                </p>
              )}
              <div className={styles.resultActions}>
                <Button block leftIcon="download" onClick={soon}>
                  {copy.step4.download}
                </Button>
                <Button variant="secondary" block leftIcon="refresh" onClick={generate}>
                  {copy.step4.createAnother}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>

      <TrustBar />
    </section>
  )
}

function TrustBar(): JSX.Element {
  return (
    <div className={styles.trustBar}>
      {copy.trust.map((item) => (
        <div className={styles.trustItem} key={item.title}>
          <span className={styles.trustIcon}>
            <Icon name={item.icon} size={20} />
          </span>
          <div>
            <div className={styles.trustTitle}>{item.title}</div>
            <div className={styles.trustBody}>{item.body}</div>
          </div>
        </div>
      ))}
    </div>
  )
}
