import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { safeRemoveDir, isStrictlyInside, UnsafeRemoveError } from './safeRemove.node'

/**
 * These tests build REAL directories and REAL links. The failure this guards
 * against — a cache refresh deleting the owner's media through a junction — is a
 * filesystem behavior, so mocking the filesystem would prove nothing.
 */

let root: string
let cacheRoot: string
let userMedia: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'sowyvid-saferm-'))
  cacheRoot = join(root, 'render-cache')
  userMedia = join(root, 'user-media')
  mkdirSync(cacheRoot, { recursive: true })
  mkdirSync(userMedia, { recursive: true })
  // The owner's irreplaceable files.
  writeFileSync(join(userMedia, 'boda.mp4'), 'precious')
})

/** Windows junctions need 'junction'; POSIX uses 'dir'. Skip if unprivileged. */
function tryLink(target: string, path: string): boolean {
  try {
    symlinkSync(target, path, process.platform === 'win32' ? 'junction' : 'dir')
    return true
  } catch {
    return false
  }
}

describe('path containment', () => {
  it('accepts a real child', () => {
    expect(isStrictlyInside('/a/b/c', '/a/b')).toBe(true)
  })

  it('rejects the root itself — refreshing must not delete the cache root', () => {
    expect(isStrictlyInside('/a/b', '/a/b')).toBe(false)
  })

  it('rejects a sibling with a shared prefix', () => {
    // "/a/bcache" must not count as inside "/a/b".
    expect(isStrictlyInside('/a/bcache', '/a/b')).toBe(false)
  })

  it('rejects a parent', () => {
    expect(isStrictlyInside('/a', '/a/b')).toBe(false)
  })

  it('rejects traversal', () => {
    expect(isStrictlyInside('/a/b/../../etc', '/a/b')).toBe(false)
  })
})

describe('safeRemoveDir', () => {
  it('removes a real bundle directory inside the cache', async () => {
    const bundle = join(cacheRoot, 'bundle-abc')
    mkdirSync(join(bundle, 'nested'), { recursive: true })
    writeFileSync(join(bundle, 'nested', 'index.html'), 'x')

    await safeRemoveDir(bundle, cacheRoot)
    expect(existsSync(bundle)).toBe(false)
    expect(existsSync(cacheRoot)).toBe(true)
  })

  it('is idempotent — removing what is already gone is fine', async () => {
    await expect(safeRemoveDir(join(cacheRoot, 'never-existed'), cacheRoot)).resolves.toBeUndefined()
  })

  it('refuses to delete THROUGH a junction into user media', async () => {
    const trap = join(cacheRoot, 'bundle-trap')
    if (!tryLink(userMedia, trap)) return // unprivileged environment
    await expect(safeRemoveDir(trap, cacheRoot)).rejects.toThrow(UnsafeRemoveError)
    // The owner's video is untouched — this is the whole point.
    expect(existsSync(join(userMedia, 'boda.mp4'))).toBe(true)
  })

  it('refuses even when the link resolves back inside the cache', async () => {
    // A link is never traversed, regardless of where it points.
    const real = join(cacheRoot, 'bundle-real')
    mkdirSync(real, { recursive: true })
    const link = join(cacheRoot, 'bundle-link')
    if (!tryLink(real, link)) return
    await expect(safeRemoveDir(link, cacheRoot)).rejects.toThrow(UnsafeRemoveError)
    expect(existsSync(real)).toBe(true)
  })

  it('refuses a target outside the cache root', async () => {
    await expect(safeRemoveDir(userMedia, cacheRoot)).rejects.toThrow(UnsafeRemoveError)
    expect(existsSync(join(userMedia, 'boda.mp4'))).toBe(true)
  })

  it('refuses the cache root itself', async () => {
    await expect(safeRemoveDir(cacheRoot, cacheRoot)).rejects.toThrow(UnsafeRemoveError)
    expect(existsSync(cacheRoot)).toBe(true)
  })

  it('refuses a traversal path that escapes the cache', async () => {
    await expect(safeRemoveDir(join(cacheRoot, '..', 'user-media'), cacheRoot)).rejects.toThrow(
      UnsafeRemoveError,
    )
    expect(existsSync(join(userMedia, 'boda.mp4'))).toBe(true)
  })

  it('refuses a file', async () => {
    const file = join(cacheRoot, 'notadir')
    writeFileSync(file, 'x')
    await expect(safeRemoveDir(file, cacheRoot)).rejects.toThrow(UnsafeRemoveError)
  })

  it('does not follow a link NESTED inside the directory being removed', async () => {
    const bundle = join(cacheRoot, 'bundle-nested')
    mkdirSync(bundle, { recursive: true })
    const nested = join(bundle, 'media-link')
    if (!tryLink(userMedia, nested)) return

    await safeRemoveDir(bundle, cacheRoot)
    expect(existsSync(bundle)).toBe(false)
    // The link was unlinked; its TARGET survived.
    expect(existsSync(join(userMedia, 'boda.mp4'))).toBe(true)
  })
})
