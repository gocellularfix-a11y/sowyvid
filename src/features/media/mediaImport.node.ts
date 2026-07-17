import { stat, rm } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { basename, join } from 'node:path'
import { Readable } from 'node:stream'
import { MediaVault, EXTENSION_KIND, type MediaRecord } from '@jorge-engines/mediavault'
import type { MediaAsset } from '@shared/domain/media'
import {
  MAX_FILE_BYTES,
  extensionOf,
  isSupportedExtension,
  mimeForExtension,
  type MediaImportStatus,
} from './limits'
import type { MediaImportOutcome } from './types'
import { streamImport } from './streamingImport.node'

/**
 * Node-only media import service (`.node.ts` so the web build never pulls it in).
 * Uses the streaming importer (bounded memory) over the generic MediaVault store,
 * and maps its `MediaRecord` into SowyVid's domain `MediaAsset`, which references
 * a project-relative path (never the original selected path). MediaVault knows
 * nothing about SowyVid.
 */

export type MediaImportInput =
  | { kind: 'path'; path: string }
  | { kind: 'bytes'; originalName: string; bytes: Buffer }

/** Reduce any name to a safe basename (no directories, no control chars). */
function safeName(name: string): string {
  const base = basename(name)
  let out = ''
  for (const ch of base) {
    const code = ch.codePointAt(0) ?? 0
    if (code >= 0x20 && code !== 0x7f) out += ch
  }
  return out.trim().slice(0, 200) || 'unnamed'
}

export interface MediaImportSummary {
  outcomes: MediaImportOutcome[]
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
    fps: null,
    hasAudio: record.hasAudio ?? record.kind === 'audio',
    container: null,
    videoCodec: null,
    audioCodec: null,
    audioSampleRate: null,
    audioChannels: null,
    thumbRelPath: null,
    posterRelPath: null,
    audioMeta: null,
    analysisStatus: 'pending',
    analysisError: null,
    valid: true,
    importedAt: record.importedAt,
  }
}

/**
 * Import a batch of files into the project's managed MediaVault via the streaming
 * pipeline. `vaultRoot` should be `<project>/media`. Returns per-file outcomes
 * plus the merged media list (existing + newly imported/referenced, deduped by
 * content ID).
 */
export async function importMedia(
  vaultRoot: string,
  existing: readonly MediaAsset[],
  inputs: readonly MediaImportInput[],
): Promise<MediaImportSummary> {
  const outcomes: MediaImportOutcome[] = []
  const byId = new Map(existing.map((m) => [m.id, m]))

  for (const input of inputs) {
    const originalName = safeName(
      input.kind === 'bytes' ? input.originalName : basename(input.path),
    )
    try {
      let size: number
      if (input.kind === 'bytes') {
        size = input.bytes.length
      } else {
        const info = await stat(input.path)
        if (!info.isFile()) throw new Error('not a file')
        size = info.size
      }

      const ext = extensionOf(originalName)
      if (!isSupportedExtension(ext)) {
        outcomes.push({ status: 'unsupported', originalName, detail: `extension .${ext || '?'}` })
        continue
      }
      if (size === 0) {
        outcomes.push({ status: 'empty', originalName })
        continue
      }
      if (size > MAX_FILE_BYTES) {
        outcomes.push({ status: 'oversized', originalName, detail: `${size} bytes` })
        continue
      }
      const kind = EXTENSION_KIND[ext]
      if (!kind) {
        outcomes.push({ status: 'unsupported', originalName, detail: `extension .${ext}` })
        continue
      }

      const readable =
        input.kind === 'bytes' ? Readable.from(input.bytes) : createReadStream(input.path)
      const { record, duplicate } = await streamImport(vaultRoot, {
        originalName,
        ext,
        kind,
        size,
        readable,
      })
      const asset = recordToAsset(record)
      byId.set(asset.id, asset)
      outcomes.push({ status: duplicate ? 'duplicate' : 'imported', originalName, asset })
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      const status: MediaImportStatus = /does not match its extension/.test(message)
        ? 'unsupported'
        : 'failed'
      outcomes.push({ status, originalName, detail: message })
    }
  }

  return { outcomes, media: [...byId.values()] }
}

/**
 * Remove a media asset: the managed file + record (MediaVault) AND its generated
 * derivatives (poster/thumbnail). Derivative removal is best-effort and never
 * blocks removing the source; reference-safety is enforced by the caller.
 */
export async function removeMedia(
  vaultRoot: string,
  existing: readonly MediaAsset[],
  mediaId: string,
): Promise<MediaAsset[]> {
  const vault = new MediaVault(vaultRoot)
  await vault.remove(mediaId)
  const hash = mediaId.replace(/^media_/, '')
  await Promise.all([
    rm(join(vaultRoot, 'posters', `${hash}.jpg`), { force: true }),
    rm(join(vaultRoot, 'thumbnails', `${hash}.jpg`), { force: true }),
  ])
  return existing.filter((m) => m.id !== mediaId)
}
