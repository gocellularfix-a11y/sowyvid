import { protocol, net } from 'electron'
import { pathToFileURL } from 'node:url'
import { projectDir } from './paths'
import {
  resolveManagedMediaPath,
  isValidMediaId,
  type MediaVariant,
} from '@features/media/managedPath'
import type { ProjectRepository } from '@database/index'

/**
 * Controlled media protocol. The renderer NEVER receives raw filesystem paths;
 * it references stable media IDs via URLs of the form:
 *
 *   sowyvid-media://asset/<projectId>/<mediaId>/<variant>
 *
 * The handler resolves only known managed IDs, restricted to the project's
 * managed media directory, with a path-traversal guard. Anything else → 404.
 */
export const MEDIA_SCHEME = 'sowyvid-media'

const PROJECT_ID = /^proj_[A-Za-z0-9_-]+$/
const VARIANTS: MediaVariant[] = ['original', 'poster', 'thumb']

const notFound = (): Response => new Response('Not found', { status: 404 })

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

      return net.fetch(pathToFileURL(abs).toString())
    } catch {
      return new Response('Error', { status: 500 })
    }
  })
}
