import type { MediaAsset } from '@shared/domain/media'
import type { Project } from '@shared/domain/project'
import type { MediaImportStatus } from './limits'

/** Per-file result of an import batch (isomorphic — safe for the IPC contract). */
export interface MediaImportOutcome {
  status: MediaImportStatus
  originalName: string
  /** Present when status is 'imported' or 'duplicate'. */
  asset?: MediaAsset
  /** Developer-facing reason for non-success (never shown raw to the owner). */
  detail?: string
}

/** Result returned to the renderer from a media import request. */
export interface MediaImportResult {
  /** True when the owner cancelled the file dialog. */
  canceled: boolean
  outcomes: MediaImportOutcome[]
  /** The project with its updated media list persisted. */
  project: Project
}
