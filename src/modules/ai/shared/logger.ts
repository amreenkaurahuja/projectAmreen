import { logger } from "@/lib/observability/logger";
import type { Audience } from "../coach/coach.types";

/** One of the operational failure categories from the Phase 5.4 metrics list — deliberately not free text, so a log query can group by it reliably. */
export type AiFailureCategory =
  | "disabled"
  | "no_api_key"
  | "timeout"
  | "quota_exceeded"
  | "malformed_json"
  | "validation_failed"
  | "grounding_failed"
  | "network_error"
  | "budget_exceeded";

/**
 * The AI platform's only logging entry point. Deliberately typed to accept
 * exactly the allowed fields from the Phase 5.4 logging rules — provider,
 * model, duration, cache hit, a context-hash prefix, audience, result
 * source, status, failure category — and nothing else. There is no field
 * here a prompt, a DTO, a learner/parent name, or an API key could be
 * passed through as; that's enforced by the type, not by caller discipline.
 */
export interface AiLogFields {
  provider: string;
  model: string;
  durationMs: number;
  cacheHit: boolean;
  contextHashPrefix: string;
  audience: Audience;
  resultSource: "ai" | "fallback" | "cache";
  status: "success" | "error";
  failureCategory?: AiFailureCategory;
}

export function logAiEvent(message: string, fields: AiLogFields): void {
  logger.info(message, { ...fields });
}

export function logAiError(message: string, fields: AiLogFields): void {
  logger.error(message, { ...fields });
}
