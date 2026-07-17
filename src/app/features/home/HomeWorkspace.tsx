import { useEffect, useRef, useState } from 'react'
import { Icon } from '../../ui/Icon'
import { Button } from '../../ui/Button'
import { TextArea } from '../../ui/TextInput'
import { StepBadge } from '../../ui/Primitives'
import { MediaThumb, type ThumbKind } from '../../ui/MediaThumb'
import { Modal } from '../../ui/Modal'
import { useToast } from '../../ui/toastContext'
import { getBridge, isBrowserPreview } from '../../bridge'
import { tileImageUrl } from '../../mediaUrl'
import { PreviewPlayer } from './PreviewPlayer'
import { ExportPanel } from './ExportPanel'
import type { MediaAsset } from '@shared/domain/media'
import type { AudioConfig } from '@shared/domain/project'
import type { MediaReference } from '@features/media/mediaReferences'
import type { VisualPlan } from '@features/visual/visualPlan'
import type { AudioPlan } from '@features/audio/audioPlan'
import { mediaTileLabel, videosWithAudio } from '@features/media/mediaLabel'
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

interface RemoveDialogState {
  mediaId: string
  name: string
  references: MediaReference[]
  busy: boolean
}

export interface HomeWorkspaceProps {
  /**
   * The commercial to load on mount (App owns WHICH commercial is current —
   * startup restore, library "Abrir" and "Nuevo comercial" all live there).
   * Null starts a clean slate; no project row is created until the owner acts.
   */
  initialProjectId: string | null
  /** Fired when this workspace creates/loads a project, so App can track it. */
  onProjectChanged: (id: string | null, name: string | null) => void
  onNewCommercial: () => void
}

