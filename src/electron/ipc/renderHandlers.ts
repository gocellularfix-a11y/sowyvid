import { app, dialog, shell, BrowserWindow } from 'electron'
import { z } from 'zod'
import { existsSync, statSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join, dirname } from 'node:path'
import { IPC } from '@shared/ipc/channels'
import { ok, err } from '@shared/result'
import type {
  RenderStartResult,
  RenderStatusResult,
  OpenExportResult,
} from '@shared/ipc/api'
import type { Project } from '@shared/domain/project'
import type { ExportRecordWithFileState, ExportFailureCode } from '@shared/domain/exportRecord'
import { compileProjectConcept } from '@features/creative'
import { visualPlanForProject } from '@features/visual'
import { audioPlanForProject } from '@features/audio'
import { visualPlanToCompositionProps, type CommercialCompositionProps } from '@render/remotionProps'
import { audioPlanToCompositionAudio } from '@render/remotionAudio'
import { runRenderJob } from '@features/render/renderJob.node'
import { RenderJobRegistry, RenderBusyError, type RenderJobSnapshot } from '@features/render/jobRegistry'
import { evaluateRenderReadiness } from '@features/render/readiness'
import {
  ExportPresetId,
  EXPORT_PRESETS,
  defaultPresetFor,
  presetIsRenderable,
  toRenderPreset,
} from '@features/render/exportPresets'
import { defaultExportFileName, numberedIfTaken } from '@features/render/fileNaming'
import { resolveManagedMediaPath, type MediaVariant } from '@features/media/managedPath'
import { unpackedBinaryPath } from '@features/media/unpackedPath'
import { resolveMusicTrackFrom, resolveMusicPathFrom } from './musicResolvers'
import type { VisualPlan } from '@features/visual/visualPlan'
import type { AudioPlan } from '@features/audio/audioPlan'
import { getRenderEnvironment } from '../renderEnvironment'
import { projectDir } from '../paths'
import { handle } from './registry'
import type { HandlerContext } from './registerHandlers'

/**
 * The owner's MP4 export, end to end (§3–§8).
 *
 * Security shape: the renderer sends ONLY `{ projectId, presetId }` /
 * `{ jobId }` / `{ exportId }`. Every path, dimension, composition prop and
 * asset reference is reconstructed HERE from persisted project data — the
 * renderer cannot inject a source path, a bundle path, a composition module,
 * or an executable argument. The destination comes from a native save dialog
 * shown by this process (or the E2E seam, below).
 *
 * E2E seam: when `SOWYVID_E2E_EXPORT_DIR` is set the save dialog is skipped
 * and a numbered filename inside that directory is used. It changes WHERE the
 * dialog answer comes from and nothing else — the render path is identical.
 */

const registry = new RenderJobRegistry()
const execFileAsync = promisify(execFile)

