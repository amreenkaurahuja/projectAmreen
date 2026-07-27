import { describe, expect, it } from "vitest";
import { buildDeterministicExplanation } from "@/modules/question-explainer/explanation-fallback-builder";
import type { QuestionExplanationContext } from "@/modules/question-explainer/explainer.types";
import type { FollowUpQuestion } from "@/modules/adaptive-learning/follow-up-selector";

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

describe("buildDeterministicExplanation (learner audience)", () => {
  it("produces all five parts, using the authored explanation as the key concept", () => {
    const explanation = buildDeterministicExplanation(context(), null);

    expect(explanation.acknowledgement).toBeTruthy();
    expect(explanation.whatHappened).toContain("54");
    expect(explanation.whatHappened).toContain("60");
    expect(explanation.keyConcept).toBe("75% is three quarters.");
    expect(explanation.workedExplanation).toContain("60");
    expect(explanation.source).toBe("authored");
  });

  it("never returns the authored explanation as the whole response — it's woven into a structured shape", () => {
    const explanation = buildDeterministicExplanation(context(), null);
    expect(explanation).not.toEqual("75% is three quarters.");
    expect(Object.keys(explanation).sort()).toEqual(
      [
        "acknowledgement",
        "keyConcept",
        "nextAction",
        "source",
        "whatHappened",
        "workedExplanation",
      ].sort(),
    );
  });

  it("falls back to a generic key concept when there is no authored explanation", () => {
    const explanation = buildDeterministicExplanation(
      context({ authoredExplanation: "" }),
      null,
    );
    expect(explanation.source).toBe("generic");
    expect(explanation.keyConcept).toContain("Percentages");
  });

  it("uses a review-skill next action with no questionId when no follow-up was found", () => {
    const explanation = buildDeterministicExplanation(context(), null);
    expect(explanation.nextAction.type).toBe("review-skill");
    expect(explanation.nextAction.questionId).toBeUndefined();
  });

  it("uses a linked-question next action carrying the follow-up's questionId when one was found", () => {
    const followUp: FollowUpQuestion = { questionId: "question-2" };
    const explanation = buildDeterministicExplanation(context(), followUp);
    expect(explanation.nextAction).toEqual({
      type: "linked-question",
      text: "Try another question on Percentages.",
      questionId: "question-2",
    });
  });
});

describe("buildDeterministicExplanation (parent audience)", () => {
  it("refers to the learner by name and states the observed fact, not a diagnosis", () => {
    const explanation = buildDeterministicExplanation(
      context({ audience: "parent" }),
      null,
    );

    expect(explanation.whatHappened).toContain("Amelia");
    expect(explanation.whatHappened).toContain("54");
    expect(explanation.whatHappened).toContain("60");
    expect(explanation.whatHappened.toLowerCase()).not.toContain(
      "does not understand",
    );
  });
});
