import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, rm, stat, writeFile, readdir } from 'node:fs/promises'
import { basename, extname, join, resolve } from 'node:path'
import { MediaRecordSchema, type MediaRecord } from './contracts.js'
import { classifyMedia } from './classify.js'
import { contentMatchesExtension, EXTENSION_KIND, orientationOf, probeDimensions } from './probe.js'

const stable = (value: unknown): string => JSON.stringify(sortDeep(value), null, 2) + '\n'
function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep)
  if (!value || typeof value !== 'object') return value
  return Object.keys(value as Record<string, unknown>).sort().reduce<Record<string, unknown>>((out,key) => { out[key] = sortDeep((value as Record<string, unknown>)[key]); return out }, {})
}
async function atomicWrite(path: string, content: string | Buffer): Promise<void> {
  const temp = `${path}.${process.pid}.${Date.now()}.tmp`
  await writeFile(temp, content)
  try { await rename(temp, path) } catch { await rm(path, { force: true }); await rename(temp, path) }
}
const safeName = (name: string): string => (basename(name).replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 200) || 'unnamed')
export interface ImportOptions {
  originalName: string
  bytes: Buffer
  modifiedMs?: number | null
  explicitGroup?: MediaRecord['group']
  tags?: string[]
  qualityScore?: number
  userPriority?: number
  license?: MediaRecord['license']
}
export interface ImportResult { record: MediaRecord; duplicate: boolean; absolutePath: string }

export class MediaVault {
  readonly root: string
  private readonly filesDir: string
  private readonly recordsDir: string
  constructor(rootDir: string) { this.root = resolve(rootDir); this.filesDir = join(this.root, 'files'); this.recordsDir = join(this.root, 'records') }
  private recordPath(id: string): string { return join(this.recordsDir, `${id}.json`) }
  async importBytes(options: ImportOptions): Promise<ImportResult> {
    const originalName = safeName(options.originalName)
    const extension = extname(originalName).slice(1).toLowerCase()
    const inferredKind = EXTENSION_KIND[extension]
    if (!inferredKind) throw new Error(`Unsupported media extension: ${extension || '(none)'}`)
    if (!contentMatchesExtension(options.bytes, extension)) throw new Error('File content does not match its extension')
    const contentHash = createHash('sha256').update(options.bytes).digest('hex')
    const id = `media_${contentHash}`
    const relativePath = `files/${contentHash}.${extension}`
    const absolutePath = join(this.root, relativePath)
    await mkdir(this.filesDir, { recursive: true }); await mkdir(this.recordsDir, { recursive: true })
    const existing = await this.get(id)
    if (existing) return { record: existing, duplicate: true, absolutePath }
    const dimensions = probeDimensions(options.bytes, extension)
    const classification = classifyMedia({ originalName, kind: inferredKind, ...(dimensions ? { width: dimensions.width, height: dimensions.height } : {}), ...(options.explicitGroup ? { explicitGroup: options.explicitGroup } : {}) })
    const record = MediaRecordSchema.parse({
      id, kind: inferredKind, extension, originalName, relativePath, sizeBytes: options.bytes.length, contentHash,
      importedAt: new Date().toISOString(), modifiedAtSource: options.modifiedMs ? new Date(options.modifiedMs).toISOString() : null,
      width: dimensions?.width ?? null, height: dimensions?.height ?? null, durationMs: null,
      orientation: orientationOf(dimensions?.width ?? null, dimensions?.height ?? null), hasAudio: inferredKind === 'audio' ? true : null,
      ...classification, tags: [...new Set(options.tags ?? [])].slice(0,100), qualityScore: options.qualityScore ?? 0.5, userPriority: options.userPriority ?? 0.5,
      license: options.license ?? { source: 'owner-provided', commercialUseAllowed: true, notes: 'Imported by the owner.' },
    })
    await atomicWrite(absolutePath, options.bytes)
    try { await atomicWrite(this.recordPath(id), stable(record)) } catch (error) { await rm(absolutePath, { force: true }); throw error }
    return { record, duplicate: false, absolutePath }
  }
  async importFile(path: string, options: Omit<ImportOptions, 'bytes' | 'originalName' | 'modifiedMs'> & { originalName?: string } = {}): Promise<ImportResult> {
    const absolute = resolve(path); const info = await stat(absolute); if (!info.isFile()) throw new Error('Path is not a file')
    return this.importBytes({ ...options, originalName: options.originalName ?? basename(absolute), bytes: await readFile(absolute), modifiedMs: info.mtimeMs })
  }
  async get(id: string): Promise<MediaRecord | null> {
    try { return MediaRecordSchema.parse(JSON.parse(await readFile(this.recordPath(id), 'utf8'))) } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error }
  }
  async list(): Promise<MediaRecord[]> {
    try {
      const names = (await readdir(this.recordsDir)).filter((name) => name.endsWith('.json')).sort()
      const records = await Promise.all(names.map((name) => this.get(name.slice(0,-5))))
      return records.filter((record): record is MediaRecord => record !== null)
    } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error }
  }
  resolveFile(record: MediaRecord): string {
    const candidate = resolve(this.root, record.relativePath)
    if (!candidate.startsWith(this.root + '/') && !candidate.startsWith(this.root + '\\')) throw new Error('Media path escapes vault root')
    return candidate
  }
  async update(id: string, patch: Partial<Pick<MediaRecord, 'group' | 'tags' | 'qualityScore' | 'userPriority' | 'license'>>): Promise<MediaRecord> {
    const current = await this.get(id); if (!current) throw new Error(`Unknown media id: ${id}`)
    const next = MediaRecordSchema.parse({ ...current, ...patch, tags: patch.tags ? [...new Set(patch.tags)].slice(0,100) : current.tags, ...(patch.group ? { classificationMethod: 'explicit', classificationConfidence: 1 } : {}) })
    await atomicWrite(this.recordPath(id), stable(next)); return next
  }
  async remove(id: string): Promise<void> {
    const record = await this.get(id); if (!record) return
    await rm(this.resolveFile(record), { force: true }); await rm(this.recordPath(id), { force: true })
  }
}
