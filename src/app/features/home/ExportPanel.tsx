import { useCallback, useEffect, useState } from 'react'
import { Button } from '../../ui/Button'
import { getBridge } from '../../bridge'
import type { RenderStatusResult } from '@shared/ipc/api'
import type { RenderJobSnapshot } from '@features/render/jobRegistry'
import type { ExportPresetId } from '@features/render/exportPresets'
import type { ExportRecordWithFileState, ExportFailureCode } from '@shared/domain/exportRecord'
import styles from './HomeWorkspace.module.css'

/**
 * "Descargar video" (§6–§8). Renders nothing itself — every render decision
 * lives in the main process; this panel sends ids, shows state, and never sees
 * a stack trace, an ffmpeg log, or an internal path.
 */

/** Stable diagnostic codes → calm Spanish copy. */
const FAILURE_TEXT: Record<ExportFailureCode, string> = {
  interrupted: 'La aplicación se cerró antes de terminar. Intenta exportar de nuevo.',
  canceled: 'Cancelaste esta exportación.',
  'output-unavailable': 'No pudimos guardar en esa carpeta. Elige otra carpeta e intenta de nuevo.',
  'missing-media': 'Falta parte del material del comercial. Revisa tus fotos, videos y música.',
  'tools-unavailable': 'Faltan componentes de video de la aplicación. Reinstala SowyVid e intenta de nuevo.',
  'render-failed': 'Algo falló al crear el video. Intenta de nuevo.',
}