export function HomeWorkspace({
  initialProjectId,
  onProjectChanged,
  onNewCommercial,
}: HomeWorkspaceProps): JSX.Element {
  const toast = useToast()
  const [description, setDescription] = useState('')
  const [styleId, setStyleId] = useState<string>(copy.step3.styles[0].id)
  const [gen, setGen] = useState<GenState>('idle')
  const [result, setResult] = useState<CommercialResult | null>(null)
  const [visualPlan, setVisualPlan] = useState<VisualPlan | null>(null)
  const [audioPlan, setAudioPlan] = useState<AudioPlan | null>(null)
  const [projectId, setProjectId] = useState<string | null>(null)
  const [projectName, setProjectName] = useState<string | null>(null)
  const [media, setMedia] = useState<MediaAsset[]>([])
  const [audioCfg, setAudioCfg] = useState<AudioConfig | null>(null)
  const [importing, setImporting] = useState(false)
  const [removeDialog, setRemoveDialog] = useState<RemoveDialogState | null>(null)

  const musicVolumeTimer = useRef<number | null>(null)
  const sourceVolumeTimer = useRef<number | null>(null)

  const canGenerate = description.trim().length > 0

  const soon = () => toast.show(copy.common.unavailableHint, 'info')

  /**
   * Recompile the persisted concept so the preview (and the export gate) see
   * the CURRENT persisted state — media, music, volumes, source audio. This is
   * the §8 rule: persist first, then rebuild from persisted project state, so
   * preview and export can never disagree.
   */
  const refreshPlans = async (id: string): Promise<void> => {
    const bridge = getBridge()
    const current = await bridge.projects.get(id)
    if (!current.ok || !current.value?.creative) return
    setAudioCfg(current.value.audio)
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
   * Load the commercial App told us to show. App decides WHEN restoring is
   * appropriate (startup → most recent; library → the chosen one; new → none),
   * so this component never guesses.
   */
  useEffect(() => {
    if (isBrowserPreview || !initialProjectId) return
    let cancelled = false
    void (async () => {
      const current = await getBridge().projects.get(initialProjectId)
      if (cancelled || !current.ok || !current.value) return
      const project = current.value
      setProjectId(project.id)
      setProjectName(project.name)
      setMedia(project.media)
      setAudioCfg(project.audio)
      if (project.brief.productOrService) setDescription(project.brief.productOrService)
      if (project.creative) await refreshPlans(project.id)
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only: App remounts this component (key) when the commercial changes
  }, [])

  /** Persist an audio-config change, then rebuild plans from persisted state. */
  const persistAudio = async (patch: Partial<AudioConfig>): Promise<void> => {
    if (!projectId) return
    const bridge = getBridge()
    const current = await bridge.projects.get(projectId)
    if (!current.ok || !current.value) return
    const saved = await bridge.projects.save({
      ...current.value,
      audio: { ...current.value.audio, ...patch },
    })
    if (!saved.ok) {
      toast.show('No pudimos guardar el ajuste de sonido.', 'error')
      return
    }
    setAudioCfg(saved.value.audio)
    if (current.value.creative) await refreshPlans(projectId)
  }

  /** The owner picks (or removes) the commercial's music. Persisted, then replanned. */
  const onSelectMusic = async (nextId: string | null): Promise<void> => {
    await persistAudio({ musicId: nextId })
  }

  /** Sliders update optimistically and persist shortly after the last movement. */
  const onMusicVolume = (value: number): void => {
    setAudioCfg((c) => (c ? { ...c, musicVolume: value } : c))
    if (musicVolumeTimer.current) window.clearTimeout(musicVolumeTimer.current)
    musicVolumeTimer.current = window.setTimeout(() => void persistAudio({ musicVolume: value }), 400)
  }
  const onSourceAudioVolume = (value: number): void => {
    setAudioCfg((c) => (c ? { ...c, sourceAudioVolume: value } : c))
    if (sourceVolumeTimer.current) window.clearTimeout(sourceVolumeTimer.current)
    sourceVolumeTimer.current = window.setTimeout(
      () => void persistAudio({ sourceAudioVolume: value }),
      400,
    )
  }

  /** Ensure a draft project exists to attach media/brief to; returns its id. */
  const ensureProject = async (): Promise<string> => {
    if (projectId) return projectId
    const name = description.trim().slice(0, 60) || 'Comercial'
    const created = await getBridge().projects.create({
      name,
      brief: { productOrService: description.trim() },
    })
    if (!created.ok) throw new Error(created.error.message)
    setProjectId(created.value.id)
    setProjectName(created.value.name)
    setMedia(created.value.media)
    setAudioCfg(created.value.audio)
    onProjectChanged(created.value.id, created.value.name)
    return created.value.id
  }

  /** Apply a project returned by a media operation to every dependent state. */
  const applyProject = async (project: {
    id: string
    name: string
    media: MediaAsset[]
    audio: AudioConfig
    creative: unknown
  }): Promise<void> => {
    setMedia(project.media)
    setAudioCfg(project.audio)
    setProjectName(project.name)
    if (project.creative) await refreshPlans(project.id)
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
      await applyProject(res.value.project)

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

  const onRemoveMedia = async (asset: MediaAsset): Promise<void> => {
    if (!projectId) return
    const res = await getBridge().media.remove({ projectId, mediaId: asset.id })
    if (!res.ok) return
    if (res.value.blocked) {
      // Referenced media is a DECISION, not a dead end: replace it, remove it
      // for real, or keep it. The main process owns whichever cascade follows.
      setRemoveDialog({
        mediaId: asset.id,
        name: asset.originalName,
        references: res.value.references,
        busy: false,
      })
      return
    }
    await applyProject(res.value.project)
  }

  const onReplaceMedia = async (): Promise<void> => {
    if (!projectId || !removeDialog) return
    setRemoveDialog({ ...removeDialog, busy: true })
    const res = await getBridge().media.replace({ projectId, mediaId: removeDialog.mediaId })
    setRemoveDialog(null)
    if (!res.ok) {
      toast.show('No pudimos reemplazar el archivo.', 'error')
      return
    }
    if (res.value.canceled) return
    await applyProject(res.value.project)
    toast.show('Archivo reemplazado en tu comercial.', 'success')
  }

  const onRemoveReferenced = async (): Promise<void> => {
    if (!projectId || !removeDialog) return
    setRemoveDialog({ ...removeDialog, busy: true })
    const res = await getBridge().media.removeReferenced({
      projectId,
      mediaId: removeDialog.mediaId,
    })
    setRemoveDialog(null)
    if (!res.ok) {
      toast.show('No pudimos quitar el archivo.', 'error')
      return
    }
    await applyProject(res.value.project)
    toast.show('Archivo quitado del comercial.', 'success')
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

  const musicCandidates = media.filter((m) => m.kind === 'audio' && m.valid)
  const soundVideos = videosWithAudio(media)
  const hasVideos = media.some((m) => m.kind === 'video')
  const musicId = audioCfg?.musicId ?? null

  return (
    <section className={styles.workspace} aria-label="Crear comercial">
      <div className={styles.currentBar} data-testid="current-commercial">
        <span className={styles.currentName}>
          {copy.home.currentLabel}{' '}
          <strong data-testid="current-commercial-name">
            {projectName ?? copy.home.unnamed}
          </strong>
        </span>
        <Button
          variant="secondary"
          size="sm"
          leftIcon="plus"
          onClick={onNewCommercial}
          data-testid="new-commercial"
        >
          {copy.home.newCommercial}
        </Button>
      </div>

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
                    <span className={styles.mediaMeta}>
                      <span className={styles.mediaName}>{asset.originalName}</span>
                      <span className={styles.mediaBadge} data-testid={`media-badge-${asset.id}`}>
                        {mediaTileLabel(asset)}
                      </span>
                    </span>
                    <button
                      type="button"
                      className={styles.mediaRemove}
                      aria-label={`Quitar ${asset.originalName}`}
                      onClick={() => void onRemoveMedia(asset)}
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

              {/* ---------- The commercial's SOUND (persisted, drives export) ---------- */}
              <div className={styles.audioSection} data-testid="audio-section">
                <p className={styles.audioSectionTitle}>{copy.audio.title}</p>

                {musicCandidates.length > 0 ? (
                  <>
                    <label className={styles.musicSelect} data-testid="music-select-label">
                      <span>{copy.audio.musicLabel}</span>
                      <select
                        value={musicId ?? ''}
                        onChange={(e) => void onSelectMusic(e.target.value || null)}
                        data-testid="music-select"
                      >
                        <option value="">{copy.audio.noMusic}</option>
                        {musicCandidates.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.originalName}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className={styles.audioControl}>
                      <span>{copy.audio.musicVolume}</span>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={audioCfg?.musicVolume ?? 0.8}
                        onChange={(e) => onMusicVolume(Number(e.target.value))}
                        disabled={!musicId}
                        data-testid="music-volume"
                        aria-label={copy.audio.musicVolume}
                      />
                    </label>
                  </>
                ) : (
                  <p className={styles.audioNote} data-testid="no-music-note">
                    {copy.audio.noMusicImported}
                  </p>
                )}

                {soundVideos.length > 0 ? (
                  <div className={styles.sourceAudioBlock} data-testid="source-audio-section">
                    <p className={styles.audioSectionSub}>{copy.audio.sourceAudioTitle}</p>
                    <label className={styles.audioToggle}>
                      <input
                        type="checkbox"
                        checked={audioCfg?.useSourceAudio ?? false}
                        onChange={(e) => void persistAudio({ useSourceAudio: e.target.checked })}
                        data-testid="source-audio-toggle"
                      />
                      <span>{copy.audio.sourceAudioEnable}</span>
                    </label>
                    <label className={styles.audioControl}>
                      <span>{copy.audio.sourceAudioVolume}</span>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={audioCfg?.sourceAudioVolume ?? 1}
                        onChange={(e) => onSourceAudioVolume(Number(e.target.value))}
                        disabled={!(audioCfg?.useSourceAudio ?? false)}
                        data-testid="source-audio-volume"
                        aria-label={copy.audio.sourceAudioVolume}
                      />
                    </label>
                    <p className={styles.audioNote}>{copy.audio.sourceAudioHint}</p>
                  </div>
                ) : hasVideos ? (
                  <p className={styles.audioNote} data-testid="video-no-sound">
                    {copy.audio.videoNoSound}
                  </p>
                ) : null}

                {audioPlan?.silent ? (
                  <p className={styles.silentWarning} role="status" data-testid="silent-warning">
                    ⚠ {copy.audio.silentWarning}
                  </p>
                ) : null}
              </div>

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

      {/* ---------- Referenced-media decision dialog ---------- */}
      <Modal
        open={removeDialog !== null}
        title={copy.mediaRemove.title}
        testId="media-remove-dialog"
      >
        {removeDialog ? (
          <>
            <p className={styles.dialogBody}>
              <strong>{removeDialog.name}</strong> se usa en{' '}
              {removeDialog.references.map((r) => r.label).join(', ')}.
            </p>
            <div className={styles.dialogActions}>
              <Button
                block
                variant="secondary"
                disabled={removeDialog.busy}
                onClick={() => void onReplaceMedia()}
                data-testid="media-replace"
              >
                {copy.mediaRemove.replace}
              </Button>
              <Button
                block
                variant="secondary"
                disabled={removeDialog.busy}
                onClick={() => void onRemoveReferenced()}
                data-testid="media-remove-confirm"
              >
                {copy.mediaRemove.removeAndDelete}
              </Button>
              <Button
                block
                disabled={removeDialog.busy}
                onClick={() => setRemoveDialog(null)}
                data-testid="media-remove-cancel"
              >
                {copy.mediaRemove.cancel}
              </Button>
            </div>
          </>
        ) : null}
      </Modal>
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
