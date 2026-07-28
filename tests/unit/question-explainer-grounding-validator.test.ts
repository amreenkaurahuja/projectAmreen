import { describe, expect, it } from "vitest";
import { validateExplanationGrounding } from "@/modules/question-explainer/explanation-grounding-validator";
import type {
  QuestionExplanationContext,
  QuestionExplanationResponse,
} from "@/modules/question-explainer/explainer.types";

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

function response(
  overrides: Partial<QuestionExplanationResponse> = {},
): QuestionExplanationResponse {
  return {
    acknowledgement: "Good try!",
    mistakeExplanation: 'You chose "54". The correct answer is "60".',
    keyConcept: "75% means three quarters.",
    workedExample: {
      problem: "Find 75% of 40.",
      steps: ["40 divided by 4 is 10.", "10 times 3 is 30."],
      answer: "30",
    },
    nextAction: {
      type: "review-skill",
      text: "Review percentages again soon.",
    },
    ...overrides,
  };
}

describe("validateExplanationGrounding", () => {
  it("passes a well-grounded response", () => {
    expect(validateExplanationGrounding(response(), context())).toEqual([]);
  });

  it("flags a banned diagnostic/comparative/predictive/ranking phrase (shared list)", () => {
    const violations = validateExplanationGrounding(
      response({ keyConcept: "This is a common learning difficulty." }),
      context(),
    );
    expect(violations.length).toBeGreaterThan(0);
  });

  it("flags a banned explanation-style phrase (PS-007 §6's 'avoid' list)", () => {
    const violations = validateExplanationGrounding(
      response({ acknowledgement: "Obviously, this is easy." }),
      context(),
    );
    expect(violations.length).toBeGreaterThan(0);
  });

  it("flags a mistake explanation that doesn't reference the correct answer", () => {
    const violations = validateExplanationGrounding(
      response({
        mistakeExplanation: "You made a small mistake, that's okay.",
      }),
      context(),
    );
    expect(violations.some((v) => v.reason.includes("correct answer"))).toBe(
      true,
    );
  });

  it("flags a mistake explanation that doesn't reference the learner's answer", () => {
    const violations = validateExplanationGrounding(
      response({ mistakeExplanation: 'The correct answer is "60".' }),
      context(),
    );
    expect(violations.some((v) => v.reason.includes("learner's answer"))).toBe(
      true,
    );
  });

  it("flags a worked example that reuses the original question unchanged", () => {
    const violations = validateExplanationGrounding(
      response({
        workedExample: {
          problem: "What is 75% of 80?",
          steps: ["80 divided by 4 is 20.", "20 times 3 is 60."],
          answer: "60",
        },
      }),
      context(),
    );
    expect(
      violations.some((v) => v.reason.includes("reuses the original question")),
    ).toBe(true);
  });

  it("flags a linked-question next action when no follow-up was available", () => {
    const violations = validateExplanationGrounding(
      response({
        nextAction: { type: "linked-question", text: "Try one more!" },
      }),
      context({ followUpAvailable: false }),
    );
    expect(violations.some((v) => v.reason.includes("linked follow-up"))).toBe(
      true,
    );
  });

  it("allows a linked-question next action when a follow-up was available", () => {
    const violations = validateExplanationGrounding(
      response({
        nextAction: { type: "linked-question", text: "Try one more!" },
      }),
      context({
        followUpAvailable: true,
        followUpQuestionPrompt: "Find 75% of 40.",
      }),
    );
    expect(violations).toEqual([]);
  });

  it("flags a response over the total word limit", () => {
    const longText = "word ".repeat(300);
    const violations = validateExplanationGrounding(
      response({ mistakeExplanation: `54 60 ${longText}` }),
      context(),
    );
    expect(violations.some((v) => v.reason.includes("word limit"))).toBe(true);
  });
});
