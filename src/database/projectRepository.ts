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
import type { Database } from './port'

interface ProjectRow {
  id: string
  data: string
}

interface ExportRecordInput {
  relPath: string
  platform: string
  width: number
  height: number
  durationSec: number
  bytes: number
}

export interface ExportRecord extends ExportRecordInput {
  id: string
  projectId: string
  createdAt: string
}

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

  addExport(projectId: string, record: ExportRecordInput): ExportRecord {
    const entry: ExportRecord = {
      id: `exp_${nanoid(10)}`,
      projectId,
      createdAt: this.now(),
      ...record,
    }
    this.db.run(
      `INSERT INTO export_history
       (id, project_id, created_at, rel_path, platform, width, height, duration_sec, bytes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.id,
        projectId,
        entry.createdAt,
        entry.relPath,
        entry.platform,
        entry.width,
        entry.height,
        entry.durationSec,
        entry.bytes,
      ],
    )
    return entry
  }

  listExports(projectId: string): ExportRecord[] {
    const rows = this.db.all<{
      id: string
      project_id: string
      created_at: string
      rel_path: string
      platform: string
      width: number
      height: number
      duration_sec: number
      bytes: number
    }>(
      'SELECT * FROM export_history WHERE project_id = ? ORDER BY created_at DESC',
      [projectId],
    )
    return rows.map((r) => ({
      id: r.id,
      projectId: r.project_id,
      createdAt: r.created_at,
      relPath: r.rel_path,
      platform: r.platform,
      width: r.width,
      height: r.height,
      durationSec: r.duration_sec,
      bytes: r.bytes,
    }))
  }
}
