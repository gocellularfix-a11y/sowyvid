/**
 * Isomorphic media policy (no Node APIs) shared by the import service, the IPC
 * layer, and the UI. The initial supported set per the MediaVault phase spec.
 */

/**
 * Extensions SowyVid accepts for import in this phase.
 *
 * SVG is intentionally EXCLUDED: unrestricted SVG can carry scripts, external
 * resource references, and other active content that renders differently (and
 * unsafely) inside Electron/browser. A future SVG path must sanitize + rasterize
 * to PNG before import. See docs/SECURITY.md.
 */
export const SUPPORTED_EXTENSIONS = [
  'jpg',
  'jpeg',
  'png',
  'webp',
  'mp4',
  'mov',
  'wav',
  'mp3',
] as const
export type SupportedExtension = (typeof SUPPORTED_EXTENSIONS)[number]

/** Hard size ceiling (300 MB) — oversized files are rejected before hashing. */
export const MAX_FILE_BYTES = 300 * 1024 * 1024

const MIME_BY_EXTENSION: Record<SupportedExtension, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  wav: 'audio/wav',
  mp3: 'audio/mpeg',
}

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : ''
}

export function isSupportedExtension(ext: string): ext is SupportedExtension {
  return (SUPPORTED_EXTENSIONS as readonly string[]).includes(ext.toLowerCase())
}

export function mimeForExtension(ext: string): string {
  return MIME_BY_EXTENSION[ext.toLowerCase() as SupportedExtension] ?? 'application/octet-stream'
}

/** Per-file outcome status surfaced to the owner (Section 6 states). */
export type MediaImportStatus =
  | 'imported'
  | 'duplicate'
  | 'unsupported'
  | 'oversized'
  | 'empty'
  | 'failed'
