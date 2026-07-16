/** FNV-1a 32-bit hash. Stable across Node, browser, Electron and workers. */
export function fnv1aHex(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function hashToUnitInterval(text: string): number {
  return Number.parseInt(fnv1aHex(text), 16) / 0xffffffff;
}
