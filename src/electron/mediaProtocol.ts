import { protocol } from 'electron'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { projectDir, getAppPaths } from './paths'
import {
  resolveManagedMediaPath,
  isValidMediaId,
  type MediaVariant,
} from '@features/media/managedPath'
import { resolveMusicVaultPath } from '@features/music/musicPath'
import { isValidMusicTrackId } from '@shared/domain/music'
import {
  parseByteRange,
  contentRangeHeader,
  unsatisfiedRangeHeader,
  rangeLength,
} from '@features/media/httpRange'
import type { ProjectRepository, MusicRepository } from '@database/index'

/**
 * Controlled media protocol. The renderer NEVER receives raw filesystem paths;
 * it references stable media IDs via URLs of the form:
 *
 *   sowyvid-media://asset/<projectId>/<mediaId>/<variant>
 *
 * The handler resolves only known managed IDs, restricted to the project's
 * managed media directory, with a path-traversal guard. Anything else → 404.
 *
 * Byte ranges are honored so live video can seek: Chromium requests ranges to
 * scrub, and the Remotion <Player> seeks constantly to keep every video element
 * pinned to the timeline. Serving only whole files makes seeking unreliable and
 * re-reads the file on every scrub.
 */
export const MEDIA_SCHEME = 'sowyvid-media'

const PROJECT_ID = /^proj_[A-Za-z0-9_-]+$/
const VARIANTS: MediaVariant[] = ['original', 'poster', 'thumb']

const notFound = (): Response => new Response('Not found', { status: 404 })

/** Node read stream → web ReadableStream for a fetch `Response` body. */
function bodyFor(path: string, start?: number, end?: number): ReadableStream {
  const stream =
    start === undefined ? createReadStream(path) : createReadStream(path, { start, end })
  return Readable.toWeb(stream) as ReadableStream
}

/**
 * Serve a resolved managed file with byte-range support. Shared by asset, music
 * and poster paths so seeking behaves identically for every managed medium.
 */
async function serveManagedFile(abs: string, contentType: string, rangeHeader: string | null): Promise<Response> {
  // A referenced file can disappear underneath us (moved/deleted on disk).
  // That is a 404, not a crash — the caller then draws its placeholder / state.
  const info = await stat(abs).catch(() => null)
  if (!info || !info.isFile()) return notFound()

  const size = info.size
  const parsed = parseByteRange(rangeHeader, size)

  if (parsed.kind === 'unsatisfiable') {
    return new Response(null, {
      status: 416,
      headers: { 'Content-Range': unsatisfiedRangeHeader(size), 'Accept-Ranges': 'bytes' },
    })
  }

  if (parsed.kind === 'partial') {
    const { range } = parsed
    return new Response(bodyFor(abs, range.start, range.end), {
      status: 206,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(rangeLength(range)),
        'Content-Range': contentRangeHeader(range, size),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-store',
      },
    })
  }

  return new Response(bodyFor(abs), {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(size),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store',
    },
  })
}

const AUDIO_CONTENT_TYPE: Record<string, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
}

export function registerMediaProtocol(repo: ProjectRepository, musicRepo: MusicRepository): void {
  protocol.handle(MEDIA_SCHEME, async (request) => {
    try {
      const url = new URL(request.url)
      const parts = url.pathname.split('/').filter(Boolean)

      // sowyvid-media://export-poster/<projectId>/<exportId> — the generated
      // still for an exported video. Resolved ONLY through the export record
      // (never a client-supplied path); missing poster is a plain 404.
      if (url.host === 'export-poster') {
        const [projectId, exportId] = parts
        if (!projectId || !PROJECT_ID.test(projectId)) return notFound()
        if (!exportId || !/^exp_[A-Za-z0-9_-]+$/.test(exportId)) return notFound()
        const record = repo.getExport(exportId)
        if (!record || record.projectId !== projectId) return notFound()
        const posterPath = join(projectDir(projectId), 'renders', `${exportId}.jpg`)
        const info = await stat(posterPath).catch(() => null)
        if (!info || !info.isFile()) return notFound()
        return new Response(bodyFor(posterPath), {
          status: 200,
          headers: {
            'Content-Type': 'image/jpeg',
            'Content-Length': String(info.size),
            'Cache-Control': 'no-store',
          },
        })
      }

      // sowyvid-media://music/<trackId>/original — a GLOBAL Music Center track.
      // Resolved ONLY through the catalog + vault guard, addressed by stable
      // track id; project-independent, so the Music Center can preview a track
      // with no commercial open.
      if (url.host === 'music') {
        const trackId = parts[0]
        if (!trackId || !isValidMusicTrackId(trackId)) return notFound()
        const track = musicRepo.get(trackId)
        if (!track) return notFound()
        const abs = resolveMusicVaultPath(getAppPaths().music, track)
        if (!abs) return notFound()
        const ext = track.relPath.split('.').pop()?.toLowerCase() ?? ''
        const contentType = AUDIO_CONTENT_TYPE[ext] ?? 'application/octet-stream'
        return serveManagedFile(abs, contentType, request.headers.get('range'))
      }

      const projectId = parts[0]
      const mediaId = parts[1]
      const variant = (parts[2] ?? 'original') as MediaVariant

      if (!projectId || !PROJECT_ID.test(projectId)) return notFound()
      if (!mediaId || !isValidMediaId(mediaId)) return notFound()
      if (!VARIANTS.includes(variant)) return notFound()

      const project = repo.get(projectId)
      if (!project) return notFound()
      const asset = project.media.find((m) => m.id === mediaId)
      if (!asset) return notFound()

      const abs = resolveManagedMediaPath(projectDir(projectId), asset, variant)
      if (!abs) return notFound()

      // Generated variants are always images; only the original keeps the
      // asset's own type. Never trust a client-supplied content type.
      const contentType = variant === 'original' ? asset.mimeType : 'image/jpeg'
      return serveManagedFile(abs, contentType, request.headers.get('range'))
    } catch {
      return new Response('Error', { status: 500 })
    }
  })
}
