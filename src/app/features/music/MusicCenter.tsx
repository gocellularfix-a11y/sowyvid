import { useCallback, useEffect, useMemo, useState } from 'react'
import { Icon } from '../../ui/Icon'
import { Button } from '../../ui/Button'
import { Modal } from '../../ui/Modal'
import { useToast } from '../../ui/toastContext'
import { getBridge, isBrowserPreview } from '../../bridge'
import type { MusicTrackWithState, MusicMetaPatch, MusicSource, MusicEnergy, VocalClass, MusicLicenseStatus } from '@shared/domain/music'
import type { MusicBriefDetail } from '@features/audio'
import { useMusicPreview } from './useMusicPreview'
import { copy } from '../../content/copy'
import styles from './MusicCenter.module.css'

/**
 * The Music Center: an application-level library (Biblioteca) plus the manual
 * Suno brief workflow (Crear con Suno). Owner-simple — never exposes internal
 * terms. `currentProjectId` is the commercial a track gets selected FOR; null
 * when no commercial is open (the owner can still build the library).
 */
export function MusicCenter({
  currentProjectId,
  currentProjectName,
}: {
  currentProjectId: string | null
  currentProjectName: string | null
}): JSX.Element {
  const [tab, setTab] = useState<'library' | 'suno'>('library')

  return (
    <section className={styles.center} aria-label={copy.music.title}>
      <div className={styles.head}>
        <h2 className={styles.heading}>{copy.music.title}</h2>
        <div className={styles.tabs} role="tablist">
          <button
            role="tab"
            aria-selected={tab === 'library'}
            className={[styles.tab, tab === 'library' ? styles.tabOn : ''].join(' ')}
            onClick={() => setTab('library')}
            data-testid="music-tab-library"
          >
            {copy.music.tabLibrary}
          </button>
          <button
            role="tab"
            aria-selected={tab === 'suno'}
            className={[styles.tab, tab === 'suno' ? styles.tabOn : ''].join(' ')}
            onClick={() => setTab('suno')}
            data-testid="music-tab-suno"
          >
            {copy.music.tabSuno}
          </button>
        </div>
      </div>

      {tab === 'library' ? (
        <MusicLibrary currentProjectId={currentProjectId} />
      ) : (
        <SunoWorkflow currentProjectId={currentProjectId} currentProjectName={currentProjectName} />
      )}
    </section>
  )
}

const SOURCE_VALUES: MusicSource[] = ['imported', 'suno-manual', 'licensed', 'original', 'unknown']

