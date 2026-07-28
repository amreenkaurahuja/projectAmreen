import { describe, expect, it } from "vitest";
import {
  parseQuestionExplanationResponseJson,
  validateQuestionExplanationResponse,
} from "@/modules/question-explainer/explanation-response-validator";
import type { QuestionExplanationResponse } from "@/modules/question-explainer/explainer.types";

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

describe("validateQuestionExplanationResponse", () => {
  it("accepts a well-formed response", () => {
    expect(validateQuestionExplanationResponse(response()).success).toBe(true);
  });

  it("rejects an unknown top-level field (strict schema)", () => {
    const result = validateQuestionExplanationResponse({
      ...response(),
      extraField: "should not be here",
    });
    expect(result.success).toBe(false);
  });

  it("rejects markdown formatting in a text field", () => {
    const result = validateQuestionExplanationResponse(
      response({ keyConcept: "**75% means three quarters.**" }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects more than 5 worked-example steps", () => {
    const result = validateQuestionExplanationResponse(
      response({
        workedExample: {
          problem: "Find 75% of 40.",
          steps: ["one", "two", "three", "four", "five", "six"],
          answer: "30",
        },
      }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects an empty steps array", () => {
    const result = validateQuestionExplanationResponse(
      response({
        workedExample: { problem: "Find 75% of 40.", steps: [], answer: "30" },
      }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects an unsupported nextAction.type", () => {
    const result = validateQuestionExplanationResponse({
      ...response(),
      nextAction: { type: "practice-prompt", text: "Try another." },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a questionId field on nextAction (never crosses the AI boundary)", () => {
    const result = validateQuestionExplanationResponse({
      ...response(),
      nextAction: {
        type: "linked-question",
        text: "Try another.",
        questionId: "leaked-id",
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects an acknowledgement over 120 characters", () => {
    const result = validateQuestionExplanationResponse(
      response({ acknowledgement: "a".repeat(121) }),
    );
    expect(result.success).toBe(false);
  });
});

describe("parseQuestionExplanationResponseJson", () => {
  it("parses and validates a well-formed JSON string", () => {
    const result = parseQuestionExplanationResponseJson(
      JSON.stringify(response()),
    );
    expect(result.success).toBe(true);
  });

  it("fails cleanly on non-JSON text", () => {
    const result = parseQuestionExplanationResponseJson("not json at all");
    expect(result.success).toBe(false);
  });

  it("fails cleanly on JSON that doesn't match the schema", () => {
    const result = parseQuestionExplanationResponseJson(
      JSON.stringify({ hello: "world" }),
    );
    expect(result.success).toBe(false);
  });
});
