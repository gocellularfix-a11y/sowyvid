import { createServer, type Server } from 'node:http'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { AddressInfo } from 'node:net'
import type { MediaVariant } from '@features/media/managedPath'
import { isValidMediaId } from '@features/media/managedPath'
import { isValidMusicTrackId } from '@shared/domain/music'
import { parseByteRange, contentRangeHeader, rangeLength } from '@features/media/httpRange'

/**
 * Ephemeral loopback media server for PRODUCTION RENDERS.
 *
 * ## Why this exists
 *
 * The preview runs inside Electron, where `sowyvid-media://` is a registered
 * privileged scheme. The production render does NOT: `@remotion/renderer`
 * drives its own headless Chrome, which has never heard of that scheme
 * (`net::ERR_UNKNOWN_URL_SCHEME`), so the composition's media would silently
 * fail to load and the export would be a black video.
 *
 * The lazy fix would be to rewrite media to `file://` paths. That is rejected:
 * it would put real filesystem paths into the composition props, which is
 * exactly the thing the controlled protocol exists to prevent.
 *
 * Instead the render gets a server with the SAME guarantees as the Electron
 * protocol handler:
 *   - assets are addressed by stable ID only, never by path
 *   - ids are format-checked and resolved through the same managed-path guard
 *   - anything unknown is a 404
 *
 * plus render-specific containment:
 *   - bound to 127.0.0.1 on an OS-assigned port (never reachable off-machine)
 *   - every URL carries a per-render random token; a stale or guessed URL 404s
 *   - the server exists only for the duration of one render
 */

/** Resolve a managed asset to an absolute path, or null. Mirrors the protocol handler. */
export type ManagedMediaResolver = (
  projectId: string,
  mediaId: string,
  variant: MediaVariant,
) => string | null

/** Resolve a global Music Center track id to an absolute vault path, or null. */
export type ManagedMusicResolver = (trackId: string) => string | null

export interface MediaServerHandle {
  /** e.g. http://127.0.0.1:51234/a1b2c3… — the prefix that replaces `sowyvid-media://`. */
  baseUrl: string
  close: () => Promise<void>
}

const PROJECT_ID = /^[A-Za-z0-9_-]+$/
const VARIANTS: MediaVariant[] = ['original', 'poster', 'thumb']

const CONTENT_TYPES: Record<string, string> = {
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
}

function contentTypeFor(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  return CONTENT_TYPES[ext] ?? 'application/octet-stream'
}

export async function startRenderMediaServer(
  resolveAsset: ManagedMediaResolver,
  resolveMusic?: ManagedMusicResolver,
): Promise<MediaServerHandle> {
  const token = randomBytes(16).toString('hex')

  const server: Server = createServer((req, res) => {
    void (async () => {
      try {
        const url = new URL(req.url ?? '/', 'http://127.0.0.1')
        const parts = url.pathname.split('/').filter(Boolean)

        if (parts[0] !== token) return void res.writeHead(404).end('Not found')

        let abs: string | null = null
        if (parts[1] === 'asset') {
          // /<token>/asset/<projectId>/<mediaId>/<variant>
          const projectId = parts[2]
          const mediaId = parts[3]
          const variant = (parts[4] ?? 'original') as MediaVariant
          if (!projectId || !PROJECT_ID.test(projectId)) return void res.writeHead(404).end('Not found')
          if (!mediaId || !isValidMediaId(mediaId)) return void res.writeHead(404).end('Not found')
          if (!VARIANTS.includes(variant)) return void res.writeHead(404).end('Not found')
          abs = resolveAsset(projectId, mediaId, variant)
        } else if (parts[1] === 'music') {
          // /<token>/music/<trackId>/original — a global Music Center track.
          const trackId = parts[2]
          if (!trackId || !isValidMusicTrackId(trackId)) return void res.writeHead(404).end('Not found')
          abs = resolveMusic?.(trackId) ?? null
        } else {
          return void res.writeHead(404).end('Not found')
        }

        if (!abs) return void res.writeHead(404).end('Not found')

        const info = await stat(abs).catch(() => null)
        if (!info?.isFile()) return void res.writeHead(404).end('Not found')

        const size = info.size
        const type = contentTypeFor(abs)
        // Chrome requests ranges to decode video/audio; the same parser as the
        // Electron protocol so both paths behave identically.
        const parsed = parseByteRange(req.headers.range ?? null, size)

        if (parsed.kind === 'unsatisfiable') {
          res.writeHead(416, { 'Content-Range': `bytes */${size}`, 'Accept-Ranges': 'bytes' }).end()
          return
        }

        if (parsed.kind === 'partial') {
          const { range } = parsed
          res.writeHead(206, {
            'Content-Type': type,
            'Content-Length': rangeLength(range),
            'Content-Range': contentRangeHeader(range, size),
            'Accept-Ranges': 'bytes',
          })
          createReadStream(abs, { start: range.start, end: range.end }).pipe(res)
          return
        }

        res.writeHead(200, {
          'Content-Type': type,
          'Content-Length': size,
          'Accept-Ranges': 'bytes',
        })
        createReadStream(abs).pipe(res)
      } catch {
        res.writeHead(500).end('Error')
      }
    })()
  })

  await new Promise<void>((resolveReady, reject) => {
    server.once('error', reject)
    // Port 0 → OS assigns a free port. Loopback only.
    server.listen(0, '127.0.0.1', () => resolveReady())
  })

  const address = server.address() as AddressInfo
  const baseUrl = `http://127.0.0.1:${address.port}/${token}`

  return {
    baseUrl,
    close: () =>
      new Promise<void>((done) => {
        server.closeAllConnections?.()
        server.close(() => done())
      }),
  }
}

/** The scheme the composition uses everywhere else. */
const MEDIA_URL_PREFIX = 'sowyvid-media://'

/**
 * Rewrite every controlled media URL in a props tree to the render server.
 *
 * Deep and total: media URLs appear on scenes, on posters and on audio tracks,
 * and a missed one is an invisible hole in the export rather than an error. Any
 * string that is not a managed media URL is left untouched.
 */
export function rewriteManagedUrls<T>(value: T, baseUrl: string): T {
  if (typeof value === 'string') {
    return (value.startsWith(MEDIA_URL_PREFIX)
      ? `${baseUrl}/${value.slice(MEDIA_URL_PREFIX.length)}`
      : value) as unknown as T
  }
  if (Array.isArray(value)) {
    return value.map((v) => rewriteManagedUrls(v, baseUrl)) as unknown as T
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) out[k] = rewriteManagedUrls(v, baseUrl)
    return out as T
  }
  return value
}
