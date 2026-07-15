import { app } from 'electron'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'

/**
 * Canonical SowyVid application-data layout. User projects and media live here,
 * in the OS app-data directory — NEVER inside the source repository.
 *
 *   <userData>/
 *     database/            sql.js database file (+ atomic write temp)
 *     projects/<id>/       per-project managed media/thumbnails/audio/renders
 *     templates/           built-in + user template cache
 *     music/               local music library files
 *     logs/                structured logs
 *     cache/               derived/ephemeral cache (thumbnails, AI responses)
 */
export interface AppPaths {
  userData: string
  database: string
  projects: string
  templates: string
  music: string
  logs: string
  cache: string
}

let cached: AppPaths | null = null

export function getAppPaths(): AppPaths {
  if (cached) return cached
  const userData = app.getPath('userData')
  const paths: AppPaths = {
    userData,
    database: join(userData, 'database'),
    projects: join(userData, 'projects'),
    templates: join(userData, 'templates'),
    music: join(userData, 'music'),
    logs: join(userData, 'logs'),
    cache: join(userData, 'cache'),
  }
  for (const dir of [
    paths.database,
    paths.projects,
    paths.templates,
    paths.music,
    paths.logs,
    paths.cache,
  ]) {
    mkdirSync(dir, { recursive: true })
  }
  cached = paths
  return paths
}

/** The per-project managed folder. */
export function projectDir(projectId: string): string {
  return join(getAppPaths().projects, projectId)
}
