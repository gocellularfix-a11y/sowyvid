import { useEffect, useState } from 'react'
import { Icon } from '../../ui/Icon'
import { Button } from '../../ui/Button'
import { TextArea } from '../../ui/TextInput'
import { StepBadge } from '../../ui/Primitives'
import { MediaThumb, type ThumbKind } from '../../ui/MediaThumb'
import { useToast } from '../../ui/toastContext'
import { getBridge, isBrowserPreview } from '../../bridge'
import { tileImageUrl } from '../../mediaUrl'
import { PreviewPlayer } from './PreviewPlayer'
import { ExportPanel } from './ExportPanel'
import type { MediaAsset } from '@shared/domain/media'
import type { VisualPlan } from '@features/visual/visualPlan'
import type { AudioPlan } from '@features/audio/audioPlan'
import { copy } from '../../content/copy'
import styles from './HomeWorkspace.module.css'

const KIND_ICON = { image: 'image', logo: 'image', video: 'play', audio: 'monitor' } as const

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
  const [visualPlan, setVisualPlan] = useState<VisualPlan | null>(null)
  const [audioPlan, setAudioPlan] = useState<AudioPlan | null>(null)
  const [projectId, setProjectId] = useState<string | null>(null)
  const [media, setMedia] = useState<MediaAsset[]>([])
  const [importing, setImporting] = useState(false)

  const [musicId, setMusicId] = useState<string | null>(null)

  const canGenerate = description.trim().length > 0

  const soon = () => toast.show(copy.common.unavailableHint, 'info')

  /**
   * Recompile the persisted concept so the preview (and the export gate) see
   * the CURRENT media and music. Without this, music imported or selected after
   * generating never reached the plans on screen — the export used fresh plans
   * and sounded different from the preview.
   */
  const refreshPlans = async (id: string): Promise<void> => {
    const bridge = getBridge()
    const current = await bridge.projects.get(id)
    if (!current.ok || !current.value?.creative) return
    setMusicId(current.value.audio.musicId)
    const compiled = await bridge.engine.compile({
      projectId: id,
      conceptId: current.value.creative.conceptId,
    })
    if (!compiled.ok) return
    setResult({
      scenes: compiled.value.renderPlan.scenes.length,
      durationSec: Math.round(compiled.value.renderPlan.durationSec),
    })
    setVisualPlan(compiled.value.visualPlan)
    setAudioPlan(compiled.value.audioPlan)
    setGen('ready')
  }

  /**
   * Restore the owner's work on startup. Jorge exported a commercial, closed
   * the app, reopened it — and saw a blank step 4 with no history, because all
   * of this state lived only in React. The most recent project (the repository
   * lists by last update) is the owner's current work: restore its id, media,
   * brief and — when a concept was compiled — its plans, so the preview, the
   * export button and the export HISTORY are all visible again.
   */
  useEffect(() => {
    if (isBrowserPreview) return
    let cancelled = false
    void (async () => {
      const projects = await getBridge().projects.list()
      if (cancelled || !projects.ok || projects.value.length === 0) return
      const latest = projects.value[0]!
      setProjectId(latest.id)
      setMedia(latest.media)
      setMusicId(latest.audio.musicId)
      if (latest.brief.productOrService) setDescription(latest.brief.productOrService)
      if (latest.creative) await refreshPlans(latest.id)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  /** The owner picks (or removes) the commercial's music. Persisted, then replanned. */
  const onSelectMusic = async (nextId: string | null): Promise<void> => {
    if (!projectId) return
    const bridge = getBridge()
    const current = await bridge.projects.get(projectId)
    if (!current.ok || !current.value) return
    const saved = await bridge.projects.save({
      ...current.value,
      audio: { ...current.value.audio, musicId: nextId },
    })
    if (!saved.ok) {
      toast.show('No pudimos cambiar la música.', 'error')
      return
    }
    setMusicId(nextId)
    if (current.value.creative) await refreshPlans(projectId)
  }

  /** Ensure a draft project exists to attach media/brief to; returns its id. */
  const ensureProject = async (): Promise<string> => {
    if (projectId) return projectId
    const created = await getBridge().projects.create({
      name: description.trim().slice(0, 60) || 'Comercial',
      brief: { productOrService: description.trim() },
    })
    if (!created.ok) throw new Error(created.error.message)
    setProjectId(created.value.id)
    setMedia(created.value.media)
    return created.value.id
  }

  /** Import local files through MediaVault (Electron only). */
  const onImport = async (): Promise<void> => {
    if (isBrowserPreview) {
      toast.show('Agregar archivos está disponible en la app de escritorio.', 'info')
      return
    }
    setImporting(true)
    try {
      const id = await ensureProject()
      const res = await getBridge().media.import({ projectId: id })
      if (!res.ok) {
        toast.show('No pudimos agregar tus archivos.', 'error')
        return
      }
      if (res.value.canceled) return
      setMedia(res.value.project.media)
      setMusicId(res.value.project.audio.musicId)
      // New material (including auto-selected music) must reach the plans the
      // preview and the export gate actually use.
      if (res.value.project.creative) await refreshPlans(id)

      const outcomes = res.value.outcomes
      const count = (s: string) => outcomes.filter((o) => o.status === s).length
      const imported = count('imported')
      const dup = count('duplicate')
      const rejected = outcomes.length - imported - dup
      if (imported > 0) {
        toast.show(
          `${imported} archivo(s) agregado(s)${dup > 0 ? `, ${dup} ya estaban` : ''}.`,
          'success',
        )
      } else if (dup > 0 && rejected === 0) {
        toast.show('Ese material ya estaba agregado.', 'info')
      }
      if (rejected > 0) {
        toast.show(`${rejected} archivo(s) no compatibles o muy pesados.`, 'error')
      }
    } catch {
      toast.show('No pudimos agregar tus archivos.', 'error')
    } finally {
      setImporting(false)
    }
  }

  const onRemoveMedia = async (mediaId: string): Promise<void> => {
    if (!projectId) return
    const res = await getBridge().media.remove({ projectId, mediaId })
    if (!res.ok) return
    if (res.value.blocked) {
      const where = res.value.references.map((r) => r.label).join(', ')
      toast.show(`No se puede quitar: se usa en ${where}.`, 'info')
      return
    }
    setMedia(res.value.project.media)
    setMusicId(res.value.project.audio.musicId)
    if (res.value.project.creative) await refreshPlans(projectId)
  }

  /**
   * Drives the REAL Northstar creative engine through the secure bridge:
   * ensure project → sync brief → develop concepts → compile the selected style
   * → persist. In Electron this crosses IPC to the main process + SQLite (and
   * uses any imported media); in browser preview it runs the isomorphic engine
   * in-memory. Not yet a rendered video — the Remotion renderer is deferred.
   */
  const generate = async (): Promise<void> => {
    if (!canGenerate) {
      toast.show('Escribe primero qué quieres promocionar.', 'info')
      return
    }
    setGen('generating')
    try {
      const bridge = getBridge()
      const id = await ensureProject()

      const current = await bridge.projects.get(id)
      if (current.ok && current.value) {
        await bridge.projects.save({
          ...current.value,
          brief: { ...current.value.brief, productOrService: description.trim() },
        })
      }

      const concepts = await bridge.engine.developConcepts({ projectId: id, count: 5 })
      if (!concepts.ok || concepts.value.length === 0) throw new Error('No concepts')

      const wantedFamily = STYLE_FAMILY[styleId]
      const chosen = concepts.value.find((c) => c.family === wantedFamily) ?? concepts.value[0]!

      const compiled = await bridge.engine.compile({ projectId: id, conceptId: chosen.conceptId })
      if (!compiled.ok) throw new Error(compiled.error.message)

      setResult({
        scenes: compiled.value.renderPlan.scenes.length,
        durationSec: Math.round(compiled.value.renderPlan.durationSec),
      })
      setVisualPlan(compiled.value.visualPlan)
      setAudioPlan(compiled.value.audioPlan)
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
          <button
            className={styles.dropzone}
            onClick={onImport}
            type="button"
            disabled={importing}
            data-testid="dropzone"
          >
            <Icon name={importing ? 'refresh' : 'upload-cloud'} size={40} />
            <span className={styles.dropHint}>
              {importing ? 'Procesando…' : copy.step2.dropzone}
            </span>
          </button>
          {media.length > 0 && (
            <div className={styles.mediaGrid} data-testid="media-grid">
              {media.map((asset) => {
                const thumb = projectId ? tileImageUrl(projectId, asset) : null
                return (
                  <div key={asset.id} className={styles.mediaTile} title={asset.originalName}>
                    <span className={styles.mediaThumbBox}>
                      {thumb ? (
                        <img src={thumb} alt="" className={styles.mediaThumbImg} />
                      ) : (
                        <Icon name={KIND_ICON[asset.kind]} size={18} />
                      )}
                    </span>
                    <span className={styles.mediaName}>
                      {asset.originalName}
                      {!asset.valid && <span className={styles.mediaMissing}> · no disponible</span>}
                    </span>
                    <button
                      type="button"
                      className={styles.mediaRemove}
                      aria-label={`Quitar ${asset.originalName}`}
                      onClick={() => void onRemoveMedia(asset.id)}
                    >
                      <Icon name="x" size={14} />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
          <div className={styles.sourceRow}>
            <button
              className={styles.sourceBtn}
              onClick={onImport}
              type="button"
              disabled={importing}
            >
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
              {visualPlan && projectId ? (
                <PreviewPlayer
                  visualPlan={visualPlan}
                  audioPlan={audioPlan}
                  projectId={projectId}
                  media={media}
                />
              ) : (
                <MediaThumb kind={STYLE_THUMBS[styleId] ?? 'generic'} play className={styles.preview} />
              )}
              {result && (
                <p className={styles.stepSubtitle} data-testid="commercial-summary">
                  Comercial creado: {result.scenes} escenas · {result.durationSec}s
                </p>
              )}
              {media.some((m) => m.kind === 'audio') ? (
                <label className={styles.musicSelect} data-testid="music-select-label">
                  <span>Música del comercial</span>
                  <select
                    value={musicId ?? ''}
                    onChange={(e) => void onSelectMusic(e.target.value || null)}
                    data-testid="music-select"
                  >
                    <option value="">Sin música</option>
                    {media
                      .filter((m) => m.kind === 'audio' && m.valid)
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.originalName}
                        </option>
                      ))}
                  </select>
                </label>
              ) : null}
              <div className={styles.resultActions}>
                {projectId ? <ExportPanel projectId={projectId} /> : null}
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
