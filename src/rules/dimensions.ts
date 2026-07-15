import type { AspectRatio } from '@shared/domain/enums'

/** The rule-engine version. Persisted with projects so plans stay reproducible. */
export const ENGINE_VERSION = 1

/** Frames per second used across preview and render for consistency. */
export const FPS = 30

const RATIO_VALUE: Record<AspectRatio, number> = {
  '9:16': 9 / 16,
  '4:5': 4 / 5,
  '1:1': 1,
  '16:9': 16 / 9,
}

/**
 * Resolve pixel dimensions for an aspect ratio given a long-edge resolution.
 * Even dimensions are guaranteed (H.264 requires even width/height).
 */
export function resolveDimensions(
  aspectRatio: AspectRatio,
  longEdge: number,
): { width: number; height: number } {
  const ratio = RATIO_VALUE[aspectRatio]
  let width: number
  let height: number
  if (ratio <= 1) {
    // Portrait or square: long edge is height.
    height = longEdge
    width = Math.round(longEdge * ratio)
  } else {
    // Landscape: long edge is width.
    width = longEdge
    height = Math.round(longEdge / ratio)
  }
  return { width: makeEven(width), height: makeEven(height) }
}

function makeEven(n: number): number {
  return n % 2 === 0 ? n : n + 1
}