/** Extract a poster frame from a finished export into <project>/renders/. */
async function generateExportPoster(
  projectId: string,
  exportId: string,
  videoPath: string,
): Promise<void> {
  try {
    const { binariesDirectory } = getRenderEnvironment()
    const ffmpeg = binariesDirectory
      ? join(binariesDirectory, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg')
      : null
    const bin = ffmpeg && existsSync(ffmpeg) ? ffmpeg : await devFfmpeg()
    if (!bin) return
    const outDir = join(projectDir(projectId), 'renders')
    await mkdir(outDir, { recursive: true })
    await execFileAsync(
      bin,
      ['-y', '-ss', '1', '-i', videoPath, '-frames:v', '1', '-vf', 'scale=480:-2', join(outDir, `${exportId}.jpg`)],
      { timeout: 20_000 },
    )
  } catch {
    // Poster is decorative; the export record stands on its own.
  }
}

async function devFfmpeg(): Promise<string | null> {
  try {
    const mod = await import('ffmpeg-static')
    const reported = mod.default ?? null
    return reported ? unpackedBinaryPath(reported) : null
  } catch {
    return null
  }
}

/** Rebuild everything a render needs from the persisted project. Deterministic. */
function buildArtifacts(ctx: HandlerContext, project: Project): {
  visualPlan: VisualPlan
  audioPlan: AudioPlan
  props: CommercialCompositionProps
} {
  if (!project.creative) throw new Error('project has no compiled concept')
  const { renderPlan } = compileProjectConcept(project, project.creative.conceptId)
  const visualPlan = visualPlanForProject(project, renderPlan)
  const audioPlan = audioPlanForProject(project, visualPlan, resolveMusicTrackFrom(ctx.musicRepo))
  const props = visualPlanToCompositionProps(visualPlan, project.id, project.media, {
    audio: audioPlanToCompositionAudio(audioPlan),
    textLayouts: project.textLayouts,
  })
  return { visualPlan, audioPlan, props }
}

function readinessFor(ctx: HandlerContext, projectId: string): RenderStatusResult {
  const project = ctx.repo.get(projectId) ?? null
  let visualPlan: VisualPlan | null = null
  let audioPlan: AudioPlan | null = null
  let aspect = '9:16'
  if (project?.creative) {
    try {
      const artifacts = buildArtifacts(ctx, project)
      visualPlan = artifacts.visualPlan
      audioPlan = artifacts.audioPlan
      aspect = artifacts.visualPlan.aspectRatio
    } catch {
      // Compilation failure surfaces as invalid-plan blockers below.
    }
  }
  const base = project ? projectDir(project.id) : ''
  const readiness = evaluateRenderReadiness({
    project,
    visualPlan,
    audioPlan,
    renderActive: registry.activeForProject(projectId) !== null,
    fileExists: (rel) => existsSync(join(base, rel)),
  })
  return {
    active: registry.activeForProject(projectId),
    readiness,
    presets: EXPORT_PRESETS.map((p) => ({ ...p, renderable: presetIsRenderable(p.id, aspect) })),
    defaultPreset: defaultPresetFor(aspect),
  }
}

/** Owner-chosen destination: native save dialog, or the E2E seam. */
async function chooseDestination(project: Project, directoryHint?: string): Promise<string | null> {
  const fileName = defaultExportFileName(project.name)

  const seamDir = process.env.SOWYVID_E2E_EXPORT_DIR
  const dir = directoryHint ?? seamDir
  if (dir) {
    // Never overwrite silently — number instead (the dialog path gets the
    // native replace prompt; this path has no dialog, so it numbers).
    const chosen = numberedIfTaken(fileName, (candidate) => existsSync(join(dir, candidate)))
    return join(dir, chosen)
  }

  const parent = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  const options: Electron.SaveDialogOptions = {
    title: 'Guardar tu comercial',
    defaultPath: join(app.getPath('videos'), fileName),
    filters: [{ name: 'Video MP4', extensions: ['mp4'] }],
  }
  const picked = await (parent ? dialog.showSaveDialog(parent, options) : dialog.showSaveDialog(options))
  if (picked.canceled || !picked.filePath) return null
  // The native dialog already asked about replacing an existing file.
  return picked.filePath.toLowerCase().endsWith('.mp4') ? picked.filePath : `${picked.filePath}.mp4`
}

/** Map a render failure to a stable owner-safe diagnostic code. */
function classifyRenderError(error: unknown): ExportFailureCode {
  const message = error instanceof Error ? error.message : String(error)
  if (/ENOENT|EPERM|EACCES|ENOSPC|EBUSY|EXDEV/.test(message) && /\.mp4|rename|copyfile|mkdir/i.test(message)) {
    return 'output-unavailable'
  }
  if (/browser|chrome|chromium|compositor|ffmpeg|ffprobe/i.test(message) && /not found|could not|no such|resolve|download/i.test(message)) {
    return 'tools-unavailable'
  }
  return 'render-failed'
}

function startJob(
  ctx: HandlerContext,
  project: Project,
  presetId: ExportPresetId,
  outputPath: string,
): RenderJobSnapshot {
  const { props } = buildArtifacts(ctx, project)
  const env = getRenderEnvironment()
  const preset = toRenderPreset(presetId)

  // Same ID-only, traversal-guarded resolution the media protocol uses.
  const resolveAsset = (projectId: string, mediaId: string, variant: MediaVariant): string | null => {
    const owner = ctx.repo.get(projectId)
    const asset = owner?.media.find((m) => m.id === mediaId)
    if (!asset) return null
    return resolveManagedMediaPath(projectDir(projectId), asset, variant)
  }
  // A selected global Music Center track is served to the render's headless
  // Chrome the same way, addressed by stable track id through the vault guard.
  const resolveMusic = resolveMusicPathFrom(ctx.musicRepo)

  return registry.start(project.id, {
    beginHistory: () => {
      const record = ctx.repo.beginExport({
        projectId: project.id,
        preset: presetId,
        outputPath,
        fingerprint: null,
      })
      void ctx.db.persist()
      return record.id
    },
    completeHistory: async (exportId, result) => {
      ctx.repo.completeExport(exportId, {
        width: result.width,
        height: result.height,
        fps: result.fps,
        durationSec: result.durationInFrames / result.fps,
        bytes: result.bytes,
        videoCodec: 'h264',
        audioCodec: result.hasAudio ? 'aac' : null,
        fingerprint: result.fingerprint,
        outputPath: result.outputPath,
      })
      // Awaited by the registry: "completed" is only reported once this row is
      // durable, so a restart right after success still shows the export.
      await ctx.db.persist()
      // A visible still for the export library. Best-effort and detached: a
      // missing poster degrades to an icon, never to a failed export.
      void generateExportPoster(project.id, exportId, result.outputPath)
    },
    failHistory: async (exportId, code) => {
      ctx.repo.failExport(exportId, code)
      await ctx.db.persist()
    },
    classifyError: classifyRenderError,
    run: async ({ signal, onProgress }) => {
      const result = await runRenderJob(
        {
          projectId: project.id,
          props,
          preset,
          outputPath,
          cache: env.cache,
          tempRoot: env.tempRoot,
          browserExecutable: env.browserExecutable,
          binariesDirectory: env.binariesDirectory,
          resolveAsset,
          resolveMusic,
        },
        { signal, onProgress },
      )
      return { ...result, bytes: statSync(result.outputPath).size }
    },
  })
}

export function registerRenderHandlers(ctx: HandlerContext): void {
  // App died mid-render last time? Repair history so no phantom job lingers.
  const repaired = ctx.repo.markInterruptedExports()
  if (repaired > 0) void ctx.db.persist()

  // Fan job updates out to every window.
  registry.onUpdate((snapshot) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(IPC.RenderProgress, snapshot)
    }
  })

  handle(IPC.RenderStatus, z.object({ projectId: z.string() }), ({ projectId }) =>
    ok(readinessFor(ctx, projectId)),
  )

  handle(
    IPC.RenderStart,
    z.object({ projectId: z.string(), presetId: ExportPresetId }),
    async ({ projectId, presetId }) => {
      const project = ctx.repo.get(projectId)
      if (!project) return err('NOT_FOUND', `Project not found: ${projectId}`)

      // Gate exactly as the button does — a stale renderer cannot bypass it.
      const status = readinessFor(ctx, projectId)
      if (!status.readiness.ready) {
        return err('NOT_READY', status.readiness.blockers[0]?.message ?? 'No está listo.', {
          blockers: status.readiness.blockers,
        })
      }
      const preset = status.presets.find((p) => p.id === presetId)
      if (!preset?.renderable) {
        return err('NOT_READY', 'Ese formato no coincide con el diseño del comercial.')
      }

      const outputPath = await chooseDestination(project)
      if (!outputPath) {
        const result: RenderStartResult = { canceled: true, job: null }
        return ok(result)
      }

      try {
        const job = startJob(ctx, project, presetId, outputPath)
        const result: RenderStartResult = { canceled: false, job }
        return ok(result)
      } catch (e) {
        if (e instanceof RenderBusyError) {
          return err('BUSY', 'Ya hay una exportación en curso para este proyecto.')
        }
        throw e
      }
    },
  )

  handle(IPC.RenderCancel, z.object({ jobId: z.string() }), ({ jobId }) =>
    ok(registry.cancel(jobId)),
  )

  handle(IPC.RenderListHistory, z.object({ projectId: z.string() }), ({ projectId }) => {
    const records: ExportRecordWithFileState[] = ctx.repo.listExports(projectId).map((r) => ({
      ...r,
      fileExists: r.status === 'completed' && existsSync(r.outputPath),
    }))
    return ok(records)
  })

  handle(IPC.RenderListHistoryAll, z.any(), () => {
    const records: ExportRecordWithFileState[] = ctx.repo.listAllExports().map((r) => ({
      ...r,
      fileExists: r.status === 'completed' && existsSync(r.outputPath),
    }))
    return ok(records)
  })

  handle(IPC.RenderRetry, z.object({ exportId: z.string() }), async ({ exportId }) => {
    const record = ctx.repo.getExport(exportId)
    if (!record) return err('NOT_FOUND', 'No encontramos esa exportación.')
    const project = ctx.repo.get(record.projectId)
    if (!project) return err('NOT_FOUND', 'No encontramos el proyecto.')

    const status = readinessFor(ctx, record.projectId)
    if (!status.readiness.ready) {
      return err('NOT_READY', status.readiness.blockers[0]?.message ?? 'No está listo.', {
        blockers: status.readiness.blockers,
      })
    }

    const presetParsed = ExportPresetId.safeParse(record.preset)
    const presetId = presetParsed.success ? presetParsed.data : status.defaultPreset

    // Reuse the original folder with a fresh numbered name; if that folder is
    // gone, fall back to asking the owner where to save.
    const folder = dirname(record.outputPath)
    const outputPath = existsSync(folder)
      ? await chooseDestination(project, folder)
      : await chooseDestination(project)
    if (!outputPath) {
      const result: RenderStartResult = { canceled: true, job: null }
      return ok(result)
    }

    try {
      const job = startJob(ctx, project, presetId, outputPath)
      const result: RenderStartResult = { canceled: false, job }
      return ok(result)
    } catch (e) {
      if (e instanceof RenderBusyError) {
        return err('BUSY', 'Ya hay una exportación en curso para este proyecto.')
      }
      throw e
    }
  })

  const openExport = async (
    exportId: string,
    mode: 'file' | 'folder',
  ): Promise<OpenExportResult> => {
    const record = ctx.repo.getExport(exportId)
    if (!record || record.status !== 'completed') {
      return { opened: false, fileExists: false, message: 'Esa exportación no está disponible.' }
    }
    if (!existsSync(record.outputPath)) {
      return {
        opened: false,
        fileExists: false,
        message: 'El archivo ya no está donde se guardó. Puede haber sido movido o eliminado.',
      }
    }
    // Test seam: validate everything but skip the real window-opening side
    // effect, so automated runs don't spawn players/Explorer windows.
    if (process.env.SOWYVID_E2E_SUPPRESS_OPEN === '1') {
      return { opened: true, fileExists: true, message: null }
    }
    // Electron's safe shell APIs only — never a shell command built from a path.
    if (mode === 'folder') {
      shell.showItemInFolder(record.outputPath)
      return { opened: true, fileExists: true, message: null }
    }
    const failure = await shell.openPath(record.outputPath)
    return failure
      ? { opened: false, fileExists: true, message: 'No se pudo abrir el video con el reproductor del sistema.' }
      : { opened: true, fileExists: true, message: null }
  }

  handle(IPC.RenderOpenFile, z.object({ exportId: z.string() }), ({ exportId }) =>
    openExport(exportId, 'file').then(ok),
  )
  handle(IPC.RenderOpenFolder, z.object({ exportId: z.string() }), ({ exportId }) =>
    openExport(exportId, 'folder').then(ok),
  )
}
