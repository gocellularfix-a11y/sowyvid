/**
 * Safe export filenames (§5). Pure, so every rule is unit-testable.
 *
 * The default name comes from the project name; the owner can change it in the
 * save dialog. Whatever the source, the name is sanitized (a project may be
 * called anything, including characters no filesystem accepts), and an existing
 * file is NEVER silently overwritten — a numbered variant is produced instead.
 */

/** Windows-reserved device names — `comercial-con.mp4` is fine, `con.mp4` is not. */
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i

/** Characters Windows rejects in filenames, plus ASCII control characters. */
// eslint-disable-next-line no-control-regex -- control characters are exactly what must be stripped
const UNSAFE = new RegExp('[<>:"/\\\\|?*\\u0000-\\u001f]', 'g')

/**
 * Project name → filesystem-safe base name (no extension).
 * Accents are preserved (they are valid and the owner's language has them);
 * only genuinely unsafe characters are replaced.
 */
export function sanitizeBaseName(name: string): string {
  const cleaned = name
    .replace(UNSAFE, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '') // Windows rejects trailing dots/spaces
    .slice(0, 80)
  if (!cleaned || RESERVED.test(cleaned)) return 'comercial'
  return cleaned
}

/** Default filename for an export, e.g. `comercial-Go Cellular.mp4`. */
export function defaultExportFileName(projectName: string): string {
  const base = sanitizeBaseName(projectName)
  return base.toLowerCase().startsWith('comercial') ? `${base}.mp4` : `comercial-${base}.mp4`
}

/**
 * Never overwrite silently: if `name` exists (per the injected check), produce
 * `name-2.mp4`, `name-3.mp4`, … The check is injected so the rule is testable
 * without a filesystem; production passes `existsSync`-over-join.
 */
export function numberedIfTaken(fileName: string, isTaken: (candidate: string) => boolean): string {
  if (!isTaken(fileName)) return fileName
  const dot = fileName.lastIndexOf('.')
  const stem = dot > 0 ? fileName.slice(0, dot) : fileName
  const ext = dot > 0 ? fileName.slice(dot) : ''
  for (let n = 2; n < 10_000; n++) {
    const candidate = `${stem}-${n}${ext}`
    if (!isTaken(candidate)) return candidate
  }
  // 10k collisions means something is deeply wrong; a timestamped name still
  // honors "never overwrite" without looping forever.
  return `${stem}-${Date.now()}${ext}`
}
