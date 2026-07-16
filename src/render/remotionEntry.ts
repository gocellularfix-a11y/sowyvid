import { registerRoot } from 'remotion'
import { RemotionRoot } from './Root'

/**
 * Bundle entry point for the production render. `@remotion/bundler` compiles
 * THIS file; whatever it can reach is what the exported MP4 contains.
 *
 * If a stale bundle of this entry is ever reused, the export silently renders
 * with old code — which is precisely how a composition without `<Audio>`
 * produces a valid-but-silent AAC track. See `docs/RENDER-BUNDLE-CACHE.md`.
 */
registerRoot(RemotionRoot)
