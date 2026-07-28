import { BANNED_PHRASES } from "@/modules/ai/validation/banned-phrases";
import { EXPLANATION_STYLE_BANNED_PHRASES } from "./explanation-style-banned-phrases";
import type {
  QuestionExplanationContext,
  QuestionExplanationResponse,
} from "./explainer.types";

const TOTAL_WORD_LIMIT = 250;

export interface ExplanationGroundingViolation {
  reason: string;
}

function collectResponseText(response: QuestionExplanationResponse): string {
  return [
    response.acknowledgement,
    response.mistakeExplanation,
    response.keyConcept,
    response.workedExample.problem,
    ...response.workedExample.steps,
    response.workedExample.answer,
    response.nextAction.text,
  ].join(" ");
}

function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
}

function containsValue(haystack: string, needle: string): boolean {
  if (needle.trim().length === 0) return true;
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

/**
 * Content-safety and factual-grounding validation, run after shape
 * validation (explanation-response-validator.ts) passes. Mirrors
 * ai/validation/grounding-validator.ts's approach — compare the response
 * against the context it was built from — but every check here is specific
 * to this capability's fields, not shared with the Coach's.
 *
 * Deliberately does NOT verify the worked example's arithmetic is correct —
 * TDS-007's Stage 0 audit flagged this as a real, higher-stakes risk
 * category the platform has no generic verifier for yet (unlike the Coach,
 * which only ever restates already-computed facts). That gap is accepted
 * and documented, not silently claimed to be covered — mitigated only by
 * this validator's other checks and by the deterministic fallback (Rule 14)
 * being the default whenever anything else fails.
 */
export function validateExplanationGrounding(
  response: QuestionExplanationResponse,
  context: QuestionExplanationContext,
): ExplanationGroundingViolation[] {
  const violations: ExplanationGroundingViolation[] = [];
  const text = collectResponseText(response).toLowerCase();

  for (const phrase of [
    ...BANNED_PHRASES,
    ...EXPLANATION_STYLE_BANNED_PHRASES,
  ]) {
    if (text.includes(phrase)) {
      violations.push({ reason: `Contains banned phrase: "${phrase}"` });
    }
  }

  if (!containsValue(response.mistakeExplanation, context.correctAnswerLabel)) {
    violations.push({
      reason: "Mistake explanation does not reference the correct answer",
    });
  }
  if (!containsValue(response.mistakeExplanation, context.learnerAnswerLabel)) {
    violations.push({
      reason: "Mistake explanation does not reference the learner's answer",
    });
  }

  if (
    response.workedExample.problem.trim().toLowerCase() ===
    context.prompt.trim().toLowerCase()
  ) {
    violations.push({
      reason: "Worked example reuses the original question unchanged",
    });
  }

  if (
    response.nextAction.type === "linked-question" &&
    !context.followUpAvailable
  ) {
    violations.push({
      reason:
        "Next action claims a linked follow-up question, but none was available in the context",
    });
  }

  const wordCount = countWords(collectResponseText(response));
  if (wordCount > TOTAL_WORD_LIMIT) {
    violations.push({
      reason: `Response is ${wordCount} words, over the ${TOTAL_WORD_LIMIT}-word limit`,
    });
  }

  return violations;
}