function fileNameOf(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}
function folderOf(path: string): string {
  const parts = path.split(/[\\/]/)
  return parts.slice(0, -1).join('\\')
}
function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`
  if (bytes >= 1_000) return `${Math.round(bytes / 1_000)} KB`
  return `${bytes} B`
}

export function ExportPanel({ projectId }: { projectId: string }): JSX.Element {
  const [status, setStatus] = useState<RenderStatusResult | null>(null)
  const [preset, setPreset] = useState<ExportPresetId | null>(null)
  const [job, setJob] = useState<RenderJobSnapshot | null>(null)
  const [history, setHistory] = useState<ExportRecordWithFileState[]>([])
  const [notice, setNotice] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const bridge = getBridge()
    const [statusResult, historyResult] = await Promise.all([
      bridge.render.status({ projectId }),
      bridge.render.listHistory({ projectId }),
    ])
    if (statusResult.ok) {
      setStatus(statusResult.value)
      setPreset((current) => current ?? statusResult.value.defaultPreset)
      if (statusResult.value.active) setJob(statusResult.value.active)
    }
    if (historyResult.ok) setHistory(historyResult.value)
  }, [projectId])

  useEffect(() => {
    void refresh()
    // Live job updates from the main process.
    const unsubscribe = getBridge().on('render:progress', (payload) => {
      const snapshot = payload as RenderJobSnapshot
      if (snapshot.projectId !== projectId) return
      setJob(snapshot)
      if (snapshot.state === 'completed' || snapshot.state === 'failed' || snapshot.state === 'canceled') {
        void refresh()
      }
    })
    return unsubscribe
  }, [projectId, refresh])

  const start = async (): Promise<void> => {
    setNotice(null)
    const result = await getBridge().render.start({
      projectId,
      presetId: preset ?? status?.defaultPreset ?? 'vertical',
    })
    if (!result.ok) {
      setNotice(result.error.code === 'NOT_READY' || result.error.code === 'BUSY'
        ? result.error.message
        : FAILURE_TEXT['render-failed'])
      return
    }
    if (result.value.canceled) return // owner dismissed the save dialog
    setJob(result.value.job)
  }

  const cancel = async (): Promise<void> => {
    if (job) await getBridge().render.cancel({ jobId: job.jobId })
  }

  const retry = async (exportId: string): Promise<void> => {
    setNotice(null)
    const result = await getBridge().render.retry({ exportId })
    if (!result.ok) {
      setNotice(result.error.message)
      return
    }
    if (!result.value.canceled) setJob(result.value.job)
  }

  const open = async (exportId: string, mode: 'file' | 'folder'): Promise<void> => {
    const bridge = getBridge()
    const result = mode === 'file'
      ? await bridge.render.openFile({ exportId })
      : await bridge.render.openFolder({ exportId })
    if (result.ok && !result.value.opened && result.value.message) {
      setNotice(result.value.message)
      void refresh() // a deleted file should now show as missing in history
    }
  }

  const active = job && ['queued', 'preparing', 'bundling', 'rendering', 'publishing'].includes(job.state)
  const ready = status?.readiness.ready ?? false
  const blocker = status?.readiness.blockers[0]?.message ?? null
  const completedRecord = job?.state === 'completed'
    ? history.find((h) => h.id === job.exportId) ?? null
    : null

  return (
    <div className={styles.exportPanel} data-testid="export-panel">
      {/* ---------- presets ---------- */}
      {status && status.presets.length > 0 && !active && job?.state !== 'completed' ? (
        <div className={styles.exportPresets} role="radiogroup" aria-label="Formato del video">
          {status.presets.map((p) => (
            <label key={p.id} className={styles.exportPreset} data-disabled={!p.renderable}>
              <input
                type="radio"
                name="export-preset"
                checked={(preset ?? status.defaultPreset) === p.id}
                disabled={!p.renderable}
                onChange={() => setPreset(p.id)}
                data-testid={`export-preset-${p.id}`}
              />
              <span>
                {p.label}
                {p.sizeLabel ? ` — ${p.sizeLabel}` : ''}
                {!p.renderable ? ' (no coincide con el diseño)' : ''}
              </span>
            </label>
          ))}
        </div>
      ) : null}

      {/* ---------- ready / blocked ---------- */}
      {!active && job?.state !== 'completed' && job?.state !== 'failed' ? (
        <>
          <Button
            block
            leftIcon="download"
            onClick={() => void start()}
            disabled={!ready}
            data-testid="export-download"
          >
            Descargar video
          </Button>
          {!ready && blocker ? (
            <p className={styles.exportBlocker} data-testid="export-blocker">{blocker}</p>
          ) : null}
          {job?.state === 'canceled' ? (
            <p className={styles.exportNotice} data-testid="export-canceled">
              Exportación cancelada. Puedes intentarlo de nuevo cuando quieras.
            </p>
          ) : null}
        </>
      ) : null}

      {/* ---------- rendering ---------- */}
      {active && job ? (
        <div className={styles.exportProgress} data-testid="export-progress">
          <div className={styles.exportProgressBar}>
            <div
              className={styles.exportProgressFill}
              style={{ width: `${Math.round(job.progress * 100)}%` }}
            />
          </div>
          <div className={styles.exportProgressRow}>
            <span data-testid="export-stage">{job.stage}</span>
            <span data-testid="export-percent">{Math.round(job.progress * 100)}%</span>
          </div>
          <Button variant="secondary" block onClick={() => void cancel()} data-testid="export-cancel">
            Cancelar
          </Button>
        </div>
      ) : null}

      {/* ---------- completed ---------- */}
      {job?.state === 'completed' && job.result ? (
        <div className={styles.exportDone} data-testid="export-completed">
          <p className={styles.exportDoneTitle}>✓ Tu comercial está listo</p>
          <p className={styles.exportDoneDetail} data-testid="export-file-name">
            {fileNameOf(job.result.outputPath)}
            {completedRecord ? ` · ${formatBytes(completedRecord.bytes)}` : ''}
          </p>
          <p className={styles.exportDoneDetail}>{folderOf(job.result.outputPath)}</p>
          <div className={styles.exportDoneActions}>
            <Button variant="secondary" onClick={() => void open(job.exportId, 'file')} data-testid="export-open-file">
              Abrir video
            </Button>
            <Button variant="secondary" onClick={() => void open(job.exportId, 'folder')} data-testid="export-open-folder">
              Abrir carpeta
            </Button>
            <Button onClick={() => setJob(null)} data-testid="export-another">
              Crear otra versión
            </Button>
          </div>
        </div>
      ) : null}

      {/* ---------- failed ---------- */}
      {job?.state === 'failed' ? (
        <div className={styles.exportFailed} data-testid="export-failed">
          <p>{FAILURE_TEXT[job.failureCode ?? 'render-failed']}</p>
          <p className={styles.exportCode}>Código: {job.failureCode ?? 'render-failed'}</p>
          <div className={styles.exportDoneActions}>
            <Button onClick={() => void retry(job.exportId)} data-testid="export-retry">
              Reintentar
            </Button>
            <Button variant="secondary" onClick={() => setJob(null)}>
              Volver
            </Button>
          </div>
        </div>
      ) : null}

      {notice ? <p className={styles.exportNotice} data-testid="export-notice">{notice}</p> : null}

      {/* ---------- history ---------- */}
      {history.length > 0 ? (
        <div className={styles.exportHistory} data-testid="export-history">
          <p className={styles.exportHistoryTitle}>Exportaciones anteriores</p>
          {history.slice(0, 5).map((record) => (
            <div key={record.id} className={styles.exportHistoryRow} data-testid="export-history-row">
              <span className={styles.exportHistoryName}>
                {fileNameOf(record.outputPath)}
                {record.status === 'completed' && !record.fileExists ? ' — Archivo no encontrado' : ''}
                {record.status === 'failed' ? ' (falló)' : ''}
                {record.status === 'canceled' ? ' (cancelada)' : ''}
              </span>
              <span className={styles.exportHistoryActions}>
                {record.status === 'completed' && record.fileExists ? (
                  <>
                    <button onClick={() => void open(record.id, 'file')}>Abrir</button>
                    <button onClick={() => void open(record.id, 'folder')}>Carpeta</button>
                  </>
                ) : null}
                {record.status === 'failed' ? (
                  <button onClick={() => void retry(record.id)}>Reintentar</button>
                ) : null}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
