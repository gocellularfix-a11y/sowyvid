/**
 * Render progress shape, in a browser-safe module: the renderer consumes these
 * types through the job registry, so they must not live in a `.node.ts` file
 * (the web tsconfig excludes those — nothing UI-visible may drag Node code in).
 */

export type RenderPhase = 'bundling' | 'preparing' | 'rendering' | 'finalizing'

export interface RenderProgress {
  phase: RenderPhase
  /** 0..1 overall. */
  progress: number
}
