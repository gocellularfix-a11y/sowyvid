export const EXTENSION_KIND: Record<string, 'image' | 'video' | 'audio' | 'logo'> = {
  jpg: 'image', jpeg: 'image', png: 'image', webp: 'image', gif: 'image',
  svg: 'logo', mp4: 'video', mov: 'video', m4v: 'video', webm: 'video',
  mp3: 'audio', wav: 'audio', m4a: 'audio', aac: 'audio',
}
export type SniffedFamily = 'jpeg' | 'png' | 'webp' | 'gif' | 'svg' | 'isobmff' | 'webm' | 'mp3' | 'wav' | 'aac'

export function sniffFamily(bytes: Buffer): SniffedFamily | null {
  if (bytes.length < 4) return null
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg'
  if (bytes.length >= 8 && bytes.readUInt32BE(0) === 0x89504e47) return 'png'
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'webp'
  if (bytes.toString('ascii', 0, 3) === 'GIF') return 'gif'
  const prefix = bytes.subarray(0, Math.min(bytes.length, 256)).toString('utf8').trimStart().toLowerCase()
  if (prefix.startsWith('<svg') || prefix.startsWith('<?xml') && prefix.includes('<svg')) return 'svg'
  if (bytes.length >= 12 && bytes.toString('ascii', 4, 8) === 'ftyp') return 'isobmff'
  if (bytes.length >= 4 && bytes.readUInt32BE(0) === 0x1a45dfa3) return 'webm'
  if (bytes.toString('ascii', 0, 3) === 'ID3' || (bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0)) return 'mp3'
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WAVE') return 'wav'
  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1]! & 0xf6) === 0xf0) return 'aac'
  return null
}
const ALLOWED: Record<string, SniffedFamily[]> = {
  jpg: ['jpeg'], jpeg: ['jpeg'], png: ['png'], webp: ['webp'], gif: ['gif'], svg: ['svg'],
  mp4: ['isobmff'], mov: ['isobmff'], m4v: ['isobmff'], webm: ['webm'],
  mp3: ['mp3'], wav: ['wav'], m4a: ['isobmff'], aac: ['aac'],
}
export const contentMatchesExtension = (bytes: Buffer, extension: string): boolean => {
  const family = sniffFamily(bytes)
  return family !== null && (ALLOWED[extension.toLowerCase()]?.includes(family) ?? false)
}

function jpegSize(bytes: Buffer): { width: number; height: number } | null {
  let offset = 2
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) return null
    const marker = bytes[offset + 1]
    if (marker === undefined) return null
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd9)) { offset += 2; continue }
    const length = bytes.readUInt16BE(offset + 2)
    if (length < 2) return null
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) }
    offset += 2 + length
  }
  return null
}
export function probeDimensions(bytes: Buffer, extension: string): { width: number; height: number } | null {
  try {
    if (extension === 'png' && bytes.length >= 24) return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
    if (extension === 'jpg' || extension === 'jpeg') return jpegSize(bytes)
    if (extension === 'gif' && bytes.length >= 10) return { width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8) }
    if (extension === 'webp' && bytes.length >= 30 && bytes.toString('ascii', 12, 16) === 'VP8X') return { width: 1 + bytes.readUIntLE(24, 3), height: 1 + bytes.readUIntLE(27, 3) }
  } catch { return null }
  return null
}
export const orientationOf = (width: number | null, height: number | null): 'portrait' | 'landscape' | 'square' | null => !width || !height ? null : width === height ? 'square' : width > height ? 'landscape' : 'portrait'