function MusicLibrary({ currentProjectId }: { currentProjectId: string | null }): JSX.Element {
  const toast = useToast()
  const preview = useMusicPreview()
  const [tracks, setTracks] = useState<MusicTrackWithState[]>([])
  const [query, setQuery] = useState('')
  const [sourceFilter, setSourceFilter] = useState<MusicSource | 'all'>('all')
  const [moodFilter, setMoodFilter] = useState<string>('all')
  const [editing, setEditing] = useState<MusicTrackWithState | null>(null)
  const [deleting, setDeleting] = useState<{ track: MusicTrackWithState; withTrackId: string } | null>(null)
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const bridge = getBridge()
    const res = await bridge.music.list()
    if (res.ok) setTracks(res.value)
    if (currentProjectId) {
      const project = await bridge.projects.get(currentProjectId)
      if (project.ok && project.value) setSelectedTrackId(project.value.audio.musicTrackId)
    }
  }, [currentProjectId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const moods = useMemo(() => {
    const set = new Set<string>()
    tracks.forEach((t) => t.moodTags.forEach((m) => set.add(m)))
    return [...set].sort()
  }, [tracks])

  const visible = tracks.filter((t) => {
    const q = query.trim().toLowerCase()
    if (q && !t.title.toLowerCase().includes(q) && !t.originalName.toLowerCase().includes(q)) return false
    if (sourceFilter !== 'all' && t.source !== sourceFilter) return false
    if (moodFilter !== 'all' && !t.moodTags.includes(moodFilter)) return false
    return true
  })

  const onImport = async (): Promise<void> => {
    if (isBrowserPreview) {
      toast.show('La música está disponible en la app de escritorio.', 'info')
      return
    }
    const res = await getBridge().music.import()
    if (!res.ok) {
      toast.show('No pudimos agregar la música.', 'error')
      return
    }
    if (res.value.canceled) return
    const imported = res.value.outcomes.filter((o) => o.status === 'imported').length
    const dup = res.value.outcomes.filter((o) => o.status === 'duplicate').length
    const bad = res.value.outcomes.length - imported - dup
    if (imported > 0) toast.show(`${imported} canción(es) agregada(s).`, 'success')
    else if (dup > 0 && bad === 0) toast.show('Esa música ya estaba en tu biblioteca.', 'info')
    if (bad > 0) toast.show(`${bad} archivo(s) no son música válida.`, 'error')
    await refresh()
  }

  const onSelect = async (trackId: string): Promise<void> => {
    if (!currentProjectId) {
      toast.show('Abre o crea un comercial para usar esta música.', 'info')
      return
    }
    const res = await getBridge().music.select({ projectId: currentProjectId, trackId })
    if (!res.ok) {
      toast.show('No pudimos seleccionar la música.', 'error')
      return
    }
    setSelectedTrackId(trackId)
    toast.show('Música seleccionada para tu comercial.', 'success')
  }

  const onDelete = async (track: MusicTrackWithState): Promise<void> => {
    const res = await getBridge().music.delete({ id: track.id })
    if (!res.ok) return
    if (res.value.blocked) {
      // In use → a decision, not a dead end. Default replacement = another track.
      const other = tracks.find((t) => t.id !== track.id)
      setDeleting({ track: { ...track, usages: res.value.usages }, withTrackId: other?.id ?? '' })
      return
    }
    if (preview.playingId === track.id) preview.stop()
    toast.show('Música eliminada.', 'success')
    await refresh()
  }

  const onRemoveFromAll = async (): Promise<void> => {
    if (!deleting) return
    const res = await getBridge().music.removeFromAll({ trackId: deleting.track.id, deleteTrack: true })
    setDeleting(null)
    if (!res.ok) return
    if (preview.playingId === deleting.track.id) preview.stop()
    toast.show('Música eliminada de todos los comerciales.', 'success')
    await refresh()
  }

  const onReplaceEverywhere = async (): Promise<void> => {
    if (!deleting || !deleting.withTrackId) return
    const res = await getBridge().music.replaceEverywhere({
      trackId: deleting.track.id,
      newTrackId: deleting.withTrackId,
    })
    setDeleting(null)
    if (!res.ok) return
    toast.show('Música reemplazada en los comerciales.', 'success')
    await refresh()
  }

  if (isBrowserPreview) {
    return (
      <div className={styles.empty}>
        <Icon name="monitor" size={26} />
        <p>La música está disponible en la app de escritorio.</p>
      </div>
    )
  }

  return (
    <div className={styles.library} data-testid="music-library">
      <div className={styles.toolbar}>
        <Button leftIcon="upload-cloud" onClick={() => void onImport()} data-testid="music-add">
          {copy.music.add}
        </Button>
        <input
          className={styles.search}
          placeholder={copy.music.searchPlaceholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          data-testid="music-search"
        />
        <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value as MusicSource | 'all')} data-testid="music-filter-source">
          <option value="all">{copy.music.allSources}</option>
          {SOURCE_VALUES.map((s) => (
            <option key={s} value={s}>{copy.music.source[s]}</option>
          ))}
        </select>
        {moods.length > 0 ? (
          <select value={moodFilter} onChange={(e) => setMoodFilter(e.target.value)} data-testid="music-filter-mood">
            <option value="all">{copy.music.allMoods}</option>
            {moods.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        ) : null}
      </div>

      {tracks.length === 0 ? (
        <div className={styles.empty} data-testid="music-empty">
          <Icon name="monitor" size={26} />
          <p>{copy.music.empty}</p>
        </div>
      ) : (
        <div className={styles.trackList}>
          {visible.map((track) => (
            <MusicCard
              key={track.id}
              track={track}
              preview={preview}
              isSelected={selectedTrackId === track.id}
              onSelect={() => void onSelect(track.id)}
              onEdit={() => setEditing(track)}
              onReveal={() => void getBridge().music.reveal({ id: track.id })}
              onDelete={() => void onDelete(track)}
            />
          ))}
        </div>
      )}

      {editing ? (
        <MetadataDialog
          track={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null)
            await refresh()
          }}
        />
      ) : null}

      <Modal open={deleting !== null} title={copy.music.inUseTitle} testId="music-inuse-dialog">
        {deleting ? (
          <>
            <ul className={styles.usageList}>
              {deleting.track.usages.map((u) => (
                <li key={u.projectId}>{u.projectName}</li>
              ))}
            </ul>
            {tracks.length > 1 ? (
              <label className={styles.field}>
                <span>{copy.music.chooseReplacement}</span>
                <select
                  value={deleting.withTrackId}
                  onChange={(e) => setDeleting({ ...deleting, withTrackId: e.target.value })}
                  data-testid="music-replacement-select"
                >
                  {tracks.filter((t) => t.id !== deleting.track.id).map((t) => (
                    <option key={t.id} value={t.id}>{t.title || t.originalName}</option>
                  ))}
                </select>
              </label>
            ) : null}
            <div className={styles.dialogActions}>
              {deleting.withTrackId ? (
                <Button variant="secondary" onClick={() => void onReplaceEverywhere()} data-testid="music-replace-all">
                  {copy.music.replaceInAll}
                </Button>
              ) : null}
              <Button variant="secondary" onClick={() => void onRemoveFromAll()} data-testid="music-removeall-delete">
                {copy.music.removeFromAll}
              </Button>
              <Button onClick={() => setDeleting(null)}>{copy.music.cancel}</Button>
            </div>
          </>
        ) : null}
      </Modal>
    </div>
  )
}

function fmtTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function MusicCard({
  track,
  preview,
  isSelected,
  onSelect,
  onEdit,
  onReveal,
  onDelete,
}: {
  track: MusicTrackWithState
  preview: ReturnType<typeof useMusicPreview>
  isSelected: boolean
  onSelect: () => void
  onEdit: () => void
  onReveal: () => void
  onDelete: () => void
}): JSX.Element {
  const playing = preview.playingId === track.id
  const ext = track.relPath.split('.').pop()?.toUpperCase() ?? ''
  const licenseUnknown = track.licenseStatus === 'unknown' || track.licenseStatus === 'needs-review'
  return (
    <article className={[styles.card, isSelected ? styles.cardSelected : ''].join(' ')} data-testid="music-card" data-track-id={track.id}>
      <button
        className={styles.playBtn}
        onClick={() => preview.toggle(track.id)}
        disabled={!track.fileExists}
        aria-label={playing ? copy.music.pause : copy.music.play}
        data-testid="music-play"
      >
        <Icon name={playing ? 'refresh' : 'play'} size={18} />
      </button>
      <div className={styles.cardMain}>
        <div className={styles.cardTitle} data-testid="music-title">
          {track.title || track.originalName}
          {isSelected ? <span className={styles.selectedTag}>{copy.music.selected}</span> : null}
        </div>
        <div className={styles.cardMeta}>
          {track.creator ? `${track.creator} · ` : ''}
          {track.originalName} · {track.durationSec ? fmtTime(track.durationSec) : '—'} · {ext}
        </div>
        <div className={styles.cardMeta}>
          {copy.music.source[track.source]} · {copy.music.license[track.licenseStatus]} ·{' '}
          {copy.music.energy[track.energy]} ·{' '}
          {track.usageCount > 0 ? copy.music.usedByCount(track.usageCount) : copy.music.notUsed}
        </div>
        {!track.fileExists ? (
          <div className={styles.warn} data-testid="music-missing">{copy.music.missingFile}</div>
        ) : licenseUnknown ? (
          <div className={styles.warnSoft} data-testid="music-license-warn">{copy.music.licenseWarning}</div>
        ) : null}

        {playing ? (
          <div className={styles.previewRow} data-testid="music-preview-row">
            <span className={styles.time} data-testid="music-time">{fmtTime(preview.currentTime)} / {fmtTime(preview.duration)}</span>
            <input
              type="range"
              min={0}
              max={preview.duration || track.durationSec || 1}
              step={0.1}
              value={preview.currentTime}
              onChange={(e) => preview.seek(Number(e.target.value))}
              aria-label="Avanzar"
              data-testid="music-seek"
            />
            <label className={styles.previewVol}>
              <Icon name="monitor" size={14} />
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={preview.volume}
                onChange={(e) => preview.setVolume(Number(e.target.value))}
                aria-label={copy.music.previewVolume}
                data-testid="music-preview-volume"
              />
            </label>
          </div>
        ) : null}
      </div>
      <div className={styles.cardActions}>
        <Button size="sm" onClick={onSelect} disabled={isSelected} data-testid="music-use">
          {isSelected ? copy.music.selected : copy.music.useInCommercial}
        </Button>
        <Button size="sm" variant="secondary" onClick={onEdit} data-testid="music-edit">{copy.music.editData}</Button>
        {track.fileExists ? (
          <Button size="sm" variant="secondary" onClick={onReveal} data-testid="music-reveal">{copy.music.reveal}</Button>
        ) : null}
        <Button size="sm" variant="secondary" onClick={onDelete} data-testid="music-delete">{copy.music.remove}</Button>
      </div>
    </article>
  )
}

