import { describe, it, expect } from 'vitest'
import {
  parseByteRange,
  contentRangeHeader,
  unsatisfiedRangeHeader,
  rangeLength,
} from './httpRange'

const SIZE = 1000

describe('byte-range parsing', () => {
  it('serves the whole entity when no range is asked for', () => {
    expect(parseByteRange(null, SIZE)).toEqual({ kind: 'full' })
    expect(parseByteRange(undefined, SIZE)).toEqual({ kind: 'full' })
    expect(parseByteRange('', SIZE)).toEqual({ kind: 'full' })
  })

  it('parses a closed range', () => {
    expect(parseByteRange('bytes=0-499', SIZE)).toEqual({
      kind: 'partial',
      range: { start: 0, end: 499 },
    })
  })

  it('parses an open-ended range as "through the end"', () => {
    expect(parseByteRange('bytes=500-', SIZE)).toEqual({
      kind: 'partial',
      range: { start: 500, end: 999 },
    })
  })

  it('parses a suffix range as "the last N bytes"', () => {
    expect(parseByteRange('bytes=-200', SIZE)).toEqual({
      kind: 'partial',
      range: { start: 800, end: 999 },
    })
  })

  it('clamps a suffix larger than the entity to the whole entity', () => {
    expect(parseByteRange('bytes=-5000', SIZE)).toEqual({
      kind: 'partial',
      range: { start: 0, end: 999 },
    })
  })

  it('clamps an end past the entity instead of over-reading', () => {
    expect(parseByteRange('bytes=900-99999', SIZE)).toEqual({
      kind: 'partial',
      range: { start: 900, end: 999 },
    })
  })

  it('tolerates surrounding whitespace', () => {
    expect(parseByteRange('  bytes=0-9  ', SIZE)).toEqual({
      kind: 'partial',
      range: { start: 0, end: 9 },
    })
  })

  it('allows a single-byte range', () => {
    expect(parseByteRange('bytes=0-0', SIZE)).toEqual({
      kind: 'partial',
      range: { start: 0, end: 0 },
    })
    expect(rangeLength({ start: 0, end: 0 })).toBe(1)
  })

  it('rejects a start at or past the end as unsatisfiable', () => {
    expect(parseByteRange('bytes=1000-', SIZE)).toEqual({ kind: 'unsatisfiable' })
    expect(parseByteRange('bytes=1500-1600', SIZE)).toEqual({ kind: 'unsatisfiable' })
  })

  it('rejects a reversed range', () => {
    expect(parseByteRange('bytes=500-100', SIZE)).toEqual({ kind: 'unsatisfiable' })
  })

  it('rejects a zero-length suffix', () => {
    expect(parseByteRange('bytes=-0', SIZE)).toEqual({ kind: 'unsatisfiable' })
  })

  it('treats a suffix request against an empty entity as unsatisfiable', () => {
    expect(parseByteRange('bytes=-10', 0)).toEqual({ kind: 'unsatisfiable' })
  })

  it('degrades multi-range to a full response rather than answering it wrongly', () => {
    // Multipart bodies are not implemented; a full 200 is always a valid answer.
    expect(parseByteRange('bytes=0-99,200-299', SIZE)).toEqual({ kind: 'full' })
  })

  it('degrades unknown/garbage range units to a full response', () => {
    expect(parseByteRange('items=0-9', SIZE)).toEqual({ kind: 'full' })
    expect(parseByteRange('bytes=abc-def', SIZE)).toEqual({ kind: 'full' })
    expect(parseByteRange('nonsense', SIZE)).toEqual({ kind: 'full' })
    expect(parseByteRange('bytes=-', SIZE)).toEqual({ kind: 'full' })
  })

  it('never yields a range outside the entity, for any input', () => {
    const inputs = [
      'bytes=0-0',
      'bytes=0-999',
      'bytes=999-999',
      'bytes=0-100000',
      'bytes=-1',
      'bytes=-1000',
      'bytes=-100000',
      'bytes=1-',
    ]
    for (const h of inputs) {
      const r = parseByteRange(h, SIZE)
      if (r.kind !== 'partial') continue
      expect(r.range.start).toBeGreaterThanOrEqual(0)
      expect(r.range.end).toBeLessThan(SIZE)
      expect(r.range.start).toBeLessThanOrEqual(r.range.end)
    }
  })
})

describe('range response headers', () => {
  it('formats Content-Range for a partial response', () => {
    expect(contentRangeHeader({ start: 0, end: 499 }, SIZE)).toBe('bytes 0-499/1000')
  })

  it('formats Content-Range for an unsatisfiable request', () => {
    expect(unsatisfiedRangeHeader(SIZE)).toBe('bytes */1000')
  })

  it('reports inclusive range length', () => {
    expect(rangeLength({ start: 0, end: 499 })).toBe(500)
    expect(rangeLength({ start: 800, end: 999 })).toBe(200)
  })
})
