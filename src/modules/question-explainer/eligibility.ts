import type { ExplanationSourceData } from "./explainer.repository";

// "Unanswered", "belongs to another learner", and "attempt doesn't exist"
// all collapse into the same attempt_not_found reason: getExplanationSource
// already scopes its lookup by learnerId and returns null for all three
// (see explainer.repository.ts), which avoids leaking whether an attempt id
// exists at all under a different learner. "Malformed/incomplete attempt"
// isn't a real case either — question_attempts.is_correct/selected_option_id
// are NOT NULL at the schema level, so a row that exists is always complete.

export type IneligibilityReason = "attempt_not_found" | "answer_correct";

export interface EligibilityResult {
  eligible: boolean;
  reason?: IneligibilityReason;
}

export function checkEligibility(
  source: ExplanationSourceData | null,
): EligibilityResult {
  if (!source) {
    return { eligible: false, reason: "attempt_not_found" };
  }
  if (source.isCorrect) {
    return { eligible: false, reason: "answer_correct" };
  }
  return { eligible: true };
}
