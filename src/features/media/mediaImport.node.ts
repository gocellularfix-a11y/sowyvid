import { readFile, stat } from 'node:fs/promises'
import { basename } from 'node:path'
import { MediaVault, type MediaRecord } from '@jorge-engines/mediavault'
import type { MediaAsset } from '@shared/domain/media'
import {
  MAX_FILE_BYTES,
  extensionOf,
  isSupportedExtension,
  mimeForExtension,
  type MediaImportStatus,
} from './limits'
import type { MediaImportOutcome } from './types'

/**
 * Node-only media import service (`.node.ts` so the web build never pulls it in).
 * Wraps the generic MediaVault engine — validation, SHA-256 content IDs, dedup,
 * atomic managed copy, metadata — and maps its `MediaRecord` into SowyVid's
 * domain `MediaAsset`, which references a project-relative path (never the
 * original selected path). MediaVault knows nothing about SowyVid.
 */

export type MediaImportInput =
  | { kind: 'path'; path: string }
  | { kind: 'bytes'; originalName: string; bytes: Buffer }

export interface MediaImportSummary {
  outcomes: MediaImportOutcome[]
  /** The project's media list after the import (existing + newly referenced). */
  media: MediaAsset[]
}

/** Maps a MediaVault record into a SowyVid managed media asset. */
export function recordToAsset(record: MediaRecord): MediaAsset {
  return {
    id: record.id,
    kind: record.kind,
    // MediaVault root is <project>/media, so its `files/..` becomes `media/files/..`.
    relPath: `media/${record.relativePath}`,
    originalName: record.originalName,
    mimeType: mimeForExtension(record.extension),
    hash: record.contentHash,
    bytes: record.sizeBytes,
    width: record.width,
    height: record.height,
    orientation: record.orientation,
    durationSec: record.durationMs === null ? null : record.durationMs / 1000,
    hasAudio: record.hasAudio ?? record.kind === 'audio',
    thumbRelPath: null,
    valid: true,
    importedAt: record.importedAt,
  }
}

async function loadInput(
  input: MediaImportInput,
): Promise<{ originalName: string; bytes: Buffer }> {
  if (input.kind === 'bytes') return { originalName: input.originalName, bytes: input.bytes }
  const info = await stat(input.path)
  if (!info.isFile()) throw new Error('not a file')
  return { originalName: basename(input.path), bytes: await readFile(input.path) }
}

/**
 * Import a batch of files into the project's managed MediaVault. `vaultRoot`
 * should be `<project>/media`. Returns per-file outcomes plus the merged media
 * list (existing assets + newly imported/referenced, deduped by content ID).
 */
export async function importMedia(
  vaultRoot: string,
  existing: readonly MediaAsset[],
  inputs: readonly MediaImportInput[],
): Promise<MediaImportSummary> {
  const vault = new MediaVault(vaultRoot)
  const outcomes: MediaImportOutcome[] = []
  const byId = new Map(existing.map((m) => [m.id, m]))

  for (const input of inputs) {
    let originalName = input.kind === 'bytes' ? input.originalName : basename(input.path)
    try {
      const { originalName: name, bytes } = await loadInput(input)
      originalName = name
      const ext = extensionOf(name)

      if (!isSupportedExtension(ext)) {
        outcomes.push({ status: 'unsupported', originalName, detail: `extension .${ext || '?'}` })
        continue
      }
      if (bytes.length === 0) {
        outcomes.push({ status: 'empty', originalName })
        continue
      }
      if (bytes.length > MAX_FILE_BYTES) {
        outcomes.push({ status: 'oversized', originalName, detail: `${bytes.length} bytes` })
        continue
      }

      const result = await vault.importBytes({ originalName, bytes })
      const asset = recordToAsset(result.record)
      byId.set(asset.id, asset)
      outcomes.push({ status: result.duplicate ? 'duplicate' : 'imported', originalName, asset })
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      // MediaVault rejects extension-spoofed files (magic-byte mismatch).
      const status: MediaImportStatus = /does not match its extension/.test(message)
        ? 'unsupported'
        : 'failed'
      outcomes.push({ status, originalName, detail: message })
    }
  }

  return { outcomes, media: [...byId.values()] }
}

/** Remove a media asset from the managed vault and the project's list. */
export async function removeMedia(
  vaultRoot: string,
  existing: readonly MediaAsset[],
  mediaId: string,
): Promise<MediaAsset[]> {
  const vault = new MediaVault(vaultRoot)
  await vault.remove(mediaId)
  return existing.filter((m) => m.id !== mediaId)
}
