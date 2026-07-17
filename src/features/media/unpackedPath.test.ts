import { describe, it, expect } from 'vitest'
import { unpackedBinaryPath } from './unpackedPath'

describe('asar-unpacked binary paths', () => {
  it('rewrites a packaged Windows path to its unpacked twin', () => {
    expect(
      unpackedBinaryPath(
        'C:\\App\\resources\\app.asar\\node_modules\\ffprobe-static\\bin\\win32\\x64\\ffprobe.exe',
      ),
    ).toBe(
      'C:\\App\\resources\\app.asar.unpacked\\node_modules\\ffprobe-static\\bin\\win32\\x64\\ffprobe.exe',
    )
  })

  it('handles forward slashes', () => {
    expect(unpackedBinaryPath('/opt/app/resources/app.asar/node_modules/x/bin')).toBe(
      '/opt/app/resources/app.asar.unpacked/node_modules/x/bin',
    )
  })

  it('leaves development paths untouched', () => {
    const dev = 'C:\\sowyvid\\node_modules\\ffmpeg-static\\ffmpeg.exe'
    expect(unpackedBinaryPath(dev)).toBe(dev)
  })

  it('does not double-rewrite an already-unpacked path', () => {
    const unpacked = 'C:\\App\\resources\\app.asar.unpacked\\node_modules\\x.exe'
    expect(unpackedBinaryPath(unpacked)).toBe(unpacked)
  })

  it('does not touch a file merely NAMED app.asar-something', () => {
    const tricky = 'C:\\data\\app.asarx\\tool.exe'
    expect(unpackedBinaryPath(tricky)).toBe(tricky)
  })
})
