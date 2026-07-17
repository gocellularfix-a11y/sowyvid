import { stat, rm } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { basename, join } from 'node:path'
import { streamImport } from '@features/media/streamingImport.node'
import { analyzeMusicFile, type MusicAnalysis } from '@features/media/analysis.node'
import { MAX_FILE_BYTES, extensionOf } from '@features/media/limits'

/**
 * Import a candidate music file into the GLOBAL managed music vault
 * (`<userData>/music`), content-addressed and deduplicated by hash. Reuses the
 * streaming importer (bounded memory, magic-byte validation, sha256) that the
 * project media pipeline uses, so a music file gets the same safety guarantees.
 *
 * Music candidates are limited to the formats the engine already validates as
 * audio: **MP3 and WAV**. An MP4 that carries audio is a VIDEO — it never enters
 * the Music Center as a song (that stays source-video audio on its project).
 */

/** Music formats accepted by the Music Center this milestone. */
export const MUSIC_EXTENSIONS = ['mp3', 'wav'] as const
export type MusicExtension = (typeof MUSIC_EXTENSIONS)[number]

export function isMusicExtension(ext: string): ext is MusicExtension {
  return (MUSIC_EXTENSIONS as readonly string[]).includes(ext.toLowerCase())
}

export type MusicImportOutcome =
  | { status: 'imported' | 'duplicate'; hash: string; relPath: string; bytes: number; ext: string; originalName: string; analysis: MusicAnalysis }
  | { status: 'unsupported' | 'oversized' | 'empty' | 'no-audio' | 'failed'; originalName: string; detail?: string }

/**
 * Import one file. Never throws for an expected rejection — returns a typed
 * outcome so the handler can report honestly. `vaultRoot` is `<userData>/music`.
 */
export async function importMusicFile(vaultRoot: string, filePath: string): Promise<MusicImportOutcome> {
  const originalName = basename(filePath)
  try {
    const info = await stat(filePath)
    if (!info.isFile()) return { status: 'failed', originalName, detail: 'not a file' }
    const size = info.size
    const ext = extensionOf(originalName)

    if (!isMusicExtension(ext)) return { status: 'unsupported', originalName, detail: `.${ext || '?'}` }
    if (size === 0) return { status: 'empty', originalName }
    if (size > MAX_FILE_BYTES) return { status: 'oversized', originalName, detail: `${size} bytes` }

    const { record, duplicate } = await streamImport(vaultRoot, {
      originalName,
      ext,
      kind: 'audio',
      size,
      readable: createReadStream(filePath),
    })

    // ffprobe must confirm a real audio stream — an extension/container mismatch
    // is not a song. On a fresh (non-duplicate) import with no audio, undo it.
    const analysis = await analyzeMusicFile(join(vaultRoot, record.relativePath))
    if (analysis.analyzed && !analysis.hasAudio) {
      if (!duplicate) await rm(join(vaultRoot, record.relativePath), { force: true }).catch(() => undefined)
      return { status: 'no-audio', originalName }
    }

    return {
      status: duplicate ? 'duplicate' : 'imported',
      hash: record.contentHash,
      relPath: record.relativePath,
      bytes: record.sizeBytes,
      ext,
      originalName,
      analysis,
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    // Magic-byte mismatch from the streaming validator → clearly "unsupported".
    if (/does not match its extension/.test(message)) return { status: 'unsupported', originalName, detail: message }
    return { status: 'failed', originalName, detail: message }
  }
}

/** Remove a track's managed file (and any stray record) from the vault. */
export async function removeMusicFile(vaultRoot: string, hash: string, ext: string): Promise<void> {
  await Promise.all([
    rm(join(vaultRoot, 'files', `${hash}.${ext}`), { force: true }),
    rm(join(vaultRoot, 'records', `media_${hash}.json`), { force: true }),
  ])
}