const ENERGY_VALUES: MusicEnergy[] = ['calm', 'balanced', 'energetic', 'unknown']
const VOCAL_VALUES: VocalClass[] = ['instrumental', 'vocal', 'unknown']
const LICENSE_VALUES: MusicLicenseStatus[] = ['commercial-confirmed', 'personal-only', 'needs-review', 'unknown']

function MetadataDialog({
  track,
  onClose,
  onSaved,
}: {
  track: MusicTrackWithState
  onClose: () => void
  onSaved: () => void
}): JSX.Element {
  const toast = useToast()
  const [form, setForm] = useState({
    title: track.title,
    creator: track.creator,
    source: track.source,
    sourceUrl: track.sourceUrl,
    moods: track.moodTags.join(', '),
    energy: track.energy,
    vocal: track.vocal,
    licenseStatus: track.licenseStatus,
    licenseNotes: track.licenseNotes,
    commercialUseConfirmed: track.commercialUseConfirmed,
  })

  const save = async (): Promise<void> => {
    const patch: MusicMetaPatch = {
      title: form.title,
      creator: form.creator,
      source: form.source,
      sourceUrl: form.sourceUrl,
      moodTags: form.moods.split(',').map((m) => m.trim()).filter(Boolean),
      energy: form.energy,
      vocal: form.vocal,
      licenseStatus: form.licenseStatus,
      licenseNotes: form.licenseNotes,
      commercialUseConfirmed: form.commercialUseConfirmed,
    }
    const res = await getBridge().music.updateMeta({ id: track.id, patch })
    if (!res.ok) {
      toast.show('No pudimos guardar los datos.', 'error')
      return
    }
    onSaved()
  }

  return (
    <Modal open title={copy.music.editData} testId="music-meta-dialog">
      <div className={styles.form}>
        <label className={styles.field}>
          <span>{copy.music.fields.title}</span>
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} data-testid="meta-title" />
        </label>
        <label className={styles.field}>
          <span>{copy.music.fields.creator}</span>
          <input value={form.creator} onChange={(e) => setForm({ ...form, creator: e.target.value })} data-testid="meta-creator" />
        </label>
        <label className={styles.field}>
          <span>{copy.music.fields.source}</span>
          <select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value as MusicSource })} data-testid="meta-source">
            {SOURCE_VALUES.map((s) => <option key={s} value={s}>{copy.music.source[s]}</option>)}
          </select>
        </label>
        <label className={styles.field}>
          <span>{copy.music.fields.sourceUrl}</span>
          <input value={form.sourceUrl} onChange={(e) => setForm({ ...form, sourceUrl: e.target.value })} data-testid="meta-source-url" />
        </label>
        <label className={styles.field}>
          <span>{copy.music.fields.mood}</span>
          <input value={form.moods} onChange={(e) => setForm({ ...form, moods: e.target.value })} data-testid="meta-moods" />
        </label>
        <div className={styles.formRow}>
          <label className={styles.field}>
            <span>{copy.music.fields.energy}</span>
            <select value={form.energy} onChange={(e) => setForm({ ...form, energy: e.target.value as MusicEnergy })} data-testid="meta-energy">
              {ENERGY_VALUES.map((v) => <option key={v} value={v}>{copy.music.energy[v]}</option>)}
            </select>
          </label>
          <label className={styles.field}>
            <span>{copy.music.fields.vocal}</span>
            <select value={form.vocal} onChange={(e) => setForm({ ...form, vocal: e.target.value as VocalClass })} data-testid="meta-vocal">
              {VOCAL_VALUES.map((v) => <option key={v} value={v}>{copy.music.vocal[v]}</option>)}
            </select>
          </label>
        </div>
        <label className={styles.field}>
          <span>{copy.music.fields.license}</span>
          <select value={form.licenseStatus} onChange={(e) => setForm({ ...form, licenseStatus: e.target.value as MusicLicenseStatus })} data-testid="meta-license">
            {LICENSE_VALUES.map((v) => <option key={v} value={v}>{copy.music.license[v]}</option>)}
          </select>
        </label>
        <label className={styles.field}>
          <span>{copy.music.fields.licenseNotes}</span>
          <input value={form.licenseNotes} onChange={(e) => setForm({ ...form, licenseNotes: e.target.value })} data-testid="meta-license-notes" />
        </label>
        <label className={styles.checkboxField}>
          <input type="checkbox" checked={form.commercialUseConfirmed} onChange={(e) => setForm({ ...form, commercialUseConfirmed: e.target.checked })} data-testid="meta-commercial-use" />
          <span>{copy.music.fields.commercialUse}</span>
        </label>
      </div>
      <div className={styles.dialogActions}>
        <Button variant="secondary" onClick={onClose}>{copy.music.cancel}</Button>
        <Button onClick={() => void save()} data-testid="meta-save">{copy.music.save}</Button>
      </div>
    </Modal>
  )
}

