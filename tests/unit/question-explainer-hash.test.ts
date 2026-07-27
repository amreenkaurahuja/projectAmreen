import { describe, expect, it } from "vitest";
import {
  computeExplanationContextHash,
  explanationContextHashPrefix,
} from "@/modules/question-explainer/explanation-hash";
import type { QuestionExplanationContext } from "@/modules/question-explainer/explainer.types";

function context(
  overrides: Partial<QuestionExplanationContext> = {},
): QuestionExplanationContext {
  return {
    schemaVersion: "question-explanation-context-v1",
    audience: "learner",
    learnerDisplayName: "Amelia",
    subject: "Mathematics",
    skill: "Percentages",
    prompt: "What is 75% of 80?",
    learnerAnswerLabel: "54",
    correctAnswerLabel: "60",
    authoredExplanation: "75% is three quarters.",
    ...overrides,
  };
}

describe("computeExplanationContextHash", () => {
  it("is deterministic for the same context", () => {
    const ctx = context();
    expect(computeExplanationContextHash(ctx)).toBe(
      computeExplanationContextHash(ctx),
    );
  });

  it("changes when an educationally relevant input changes", () => {
    const hashA = computeExplanationContextHash(
      context({ learnerAnswerLabel: "54" }),
    );
    const hashB = computeExplanationContextHash(
      context({ learnerAnswerLabel: "56" }),
    );
    expect(hashA).not.toBe(hashB);
  });

  it("is unaffected by object key order", () => {
    const a = computeExplanationContextHash(context());
    const b = computeExplanationContextHash({
      ...context(),
    });
    expect(a).toBe(b);
  });
});

describe("explanationContextHashPrefix", () => {
  it("returns the first N characters", () => {
    const hash = computeExplanationContextHash(context());
    expect(explanationContextHashPrefix(hash)).toBe(hash.slice(0, 8));
    expect(explanationContextHashPrefix(hash, 4)).toBe(hash.slice(0, 4));
  });
});
