import { describe, expect, it } from "vitest";
import {
  buildQuestionExplanationContext,
  ExplanationContextValidationError,
} from "@/modules/question-explainer/explanation-context-builder";
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

describe("buildQuestionExplanationContext", () => {
  it("maps source data into a validated QuestionExplanationContext, never leaking ids", () => {
    const context = buildQuestionExplanationContext({
      audience: "learner",
      learnerDisplayName: "Amelia",
      source: source(),
      followUpQuestionPrompt: null,
    });

    expect(context).toEqual({
      schemaVersion: "question-explanation-context-v2",
      promptVersion: "v1",
      audience: "learner",
      learnerDisplayName: "Amelia",
      subject: "Mathematics",
      skill: "Percentages",
      prompt: "What is 75% of 80?",
      learnerAnswerLabel: "54",
      correctAnswerLabel: "60",
      authoredExplanation: "75% is three quarters.",
      followUpAvailable: false,
    });
    expect(context).not.toHaveProperty("questionId");
    expect(context).not.toHaveProperty("skillId");
    expect(context).not.toHaveProperty("followUpQuestionPrompt");
  });

  it("sets followUpAvailable and includes the prompt text when a follow-up was resolved", () => {
    const context = buildQuestionExplanationContext({
      audience: "learner",
      learnerDisplayName: "Amelia",
      source: source(),
      followUpQuestionPrompt: "Find 75% of 40.",
    });

    expect(context.followUpAvailable).toBe(true);
    expect(context.followUpQuestionPrompt).toBe("Find 75% of 40.");
  });

  it("throws ExplanationContextValidationError with the rejected candidate when a field fails validation", () => {
    expect(() =>
      buildQuestionExplanationContext({
        audience: "learner",
        learnerDisplayName: "",
        source: source(),
        followUpQuestionPrompt: null,
      }),
    ).toThrow(ExplanationContextValidationError);

    try {
      buildQuestionExplanationContext({
        audience: "learner",
        learnerDisplayName: "",
        source: source(),
        followUpQuestionPrompt: null,
      });
    } catch (error) {
      expect(error).toBeInstanceOf(ExplanationContextValidationError);
      const validationError = error as ExplanationContextValidationError;
      expect(validationError.candidate.learnerDisplayName).toBe("");
    }
  });
});