function SunoWorkflow({
  currentProjectId,
  currentProjectName,
}: {
  currentProjectId: string | null
  currentProjectName: string | null
}): JSX.Element {
  const toast = useToast()
  const [brief, setBrief] = useState<MusicBriefDetail | null>(null)
  const [wantsVocals, setWantsVocals] = useState(false)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  const generate = async (): Promise<void> => {
    if (!currentProjectId) {
      toast.show(copy.music.suno.needCommercial, 'info')
      return
    }
    setBusy(true)
    const res = await getBridge().music.brief({ projectId: currentProjectId, wantsVocals })
    setBusy(false)
    if (!res.ok) {
      toast.show(res.error.code === 'NOT_READY' ? copy.music.suno.needCommercial : 'No pudimos generar el brief.', 'info')
      return
    }
    setBrief(res.value)
  }

  const copyBrief = async (): Promise<void> => {
    if (!brief) return
    try {
      await navigator.clipboard.writeText(brief.prompt)
    } catch {
      /* clipboard may be unavailable; the text is still visible to copy manually */
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const openSuno = async (): Promise<void> => {
    await getBridge().music.openSuno()
  }

  const importResult = async (): Promise<void> => {
    if (!brief || !currentProjectId) return
    const res = await getBridge().music.importSuno({ brief: brief.prompt })
    if (!res.ok) {
      toast.show('No pudimos importar la canción.', 'error')
      return
    }
    if (res.value.canceled) return
    const track = res.value.tracks[0]
    if (!track) {
      toast.show('No encontramos una canción válida para importar.', 'error')
      return
    }
    const sel = await getBridge().music.select({ projectId: currentProjectId, trackId: track.id })
    if (sel.ok) toast.show(copy.music.suno.savedToLibrary, 'success')
  }

  return (
    <div className={styles.suno} data-testid="suno-workflow">
      <p className={styles.sunoIntro}>{copy.music.suno.intro}</p>
      <div className={styles.sunoControls}>
        <span className={styles.currentFor}>
          {copy.home.currentLabel} <strong>{currentProjectName ?? copy.home.unnamed}</strong>
        </span>
        <label className={styles.checkboxField}>
          <input type="checkbox" checked={wantsVocals} onChange={(e) => setWantsVocals(e.target.checked)} data-testid="suno-vocals" />
          <span>{copy.music.suno.wantsVocals}</span>
        </label>
        <Button onClick={() => void generate()} disabled={busy} data-testid="suno-generate">
          {copy.music.suno.generate}
        </Button>
      </div>
      <p className={styles.sunoNote}>{copy.music.suno.instrumentalNote}</p>

      {brief ? (
        <div className={styles.brief} data-testid="suno-brief">
          <BriefRow label={copy.music.suno.purpose} value={brief.purpose} />
          <BriefRow label={copy.music.suno.genre} value={brief.genre} />
          <BriefRow label={copy.music.suno.mood} value={brief.mood} />
          <BriefRow label={copy.music.suno.energyLabel} value={brief.energy} testId="suno-energy" />
          <BriefRow label={copy.music.suno.tempo} value={brief.tempo} testId="suno-tempo" />
          <BriefRow label={copy.music.suno.instruments} value={brief.instrumentation} />
          <BriefRow label={copy.music.suno.vocals} value={brief.vocals} testId="suno-vocals-field" />
          <BriefRow label={copy.music.suno.duration} value={`${brief.durationSec}s`} testId="suno-duration" />
          <BriefRow label={copy.music.suno.intro2} value={brief.intro} />
          <BriefRow label={copy.music.suno.ending} value={brief.ending} />
          <BriefRow label={copy.music.suno.loopFade} value={brief.loopFade} />
          <BriefRow label={copy.music.suno.avoid} value={brief.avoid} />
          <pre className={styles.briefPrompt} data-testid="suno-prompt">{brief.prompt}</pre>
          <div className={styles.dialogActions}>
            <Button variant="secondary" onClick={() => void copyBrief()} data-testid="suno-copy">
              {copied ? copy.music.suno.copied : copy.music.suno.copy}
            </Button>
            <Button variant="secondary" rightIcon="arrow-right" onClick={() => void openSuno()} data-testid="suno-open">
              {copy.music.suno.openSuno}
            </Button>
            <Button leftIcon="upload-cloud" onClick={() => void importResult()} data-testid="suno-import">
              {copy.music.suno.importResult}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function BriefRow({ label, value, testId }: { label: string; value: string; testId?: string }): JSX.Element {
  return (
    <div className={styles.briefRow}>
      <span className={styles.briefLabel}>{label}</span>
      <span className={styles.briefValue} data-testid={testId}>{value}</span>
    </div>
  )
}
