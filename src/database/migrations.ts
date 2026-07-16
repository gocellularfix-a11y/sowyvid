import type { Database } from './port'

/** An ordered, append-only list of schema migrations. Never edit a past one. */
export interface Migration {
  version: number
  name: string
  up: string
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'initial-schema',
    up: `
      CREATE TABLE projects (
        id            TEXT PRIMARY KEY,
        name          TEXT NOT NULL,
        status        TEXT NOT NULL,
        template_id   TEXT,
        created_at    TEXT NOT NULL,
        updated_at    TEXT NOT NULL,
        data          TEXT NOT NULL   -- full validated Project JSON
      );
      CREATE INDEX idx_projects_updated ON projects(updated_at DESC);

      CREATE TABLE project_versions (
        id          TEXT PRIMARY KEY,
        project_id  TEXT NOT NULL,
        label       TEXT NOT NULL,
        created_at  TEXT NOT NULL,
        snapshot    TEXT NOT NULL,   -- full Project JSON snapshot
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      );
      CREATE INDEX idx_versions_project ON project_versions(project_id, created_at DESC);

      CREATE TABLE export_history (
        id          TEXT PRIMARY KEY,
        project_id  TEXT NOT NULL,
        created_at  TEXT NOT NULL,
        rel_path    TEXT NOT NULL,
        platform    TEXT NOT NULL,
        width       INTEGER NOT NULL,
        height      INTEGER NOT NULL,
        duration_sec REAL NOT NULL,
        bytes       INTEGER NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      );
      CREATE INDEX idx_exports_project ON export_history(project_id, created_at DESC);
    `,
  },
  {
    version: 2,
    name: 'creative-selection-columns',
    // Northstar creative-engine integration. Non-destructive: existing rows get
    // NULL for the new columns and continue to load (full project data lives in
    // the JSON `data` column; these are indexed conveniences for reproducibility).
    up: `
      ALTER TABLE projects ADD COLUMN concept_id TEXT;
      ALTER TABLE projects ADD COLUMN seed TEXT;
      CREATE INDEX idx_projects_concept ON projects(concept_id);
    `,
  },
  {
    version: 3,
    name: 'export-history-render-jobs',
    // Owner-facing MP4 export. Non-destructive: the v1 export_history columns
    // stay; new columns describe the full render-job lifecycle. Legacy rows (if
    // any existed) read as completed exports with unknown codecs.
    //
    // `output_path` is the owner-chosen absolute destination — the one place an
    // absolute path is allowed to persist. `status` rows left at 'rendering' on
    // startup mean the app died mid-render; the repository marks them
    // 'failed'/'interrupted' so history never shows a phantom in-progress job.
    up: `
      ALTER TABLE export_history ADD COLUMN completed_at TEXT;
      ALTER TABLE export_history ADD COLUMN status TEXT NOT NULL DEFAULT 'completed';
      ALTER TABLE export_history ADD COLUMN preset TEXT NOT NULL DEFAULT '';
      ALTER TABLE export_history ADD COLUMN fps REAL NOT NULL DEFAULT 0;
      ALTER TABLE export_history ADD COLUMN output_path TEXT NOT NULL DEFAULT '';
      ALTER TABLE export_history ADD COLUMN video_codec TEXT;
      ALTER TABLE export_history ADD COLUMN audio_codec TEXT;
      ALTER TABLE export_history ADD COLUMN fingerprint TEXT;
      ALTER TABLE export_history ADD COLUMN failure_code TEXT;
      CREATE INDEX idx_exports_status ON export_history(status);
    `,
  },
]

/**
 * Applies any migrations newer than the database's current version, inside a
 * transaction. Idempotent: safe to run on every startup.
 */
export function runMigrations(db: Database): number {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL
  );`)

  const rows = db.all<{ version: number }>('SELECT version FROM schema_migrations')
  const applied = new Set(rows.map((r) => r.version))

  let last = 0
  for (const migration of [...MIGRATIONS].sort((a, b) => a.version - b.version)) {
    if (applied.has(migration.version)) {
      last = Math.max(last, migration.version)
      continue
    }
    db.transaction(() => {
      db.exec(migration.up)
      db.run('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)', [
        migration.version,
        migration.name,
        new Date().toISOString(),
      ])
    })
    last = migration.version
  }
  return last
}

export function currentSchemaVersion(db: Database): number {
  const row = db.get<{ v: number | null }>('SELECT MAX(version) AS v FROM schema_migrations')
  return row?.v ?? 0
}
