import { describe, expect, it } from "vitest";
import { validateQuestionExplanationContext } from "@/modules/question-explainer/explanation-context-validator";
import type { QuestionExplanationContext } from "@/modules/question-explainer/explainer.types";

function context(
  overrides: Partial<QuestionExplanationContext> = {},
): QuestionExplanationContext {
  return {
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
    ...overrides,
  };
}

describe("validateQuestionExplanationContext", () => {
  it("accepts a well-formed context with no follow-up", () => {
    const result = validateQuestionExplanationContext(context());
    expect(result.success).toBe(true);
  });

  it("accepts a well-formed context with a follow-up", () => {
    const result = validateQuestionExplanationContext(
      context({
        followUpAvailable: true,
        followUpQuestionPrompt: "Find 75% of 40.",
      }),
    );
    expect(result.success).toBe(true);
  });

  it("accepts an empty authoredExplanation (question_bank.explanation defaults to '')", () => {
    const result = validateQuestionExplanationContext(
      context({ authoredExplanation: "" }),
    );
    expect(result.success).toBe(true);
  });

  it("rejects followUpQuestionPrompt present when followUpAvailable is false", () => {
    const result = validateQuestionExplanationContext({
      ...context(),
      followUpAvailable: false,
      followUpQuestionPrompt: "Find 75% of 40.",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty learnerDisplayName", () => {
    const result = validateQuestionExplanationContext(
      context({ learnerDisplayName: "" }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects an unknown audience", () => {
    const result = validateQuestionExplanationContext({
      ...context(),
      audience: "teacher",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a mismatched schemaVersion", () => {
    const result = validateQuestionExplanationContext({
      ...context(),
      schemaVersion: "question-explanation-context-v1",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty promptVersion", () => {
    const result = validateQuestionExplanationContext({
      ...context(),
      promptVersion: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown extra field (strict schema)", () => {
    const result = validateQuestionExplanationContext({
      ...context(),
      questionId: "leaked-id",
    });
    expect(result.success).toBe(false);
  });
});
