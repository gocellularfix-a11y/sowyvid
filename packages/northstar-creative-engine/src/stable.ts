type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

function normalize(value: unknown): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Cannot serialize non-finite numbers');
    return value;
  }
  if (Array.isArray(value)) return value.map(normalize);
  if (typeof value === 'object') {
    const output: Record<string, JsonValue> = {};
    for (const key of Object.keys(value).sort()) {
      const child = (value as Record<string, unknown>)[key];
      if (child === undefined) continue;
      output[key] = normalize(child);
    }
    return output;
  }
  throw new Error(`Unsupported value in canonical serialization: ${typeof value}`);
}

/** Recursively sorts object keys while preserving array order. */
export function canonicalStringify(value: unknown): string {
  return JSON.stringify(normalize(value));
}
