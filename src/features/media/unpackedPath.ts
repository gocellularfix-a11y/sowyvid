/**
 * Executable paths inside an Electron asar archive.
 *
 * Electron's patched `fs` transparently redirects READS of asar-unpacked files,
 * but `spawn`/`execFile` do not: launching
 * `…\app.asar\node_modules\ffprobe-static\…\ffprobe.exe` fails with ENOENT even
 * though the binary was extracted to `app.asar.unpacked` by electron-builder.
 * (Found the hard way: packaged media analysis failed with exactly that spawn
 * error — see docs/WINDOWS-PACKAGED-VALIDATION.md.)
 *
 * This rewrites an asar path to its unpacked twin. Pure string logic, no
 * Electron import, so it is unit-testable and safe to call anywhere — a path
 * without an asar segment (development) passes through untouched.
 */
export function unpackedBinaryPath(path: string): string {
  // Match the asar directory segment on either separator style.
  return path.replace(/\bapp\.asar([\\/])/, 'app.asar.unpacked$1')
}
