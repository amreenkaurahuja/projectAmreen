/**
 * Deterministic JSON.stringify with object keys sorted recursively, so two
 * structurally-identical DTOs always produce the same string regardless of
 * property insertion order — required for context-hash.ts's cache key to be
 * stable across call sites that build the same object differently.
 */
export function canonicalJsonStringify(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value));
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }

  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([a], [b]) => (a < b ? -1 : a > b ? 1 : 0),
    );
    return Object.fromEntries(
      entries.map(([key, entryValue]) => [key, sortKeysDeep(entryValue)]),
    );
  }

  return value;
}
