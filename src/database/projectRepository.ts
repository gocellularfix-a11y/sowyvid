import { nanoid } from 'nanoid'
import {
  Project,
  CreateProjectInput,
  BrandPreferences,
  VideoConfig,
  AudioConfig,
  RenderConfig,
  CommercialBrief,
  ProjectVersion,
} from '@shared/domain/project'
import { ExportRecord, type ExportFailureCode } from '@shared/domain/exportRecord'
import type { Database } from './port'

interface ProjectRow {
  id: string
  data: string
}

interface ExportRow {
  id: string
  project_id: string
  created_at: string
  completed_at: string | null
  status: string
  preset: string
  width: number
  height: number
  fps: number
  duration_sec: number
  output_path: string
  bytes: number
  video_codec: string | null
  audio_codec: string | null
  fingerprint: string | null
  failure_code: string | null
}

function exportFromRow(row: ExportRow): ExportRecord {
  return ExportRecord.parse({
    id: row.id,
    projectId: row.project_id,
    createdAt: row.created_at,
    completedAt: row.completed_at,
    status: row.status,
    preset: row.preset,
    width: row.width,
    height: row.height,
    fps: row.fps,
    durationSec: row.duration_sec,
    outputPath: row.output_path,
    bytes: row.bytes,
    videoCodec: row.video_codec,
    audioCodec: row.audio_codec,
    fingerprint: row.fingerprint,
    failureCode: row.failure_code,
  })
}

const EXPORT_COLUMNS = `id, project_id, created_at, completed_at, status, preset,
  width, height, fps, duration_sec, output_path, bytes, video_codec, audio_codec,
  fingerprint, failure_code`

/**
 * Persists projects and their history. Every value crossing the boundary is
 * validated with Zod: on write we validate before storing; on read we re-parse,
 * so a corrupted or out-of-date row surfaces as a clear error instead of
 * silently poisoning the app.
 */
export class ProjectRepository {
  constructor(private readonly db: Database) {}

  private now(): string {
    return new Date().toISOString()
  }

  create(input: unknown): Project {
    const parsed = CreateProjectInput.parse(input)
    const ts = this.now()
    const project = Project.parse({
      id: `proj_${nanoid(10)}`,
      name: parsed.name,
      brief: CommercialBrief.parse(parsed.brief ?? {}),
      brand: BrandPreferences.parse({}),
      video: VideoConfig.parse({}),
      audio: AudioConfig.parse({}),
      render: RenderConfig.parse({}),
      targetPlatform: 'instagram-reel',
      templateId: null,
      templateVersion: null,
      ruleEngineVersion: null,
      media: [],
      status: 'draft',
      createdAt: ts,
      updatedAt: ts,
    })
    this.insert(project)
    return project
  }

