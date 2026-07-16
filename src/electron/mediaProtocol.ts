import { protocol } from 'electron'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { projectDir } from './paths'
import {
  resolveManagedMediaPath,
  isValidMediaId,
  type MediaVariant,
} from '@features/media/managedPath'
import {
  parseByteRange,
  contentRangeHeader,
  unsatisfiedRangeHeader,
  rangeLength,
} from '@features/media/httpRange'
import type { ProjectRepository } from '@database/index'

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

export function registerMediaProtocol(repo: ProjectRepository): void {
  protocol.handle(MEDIA_SCHEME, async (request) => {
    try {
      const url = new URL(request.url)
      const parts = url.pathname.split('/').filter(Boolean)
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

      // A referenced file can disappear underneath us (moved/deleted on disk).
      // That is a 404, not a crash — the composition then draws its placeholder.
      const info = await stat(abs).catch(() => null)
      if (!info || !info.isFile()) return notFound()

      const size = info.size
      // Generated variants are always images; only the original keeps the
      // asset's own type. Never trust a client-supplied content type.
      const contentType = variant === 'original' ? asset.mimeType : 'image/jpeg'
      const parsed = parseByteRange(request.headers.get('range'), size)

      if (parsed.kind === 'unsatisfiable') {
        return new Response(null, {
          status: 416,
          headers: {
            'Content-Range': unsatisfiedRangeHeader(size),
            'Accept-Ranges': 'bytes',
          },
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

      // Advertise range support so the media stack knows it may seek.
      return new Response(bodyFor(abs), {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Content-Length': String(size),
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'no-store',
        },
      })
    } catch {
      return new Response('Error', { status: 500 })
    }
  })
}
