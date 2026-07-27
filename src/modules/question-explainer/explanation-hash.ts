import { createHash } from "node:crypto";
import { canonicalJsonStringify } from "@/modules/ai/shared/canonical-json";
import type { QuestionExplanationContext } from "./explainer.types";

/**
 * Mirrors ai/cache/context-hash.ts's computeContextHash exactly, reusing
 * the same canonical-JSON primitive so the two hashes are computed
 * identically even though they hash different DTO shapes. Not wired into
 * any cache lookup yet — Stage 1 has no persistence table (TDS-007 §19 is
 * Stage 3) — but the hash itself is real and already changes whenever an
 * educationally relevant input changes, which is what Stage 3's cache key
 * will rely on.
 */
export function computeExplanationContextHash(
  context: QuestionExplanationContext,
): string {
  return createHash("sha256")
    .update(canonicalJsonStringify(context))
    .digest("hex");
}

export function explanationContextHashPrefix(hash: string, length = 8): string {
  return hash.slice(0, length);
}
