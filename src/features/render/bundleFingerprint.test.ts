import { describe, it, expect } from 'vitest'
import {
  computeBundleFingerprint,
  decideCache,
  fingerprintDirName,
  BUNDLE_STAMP_VERSION,
} from './bundleFingerprint'

const base = () => ({
  files: [
    { path: 'src/render/compositions/CommercialComposition.tsx', content: 'export const a = 1' },
    { path: 'src/render/remotionAudio.ts', content: 'export const b = 2' },
  ],
  dependencyVersions: { remotion: '4.0.489', '@remotion/renderer': '4.0.489' },
})

describe('bundle fingerprint', () => {
  it('is stable for identical inputs', () => {
    expect(computeBundleFingerprint(base())).toBe(computeBundleFingerprint(base()))
  })

  it('is independent of file order — traversal order must not change it', () => {
    const reversed = { ...base(), files: [...base().files].reverse() }
    expect(computeBundleFingerprint(reversed)).toBe(computeBundleFingerprint(base()))
  })

  it('is independent of path separator style', () => {
    const win = {
      ...base(),
      files: base().files.map((f) => ({ ...f, path: f.path.replace(/\//g, '\\') })),
    }
    expect(computeBundleFingerprint(win)).toBe(computeBundleFingerprint(base()))
  })

  it('changes when any file content changes — the stale-bundle bug', () => {
    // This is the exact scenario: composition code gains audio support.
    const withAudio = {
      ...base(),
      files: base().files.map((f) =>
        f.path.endsWith('remotionAudio.ts') ? { ...f, content: 'export const b = 2 /* audio */' } : f,
      ),
    }
    expect(computeBundleFingerprint(withAudio)).not.toBe(computeBundleFingerprint(base()))
  })

  it('changes when a file is added', () => {
    const more = { ...base(), files: [...base().files, { path: 'src/render/new.ts', content: 'x' }] }
    expect(computeBundleFingerprint(more)).not.toBe(computeBundleFingerprint(base()))
  })

  it('changes when a file is removed', () => {
    const fewer = { ...base(), files: [base().files[0]!] }
    expect(computeBundleFingerprint(fewer)).not.toBe(computeBundleFingerprint(base()))
  })

  it('changes when a file is renamed, even with identical content', () => {
    const renamed = {
      ...base(),
      files: [{ ...base().files[0]!, path: 'src/render/other.tsx' }, base().files[1]!],
    }
    expect(computeBundleFingerprint(renamed)).not.toBe(computeBundleFingerprint(base()))
  })

  it('changes when Remotion is upgraded, even with identical source', () => {
    const upgraded = { ...base(), dependencyVersions: { ...base().dependencyVersions, remotion: '4.1.0' } }
    expect(computeBundleFingerprint(upgraded)).not.toBe(computeBundleFingerprint(base()))
  })

  it('cannot be fooled by moving bytes across a file boundary', () => {
    // Without length-prefixing, "ab"+"c" and "a"+"bc" would hash the same.
    const a = { ...base(), files: [{ path: 'a', content: 'ab' }, { path: 'b', content: 'c' }] }
    const b = { ...base(), files: [{ path: 'a', content: 'a' }, { path: 'b', content: 'bc' }] }
    expect(computeBundleFingerprint(a)).not.toBe(computeBundleFingerprint(b))
  })

  it('handles binary content', () => {
    const bin = { ...base(), files: [{ path: 'a.bin', content: Buffer.from([0, 1, 2, 255]) }] }
    expect(computeBundleFingerprint(bin)).toMatch(/^[a-f0-9]{64}$/)
  })

  it('produces a filesystem-safe directory name', () => {
    const name = fingerprintDirName(computeBundleFingerprint(base()))
    expect(name).toMatch(/^bundle-[a-f0-9]{16}$/)
  })
})

describe('cache decision never reuses out of optimism', () => {
  const fp = 'abc123'
  const stamp = { fingerprint: fp, stampVersion: BUNDLE_STAMP_VERSION, builtAt: '2026-01-01T00:00:00.000Z' }

  it('reuses only when the stamp matches the running code exactly', () => {
    expect(decideCache(stamp, fp, true)).toEqual({ kind: 'reuse' })
  })

  it('builds when no bundle exists', () => {
    expect(decideCache(stamp, fp, false)).toEqual({ kind: 'build', reason: 'missing' })
  })

  it('NEVER reuses a directory just because it exists', () => {
    // The whole bug: "directory exists -> reuse forever".
    expect(decideCache(null, fp, true)).toEqual({ kind: 'build', reason: 'no-stamp' })
  })

  it('rebuilds when the fingerprint differs — the silent-video scenario', () => {
    expect(decideCache({ ...stamp, fingerprint: 'old-pre-audio' }, fp, true)).toEqual({
      kind: 'rebuild',
      reason: 'fingerprint-mismatch',
    })
  })

  it('self-repairs an unreadable or foreign stamp', () => {
    expect(decideCache('garbage', fp, true)).toEqual({ kind: 'build', reason: 'unreadable-stamp' })
    expect(decideCache({}, fp, true)).toEqual({ kind: 'build', reason: 'unreadable-stamp' })
    expect(decideCache({ fingerprint: '' }, fp, true)).toEqual({ kind: 'build', reason: 'unreadable-stamp' })
  })

  it('self-repairs a stamp written by an older SowyVid', () => {
    expect(decideCache({ ...stamp, stampVersion: 0 }, fp, true)).toEqual({
      kind: 'build',
      reason: 'stale-version',
    })
  })

  it('treats a stamp with no version as unusable rather than assuming current', () => {
    expect(decideCache({ fingerprint: fp }, fp, true)).toEqual({ kind: 'build', reason: 'stale-version' })
  })
})
