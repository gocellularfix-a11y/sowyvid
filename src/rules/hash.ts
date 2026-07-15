/**
 * Pure, dependency-free deterministic hashing for the rule engine. Used to
 * fingerprint normalized inputs so identical inputs produce an identical
 * `inputsHash`. NOT a cryptographic hash — media/file content hashing uses
 * node:crypto in the media pipeline instead.
 */

/** Stable JSON stringify with sorted object keys (deterministic across runs). */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortDeep(value))
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep)
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(obj).sort()) {
      out[key] = sortDeep(obj[key])
    }
    return out
  }
  return value
}

/** FNV-1a 32-bit hash rendered as 8 hex chars. Deterministic and pure. */
export function fnv1a(input: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    // 32-bit FNV prime multiply via shifts to stay in integer range.
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

/** Hash any serializable value deterministically. */
export function hashInputs(value: unknown): string {
  return fnv1a(stableStringify(value))
}
