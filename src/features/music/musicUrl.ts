/**
 * The controlled URL for a global Music Center track. Pure and Node-free so the
 * renderer, the preview and the SoundWeave adapter all build the same string
 * without pulling a filesystem module into the web bundle.
 *
 *   sowyvid-media://music/<trackId>/original
 *
 * Project-independent: a track can be previewed in the Music Center with no
 * commercial open, and rendered the same way when one is selected.
 */
export function musicUrl(trackId: string): string {
  return `sowyvid-media://music/${trackId}/original`
}
