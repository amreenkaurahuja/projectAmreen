// Deterministic, seedable pseudo-randomness for the adaptive mission
// selector. No Math.random anywhere in this module — given the same seed
// string, every consumer gets the exact same sequence of numbers, which is
// what makes mission generation reproducible for a given learner/date.

/**
 * FNV-1a 32-bit string hash. Used only to turn an arbitrary seed string
 * (e.g. "learnerId:missionDate") into a numeric seed for the PRNG below —
 * not a cryptographic hash, just a fast, deterministic, well-distributed one.
 */
export function hashStringToSeed(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * mulberry32 — a small, fast, deterministic PRNG. Returns a function that
 * yields floats in [0, 1), advancing its internal state each call, exactly
 * as Math.random would but fully reproducible from the seed.
 */
export function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return function random() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Builds a PRNG directly from a seed string (hash + mulberry32 combined). */
export function createSeededRandomFromString(seed: string): () => number {
  return createSeededRandom(hashStringToSeed(seed));
}

/** Deterministic Fisher-Yates shuffle using the supplied seeded PRNG. */
export function seededShuffle<T>(
  items: readonly T[],
  random: () => number,
): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex] as T, copy[index] as T];
  }
  return copy;
}

/** The canonical seed for one learner's mission on one date. */
export function buildMissionSeed(
  learnerId: string,
  missionDate: string,
): string {
  return `${learnerId}:${missionDate}`;
}
