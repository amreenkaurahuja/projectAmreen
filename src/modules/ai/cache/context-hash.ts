import { createHash } from "node:crypto";
import type { LearnerCoachingContext } from "../coach/coach.types";
import { canonicalJsonStringify } from "../shared/canonical-json";

/**
 * A stable content hash of a LearnerCoachingContext: unchanged learning data
 * (mastery, recommendations, etc.) always hashes the same, which is what
 * lets a future cache layer skip regeneration until something actually
 * changes. SHA-256 rather than the app's existing FNV-1a seed hash
 * (seeded-random.ts) — that one is sized for a PRNG seed, not a cache key,
 * where a longer digest keeps collision risk negligible across many
 * learners/dates.
 */
export function computeContextHash(context: LearnerCoachingContext): string {
  return createHash("sha256")
    .update(canonicalJsonStringify(context))
    .digest("hex");
}

/** Safe to log per the AI platform's logging rules — the full hash is not sensitive, but a prefix is all logging needs. */
export function contextHashPrefix(hash: string, length = 8): string {
  return hash.slice(0, length);
}
