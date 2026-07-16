/**
 * Single-range HTTP byte-range parsing (RFC 7233), pure so it is testable
 * without a protocol handler or a real file.
 *
 * Why this exists: live video needs range requests. Chromium's media stack asks
 * for byte ranges to seek, and the Remotion <Player> seeks constantly (it syncs
 * every video element to the timeline). A handler that only ever answers 200
 * with a whole file forces a re-read per seek and leaves seeking unreliable —
 * which shows up as a preview that drifts out of sync with the timeline.
 *
 * Only SINGLE ranges are supported. Multi-range responses need multipart bodies,
 * which media elements never ask for; anything multi-range degrades to a normal
 * full-body 200 rather than being answered wrongly.
 */

/** Inclusive byte range, as used by both `Content-Range` and `fs.createReadStream`. */
export interface ByteRange {
  start: number
  end: number
}

export type RangeResult =
  /** No (or unsupported) range → answer the whole entity with 200. */
  | { kind: 'full' }
  /** A satisfiable single range → answer 206. */
  | { kind: 'partial'; range: ByteRange }
  /** Syntactically fine but outside the entity → answer 416. */
  | { kind: 'unsatisfiable' }

const SINGLE_RANGE = /^bytes=(\d*)-(\d*)$/

/**
 * @param header raw `Range` header value (null when absent)
 * @param size   total entity size in bytes
 */
export function parseByteRange(header: string | null | undefined, size: number): RangeResult {
  if (!header) return { kind: 'full' }

  const raw = header.trim()
  // Multi-range ("bytes=0-99,200-299") would need a multipart body; serve full.
  if (raw.includes(',')) return { kind: 'full' }

  const m = SINGLE_RANGE.exec(raw)
  if (!m) return { kind: 'full' }

  const startText = m[1] ?? ''
  const endText = m[2] ?? ''

  // "bytes=-N" → the final N bytes.
  if (startText === '') {
    if (endText === '') return { kind: 'full' } // "bytes=-" is meaningless
    const suffix = Number(endText)
    if (!Number.isFinite(suffix)) return { kind: 'full' }
    if (suffix <= 0) return { kind: 'unsatisfiable' }
    if (size === 0) return { kind: 'unsatisfiable' }
    const start = Math.max(0, size - suffix)
    return { kind: 'partial', range: { start, end: size - 1 } }
  }

  const start = Number(startText)
  if (!Number.isFinite(start)) return { kind: 'full' }
  // A start at/after the end of the entity cannot be satisfied.
  if (start >= size) return { kind: 'unsatisfiable' }

  // "bytes=N-" → N through the end.
  if (endText === '') return { kind: 'partial', range: { start, end: Math.max(start, size - 1) } }

  const requestedEnd = Number(endText)
  if (!Number.isFinite(requestedEnd)) return { kind: 'full' }
  if (requestedEnd < start) return { kind: 'unsatisfiable' }

  // Clamp: a client may ask past the end, and must get what exists.
  return { kind: 'partial', range: { start, end: Math.min(requestedEnd, size - 1) } }
}

/** `Content-Range` value for a 206 response. */
export function contentRangeHeader(range: ByteRange, size: number): string {
  return `bytes ${range.start}-${range.end}/${size}`
}

/** `Content-Range` value for a 416 response. */
export function unsatisfiedRangeHeader(size: number): string {
  return `bytes */${size}`
}

/** Number of bytes a range covers (inclusive). */
export function rangeLength(range: ByteRange): number {
  return range.end - range.start + 1
}
