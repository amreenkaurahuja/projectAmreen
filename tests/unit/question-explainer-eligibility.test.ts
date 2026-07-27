import { describe, expect, it } from "vitest";
import { checkEligibility } from "@/modules/question-explainer/eligibility";
import type { ExplanationSourceData } from "@/modules/question-explainer/explainer.repository";

function source(
  overrides: Partial<ExplanationSourceData> = {},
): ExplanationSourceData {
  return {
    attemptId: "attempt-1",
    isCorrect: false,
    questionId: "question-1",
    skillId: "skill-1",
    skillName: "Percentages",
    subjectName: "Mathematics",
    difficulty: 3,
    prompt: "What is 75% of 80?",
    learnerAnswerLabel: "54",
    correctAnswerLabel: "60",
    authoredExplanation: "75% is three quarters.",
    ...overrides,
  };
}

describe("checkEligibility", () => {
  it("is eligible for an incorrect, owned attempt", () => {
    expect(checkEligibility(source())).toEqual({ eligible: true });
  });

  it("rejects a null source (not found / not owned / unanswered) as attempt_not_found", () => {
    expect(checkEligibility(null)).toEqual({
      eligible: false,
      reason: "attempt_not_found",
    });
  });

  it("rejects a correct attempt as answer_correct", () => {
    expect(checkEligibility(source({ isCorrect: true }))).toEqual({
      eligible: false,
      reason: "answer_correct",
    });
  });
});
