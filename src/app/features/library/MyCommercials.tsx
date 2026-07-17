import { useCallback, useEffect, useState } from 'react'
import { Icon } from '../../ui/Icon'
import { Button } from '../../ui/Button'
import { Modal } from '../../ui/Modal'
import { useToast } from '../../ui/toastContext'
import { getBridge, isBrowserPreview } from '../../bridge'
import { tileImageUrl } from '../../mediaUrl'
import type { Project } from '@shared/domain/project'
import type { ExportRecordWithFileState } from '@shared/domain/exportRecord'
import { copy } from '../../content/copy'
import styles from './MyCommercials.module.css'

/**
 * The real "Mis comerciales" library: every persisted commercial, its material
 * and its exported videos — not a placeholder, not only the latest project.
 * All state comes from the main process (projects.list + render.listHistoryAll),
 * so it is identical before and after a restart.
 */

interface Row {
  project: Project
  exports: ExportRecordWithFileState[]
}

function statusLabel(project: Project, exportCount: number): string {
  if (exportCount > 0) return copy.library.status.exported
  if (project.creative) return copy.library.status.ready
  return copy.library.status.draft
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function fmtBytes(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`
  if (bytes >= 1_000) return `${Math.round(bytes / 1_000)} KB`
  return `${bytes} B`
}

function firstThumb(projectId: string, project: Project): string | null {
  for (const asset of project.media) {
    const url = tileImageUrl(projectId, asset)
    if (url) return url
  }
  return null
}

export function MyCommercials({
  onOpen,
}: {
  onOpen: (projectId: string, name: string) => void
}): JSX.Element {
  const toast = useToast()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null)
  const [deleting, setDeleting] = useState<{ id: string; name: string; keepExports: boolean } | null>(
    null,
  )

  const refresh = useCallback(async () => {
    const bridge = getBridge()
    const [projects, allExports] = await Promise.all([
      bridge.projects.list(),
      bridge.render.listHistoryAll(),
    ])
    if (!projects.ok) {
      setLoading(false)
      return
    }
    const exportsByProject = new Map<string, ExportRecordWithFileState[]>()
    if (allExports.ok) {
      for (const record of allExports.value) {
        const list = exportsByProject.get(record.projectId) ?? []
        list.push(record)
        exportsByProject.set(record.projectId, list)
      }
    }
    setRows(
      projects.value.map((project) => ({
        project,
        exports: (exportsByProject.get(project.id) ?? []).filter((e) => e.status === 'completed'),
      })),
    )
    setLoading(false)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const doRename = async (): Promise<void> => {
    if (!renaming) return
    const name = renaming.name.trim()
    if (!name) return
    const bridge = getBridge()
    const current = await bridge.projects.get(renaming.id)
    if (current.ok && current.value) {
      await bridge.projects.save({ ...current.value, name })
    }
    setRenaming(null)
    await refresh()
  }

  const doDuplicate = async (projectId: string): Promise<void> => {
    const res = await getBridge().projects.duplicate({ projectId })
    if (!res.ok) {
      toast.show('No pudimos duplicar el comercial.', 'error')
      return
    }
    toast.show('Comercial duplicado.', 'success')
    await refresh()
  }

  const doDelete = async (): Promise<void> => {
    if (!deleting) return
    const res = await getBridge().projects.deleteCommercial({
      projectId: deleting.id,
      deleteExportedFiles: !deleting.keepExports,
    })
    setDeleting(null)
    if (!res.ok) {
      toast.show('No pudimos eliminar el comercial.', 'error')
      return
    }
    toast.show('Comercial eliminado.', 'success')
    await refresh()
  }

  const openExport = async (record: ExportRecordWithFileState, mode: 'file' | 'folder'): Promise<void> => {
    const bridge = getBridge()
    const res =
      mode === 'file'
        ? await bridge.render.openFile({ exportId: record.id })
        : await bridge.render.openFolder({ exportId: record.id })
    if (res.ok && !res.value.opened && res.value.message) {
      toast.show(res.value.message, 'info')
      await refresh()
    }
  }

  if (isBrowserPreview) {
    return (
      <div className={styles.empty}>
        <Icon name="folder" size={28} />
        <p>{copy.library.title} está disponible en la app de escritorio.</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className={styles.empty} data-testid="library-loading">
        <span>Cargando…</span>
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className={styles.empty} data-testid="library-empty">
        <Icon name="folder" size={28} />
        <p>{copy.library.empty}</p>
      </div>
    )
  }

  return (
    <section className={styles.library} aria-label={copy.library.title} data-testid="library">
      <h2 className={styles.heading}>{copy.library.title}</h2>
      <div className={styles.grid}>
        {rows.map(({ project, exports }) => {
          const thumb = firstThumb(project.id, project)
          const lastExport = exports[0] ?? null
          const isOpen = expanded === project.id
          return (
            <article
              key={project.id}
              className={styles.card}
              data-testid="commercial-card"
              data-project-id={project.id}
            >
              <div className={styles.cardThumb}>
                {thumb ? (
                  <img src={thumb} alt="" />
                ) : (
                  <Icon name="image" size={26} />
                )}
                <span className={styles.badge} data-testid="commercial-status">
                  {statusLabel(project, exports.length)}
                </span>
              </div>
              <div className={styles.cardBody}>
                <h3 className={styles.cardName} data-testid="commercial-name">
                  {project.name}
                </h3>
                <p className={styles.cardMeta}>
                  {fmtDate(project.updatedAt)} · {project.video.targetDurationSec}s ·{' '}
                  {project.video.aspectRatio}
                </p>
                <p className={styles.cardMeta}>
                  {project.media.length} archivo(s) · {exports.length} video(s)
                </p>

                <div className={styles.cardActions}>
                  <Button size="sm" onClick={() => onOpen(project.id, project.name)} data-testid="commercial-open">
                    {copy.library.open}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setRenaming({ id: project.id, name: project.name })}
                    data-testid="commercial-rename"
                  >
                    {copy.library.rename}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => void doDuplicate(project.id)}
                    data-testid="commercial-duplicate"
                  >
                    {copy.library.duplicate}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      setDeleting({ id: project.id, name: project.name, keepExports: true })
                    }
                    data-testid="commercial-delete"
                  >
                    {copy.library.remove}
                  </Button>
                  {lastExport && lastExport.fileExists ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => void openExport(lastExport, 'file')}
                      data-testid="commercial-open-last"
                    >
                      {copy.library.openLastVideo}
                    </Button>
                  ) : null}
                </div>

                <button
                  type="button"
                  className={styles.videosToggle}
                  onClick={() => setExpanded(isOpen ? null : project.id)}
                  data-testid="commercial-videos-toggle"
                >
                  <Icon name="chevron-right" size={16} />
                  {copy.library.videosTitle} ({exports.length})
                </button>

                {isOpen ? (
                  <div className={styles.videos} data-testid="commercial-videos">
                    {exports.length === 0 ? (
                      <p className={styles.cardMeta}>{copy.library.noVideos}</p>
                    ) : (
                      exports.map((record) => (
                        <div key={record.id} className={styles.videoRow} data-testid="video-row">
                          <div className={styles.videoInfo}>
                            <span className={styles.videoName}>
                              {record.outputPath.split(/[\\/]/).pop()}
                            </span>
                            <span className={styles.cardMeta}>
                              {record.width}×{record.height} · {Math.round(record.durationSec)}s ·{' '}
                              {fmtBytes(record.bytes)}
                              {!record.fileExists ? ` · ${copy.library.fileMissing}` : ''}
                            </span>
                          </div>
                          {record.fileExists ? (
                            <div className={styles.videoActions}>
                              <button onClick={() => void openExport(record, 'file')}>
                                {copy.library.play}
                              </button>
                              <button onClick={() => void openExport(record, 'folder')}>
                                {copy.library.openFolder}
                              </button>
                            </div>
                          ) : (
                            <span className={styles.videoMissing}>{copy.library.fileMissing}</span>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                ) : null}
              </div>
            </article>
          )
        })}
      </div>

      {/* ---------- Rename ---------- */}
      <Modal open={renaming !== null} title={copy.library.rename} testId="rename-dialog">
        {renaming ? (
          <>
            <input
              className={styles.renameInput}
              value={renaming.name}
              onChange={(e) => setRenaming({ ...renaming, name: e.target.value })}
              aria-label={copy.library.rename}
              data-testid="rename-input"
              autoFocus
            />
            <div className={styles.dialogActions}>
              <Button variant="secondary" onClick={() => setRenaming(null)}>
                {copy.library.cancel}
              </Button>
              <Button onClick={() => void doRename()} data-testid="rename-confirm">
                {copy.library.rename}
              </Button>
            </div>
          </>
        ) : null}
      </Modal>

      {/* ---------- Delete commercial ---------- */}
      <Modal open={deleting !== null} title={copy.library.deleteTitle} testId="delete-dialog">
        {deleting ? (
          <>
            <p className={styles.dialogBody}>{copy.library.deleteBody}</p>
            <label className={styles.keepExports}>
              <input
                type="checkbox"
                checked={deleting.keepExports}
                onChange={(e) => setDeleting({ ...deleting, keepExports: e.target.checked })}
                data-testid="delete-keep-exports"
              />
              <span>{copy.library.deleteKeepExports}</span>
            </label>
            <div className={styles.dialogActions}>
              <Button variant="secondary" onClick={() => setDeleting(null)} data-testid="delete-cancel">
                {copy.library.cancel}
              </Button>
              <Button onClick={() => void doDelete()} data-testid="delete-confirm">
                {copy.library.deleteConfirm}
              </Button>
            </div>
          </>
        ) : null}
      </Modal>
    </section>
  )
}
