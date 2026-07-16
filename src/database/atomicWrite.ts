import { writeFile, rename, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'

/**
 * Write bytes atomically: write to a temp file, then rename over the target.
 * rename is atomic on the same filesystem, so a crash mid-write can never leave
 * a half-written (corrupt) database or project file — satisfying the "never
 * corrupt a project because of a partial write" requirement.
 */
export async function atomicWriteFile(
  targetPath: string,
  data: Uint8Array | string,
): Promise<void> {
  await mkdir(dirname(targetPath), { recursive: true })
  const tmp = `${targetPath}.tmp-${process.pid}`
  await writeFile(tmp, data)
  await rename(tmp, targetPath)
}