  private insert(project: Project): void {
    this.db.run(
      `INSERT INTO projects (id, name, status, template_id, concept_id, seed, created_at, updated_at, data)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        project.id,
        project.name,
        project.status,
        project.templateId,
        project.creative?.conceptId ?? null,
        project.creative?.seed ?? null,
        project.createdAt,
        project.updatedAt,
        JSON.stringify(project),
      ],
    )
  }

  /** Full replace of a project (autosave). Validates and bumps updatedAt. */
  save(input: unknown): Project {
    const incoming = Project.parse(input)
    const project: Project = { ...incoming, updatedAt: this.now() }
    this.db.run(
      `INSERT INTO projects (id, name, status, template_id, concept_id, seed, created_at, updated_at, data)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         status = excluded.status,
         template_id = excluded.template_id,
         concept_id = excluded.concept_id,
         seed = excluded.seed,
         updated_at = excluded.updated_at,
         data = excluded.data`,
      [
        project.id,
        project.name,
        project.status,
        project.templateId,
        project.creative?.conceptId ?? null,
        project.creative?.seed ?? null,
        project.createdAt,
        project.updatedAt,
        JSON.stringify(project),
      ],
    )
    return project
  }

  get(id: string): Project | undefined {
    const row = this.db.get<ProjectRow>('SELECT data FROM projects WHERE id = ?', [id])
    if (!row) return undefined
    return Project.parse(JSON.parse(row.data))
  }

  list(): Project[] {
    const rows = this.db.all<ProjectRow>(
      'SELECT data FROM projects ORDER BY updated_at DESC',
    )
    return rows.map((r) => Project.parse(JSON.parse(r.data)))
  }

  delete(id: string): boolean {
    const existed = this.db.get('SELECT id FROM projects WHERE id = ?', [id])
    this.db.run('DELETE FROM projects WHERE id = ?', [id])
    return Boolean(existed)
  }

  // ---- Version history (undo / compare) ----

  saveVersion(projectId: string, label: string): ProjectVersion {
    const project = this.get(projectId)
    if (!project) throw new Error(`Project not found: ${projectId}`)
    const version = ProjectVersion.parse({
      id: `ver_${nanoid(10)}`,
      projectId,
      label,
      createdAt: this.now(),
      snapshot: project,
    })
    this.db.run(
      `INSERT INTO project_versions (id, project_id, label, created_at, snapshot)
       VALUES (?, ?, ?, ?, ?)`,
      [version.id, projectId, label, version.createdAt, JSON.stringify(project)],
    )
    return version
  }

  listVersions(projectId: string): ProjectVersion[] {
    const rows = this.db.all<{ snapshot: string }>(
      'SELECT snapshot FROM project_versions WHERE project_id = ? ORDER BY created_at DESC',
      [projectId],
    )
    return rows.map((r) => {
      const parsed = JSON.parse(r.snapshot)
      return ProjectVersion.parse({
        id: `ver_readonly`,
        projectId,
        label: 'snapshot',
        createdAt: this.now(),
        snapshot: parsed,
      })
    })
  }

  restoreVersion(versionId: string): Project {
    const row = this.db.get<{ snapshot: string; project_id: string }>(
      'SELECT snapshot, project_id FROM project_versions WHERE id = ?',
      [versionId],
    )
    if (!row) throw new Error(`Version not found: ${versionId}`)
    const snapshot = Project.parse(JSON.parse(row.snapshot))
    return this.save(snapshot)
  }

  // ---- Export history ----
  //
  // One row per render ATTEMPT, created when the job starts and finalized when
  // it ends — so history tells the truth about failures and cancellations, not
  // just successes, and a job interrupted by an app crash is visible.

  /** Record a render job the moment it starts. */
  beginExport(input: {
    projectId: string
    preset: string
    outputPath: string
    fingerprint: string | null
  }): ExportRecord {
    const entry = ExportRecord.parse({
      id: `exp_${nanoid(10)}`,
      projectId: input.projectId,
      createdAt: this.now(),
      completedAt: null,
      status: 'rendering',
      preset: input.preset,
      width: 0,
      height: 0,
      fps: 0,
      durationSec: 0,
      outputPath: input.outputPath,
      bytes: 0,
      videoCodec: null,
      audioCodec: null,
      fingerprint: input.fingerprint,
      failureCode: null,
    })
    // `rel_path`/`platform` are legacy v1 columns (NOT NULL); mirror the new
    // fields into them so an old reader still sees something meaningful.
    this.db.run(
      `INSERT INTO export_history
       (id, project_id, created_at, rel_path, platform, width, height, duration_sec, bytes,
        completed_at, status, preset, fps, output_path, video_codec, audio_codec, fingerprint, failure_code)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.id, entry.projectId, entry.createdAt, entry.outputPath, entry.preset,
        entry.width, entry.height, entry.durationSec, entry.bytes,
        entry.completedAt, entry.status, entry.preset, entry.fps, entry.outputPath,
        entry.videoCodec, entry.audioCodec, entry.fingerprint, entry.failureCode,
      ],
    )
    return entry
  }

  /** Finalize a successful render with its measured facts. */
  completeExport(
    exportId: string,
    result: {
      width: number
      height: number
      fps: number
      durationSec: number
      bytes: number
      videoCodec: string | null
      audioCodec: string | null
      fingerprint: string | null
      outputPath: string
    },
  ): ExportRecord | undefined {
    this.db.run(
      `UPDATE export_history SET
         status = 'completed', completed_at = ?, width = ?, height = ?, fps = ?,
         duration_sec = ?, bytes = ?, video_codec = ?, audio_codec = ?,
         fingerprint = ?, output_path = ?, rel_path = ?
       WHERE id = ?`,
      [
        this.now(), result.width, result.height, result.fps,
        result.durationSec, result.bytes, result.videoCodec, result.audioCodec,
        result.fingerprint, result.outputPath, result.outputPath, exportId,
      ],
    )
    return this.getExport(exportId)
  }

  /** Finalize a failed or canceled render with a stable diagnostic code. */
  failExport(
    exportId: string,
    failureCode: ExportFailureCode,
    status: 'failed' | 'canceled' = failureCode === 'canceled' ? 'canceled' : 'failed',
  ): ExportRecord | undefined {
    this.db.run(
      `UPDATE export_history SET status = ?, completed_at = ?, failure_code = ? WHERE id = ?`,
      [status, this.now(), failureCode, exportId],
    )
    return this.getExport(exportId)
  }

  getExport(exportId: string): ExportRecord | undefined {
    const row = this.db.get<ExportRow>(
      `SELECT ${EXPORT_COLUMNS} FROM export_history WHERE id = ?`,
      [exportId],
    )
    return row ? exportFromRow(row) : undefined
  }

  listExports(projectId: string): ExportRecord[] {
    const rows = this.db.all<ExportRow>(
      `SELECT ${EXPORT_COLUMNS} FROM export_history WHERE project_id = ? ORDER BY created_at DESC`,
      [projectId],
    )
    return rows.map(exportFromRow)
  }

  /**
   * Startup repair: any row still 'rendering' means the app died mid-render.
   * Mark it failed/interrupted so history never shows a phantom active job —
   * and so a fresh render is never blocked by a ghost.
   */
  markInterruptedExports(): number {
    const rows = this.db.all<{ id: string }>(
      `SELECT id FROM export_history WHERE status = 'rendering'`,
    )
    for (const row of rows) this.failExport(row.id, 'interrupted', 'failed')
    return rows.length
  }
}
