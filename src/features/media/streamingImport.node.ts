import { createHash } from 'node:crypto'
import { randomBytes } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, rename, rm, writeFile, access, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { once } from 'node:events'
import { Readable } from 'node:stream'
import {
  contentMatchesExtension,
  probeDimensions,
  orientationOf,
  classifyMedia,
  MediaRecordSchema,
  type MediaRecord,
} from '@jorge-engines/mediavault'

/**
 * Streaming media import. Unlike MediaVault's buffer-based `importBytes`, this
 * copies the source with BOUNDED memory: it never allocates a buffer the size of
 * the file. It streams chunks, hashes incrementally (SHA-256), validates the
 * magic-byte signature from a small bounded header, writes to a temp file with
 * backpressure, and atomically renames into the content-addressed destination.
 *
 * It writes the SAME `files/<hash>.<ext>` + `records/<id>.json` layout MediaVault
 * uses (and reuses MediaVault's pure helpers + schema), so MediaVault's
 * `get`/`list`/`resolveFile`/`remove` operate on the store unchanged.
 */

const HEADER_BYTES = 64 * 1024 // bounded; enough for image dimensions + signatures
const MIN_HEADER_FOR_SIGNATURE = 12

export interface StreamImportSource {
  originalName: string
  ext: string
  kind: MediaRecord['kind']
  /** Known source size in bytes (already size/empty-validated by the caller). */
  size: number
  /** A fresh readable of the source bytes (file stream or Readable.from(buffer)). */
  readable: Readable
}

export interface StreamImportResult {
  record: MediaRecord
  duplicate: boolean
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function atomicWrite(path: string, content: string | Buffer): Promise<void> {
  const temp = `${path}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`
  await writeFile(temp, content)
  try {
    await rename(temp, path)
  } catch {
    await rm(path, { force: true })
    await rename(temp, path)
  }
}

export async function streamImport(
  vaultRoot: string,
  source: StreamImportSource,
): Promise<StreamImportResult> {
  const filesDir = join(vaultRoot, 'files')
  const recordsDir = join(vaultRoot, 'records')
  const tempDir = join(vaultRoot, 'temp')
  await mkdir(filesDir, { recursive: true })
  await mkdir(recordsDir, { recursive: true })
  await mkdir(tempDir, { recursive: true })

  const tempPath = join(tempDir, `${randomBytes(12).toString('hex')}.part`)
  const hash = createHash('sha256')
  const headerParts: Buffer[] = []
  let headerLen = 0
  let signatureValidated = false

  const out = createWriteStream(tempPath)
  try {
    for await (const chunk of source.readable) {
      const buf = chunk as Buffer
      hash.update(buf)

      if (headerLen < HEADER_BYTES) {
        headerParts.push(buf)
        headerLen += buf.length
        if (!signatureValidated && headerLen >= MIN_HEADER_FOR_SIGNATURE) {
          validateSignature(Buffer.concat(headerParts), source.ext)
          signatureValidated = true
        }
      }

      if (!out.write(buf)) await once(out, 'drain')
    }
    // Tiny files (< MIN_HEADER) validate at end.
    if (!signatureValidated) validateSignature(Buffer.concat(headerParts), source.ext)

    out.end()
    await once(out, 'finish')
  } catch (error) {
    out.destroy()
    await rm(tempPath, { force: true })
    throw error
  }

  const header = Buffer.concat(headerParts)
  const contentHash = hash.digest('hex')
  const id = `media_${contentHash}`
  const relativePath = `files/${contentHash}.${source.ext}`
  const destPath = join(vaultRoot, 'files', `${contentHash}.${source.ext}`)
  const recordPath = join(recordsDir, `${id}.json`)

  // Content-addressed dedup: identical bytes → identical hash → existing record.
  if (await exists(recordPath)) {
    await rm(tempPath, { force: true })
    const existing = MediaRecordSchema.parse(JSON.parse(await readFile(recordPath, 'utf8')))
    return { record: existing, duplicate: true }
  }

  await rename(tempPath, destPath).catch(async () => {
    await rm(destPath, { force: true })
    await rename(tempPath, destPath)
  })

  const dims = probeDimensions(header, source.ext)
  const classification = classifyMedia({
    originalName: source.originalName,
    kind: source.kind,
    ...(dims ? { width: dims.width, height: dims.height } : {}),
  })

  const record = MediaRecordSchema.parse({
    id,
    kind: source.kind,
    extension: source.ext,
    originalName: source.originalName,
    relativePath,
    sizeBytes: source.size,
    contentHash,
    importedAt: new Date().toISOString(),
    modifiedAtSource: null,
    width: dims?.width ?? null,
    height: dims?.height ?? null,
    durationMs: null,
    orientation: orientationOf(dims?.width ?? null, dims?.height ?? null),
    hasAudio: source.kind === 'audio' ? true : null,
    ...classification,
    tags: [],
    qualityScore: 0.5,
    userPriority: 0.5,
    license: { source: 'owner-provided', commercialUseAllowed: true, notes: 'Imported by the owner.' },
  })

  try {
    await atomicWrite(recordPath, JSON.stringify(record, null, 2) + '\n')
  } catch (error) {
    await rm(destPath, { force: true })
    throw error
  }

  return { record, duplicate: false }
}

function validateSignature(header: Buffer, ext: string): void {
  if (!contentMatchesExtension(header, ext)) {
    throw new Error('File content does not match its extension')
  }
}
