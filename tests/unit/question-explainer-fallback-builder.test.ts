import { describe, expect, it } from "vitest";
import { buildDeterministicExplanation } from "@/modules/question-explainer/explanation-fallback-builder";
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

describe("buildDeterministicExplanation (learner audience)", () => {
  it("produces the full PS-007 response shape, using the authored explanation as the key concept", () => {
    const explanation = buildDeterministicExplanation(context());

    expect(explanation.acknowledgement).toBeTruthy();
    expect(explanation.mistakeExplanation).toContain("54");
    expect(explanation.mistakeExplanation).toContain("60");
    expect(explanation.keyConcept).toBe("75% is three quarters.");
    expect(explanation.workedExample.answer).toBe("60");
    expect(explanation.workedExample.steps.length).toBeGreaterThan(0);
  });

  it("never invents a different-numbers worked example — reuses the original question rather than fabricate new arithmetic", () => {
    const explanation = buildDeterministicExplanation(context());
    expect(explanation.workedExample.problem).toBe("What is 75% of 80?");
  });

  it("matches the exact PS-007 §5 field set", () => {
    const explanation = buildDeterministicExplanation(context());
    expect(Object.keys(explanation).sort()).toEqual(
      [
        "acknowledgement",
        "keyConcept",
        "mistakeExplanation",
        "nextAction",
        "workedExample",
      ].sort(),
    );
    expect(Object.keys(explanation.workedExample).sort()).toEqual(
      ["answer", "problem", "steps"].sort(),
    );
    expect(Object.keys(explanation.nextAction).sort()).toEqual(
      ["text", "type"].sort(),
    );
  });

  it("falls back to a generic key concept when there is no authored explanation", () => {
    const explanation = buildDeterministicExplanation(
      context({ authoredExplanation: "" }),
    );
    expect(explanation.keyConcept).toContain("Percentages");
  });

  it("uses a review-skill next action when no follow-up is available", () => {
    const explanation = buildDeterministicExplanation(context());
    expect(explanation.nextAction.type).toBe("review-skill");
  });

  it("uses a linked-question next action when a follow-up is available", () => {
    const explanation = buildDeterministicExplanation(
      context({
        followUpAvailable: true,
        followUpQuestionPrompt: "Find 75% of 40.",
      }),
    );
    expect(explanation.nextAction).toEqual({
      type: "linked-question",
      text: "Try another question on Percentages.",
    });
  });
});

describe("buildDeterministicExplanation (parent audience)", () => {
  it("refers to the learner by name and states the observed fact, not a diagnosis", () => {
    const explanation = buildDeterministicExplanation(
      context({ audience: "parent" }),
    );

    expect(explanation.mistakeExplanation).toContain("Amelia");
    expect(explanation.mistakeExplanation).toContain("54");
    expect(explanation.mistakeExplanation).toContain("60");
    expect(explanation.mistakeExplanation.toLowerCase()).not.toContain(
      "does not understand",
    );
  });
});
