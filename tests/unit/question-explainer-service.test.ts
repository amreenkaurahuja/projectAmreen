import { describe, expect, it, vi } from "vitest";
import { QuestionExplainerService } from "@/modules/question-explainer/question-explainer.service";
import type {
  ExplanationSourceData,
  QuestionExplainerRepository,
} from "@/modules/question-explainer/explainer.repository";
import { ExplainerAccessError } from "@/modules/question-explainer/explainer.repository";
import {
  FollowUpQuestionSelector,
  type FollowUpQuestionRepository,
} from "@/modules/adaptive-learning/follow-up-selector";

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

function buildRepository(
  overrides: Partial<QuestionExplainerRepository> = {},
): QuestionExplainerRepository {
  return {
    getAuthenticatedUserId: vi.fn(async () => "parent-1"),
    assertLearnerOwned: vi.fn(async () => undefined),
    getLearnerDisplayName: vi.fn(async () => "Amelia"),
    getExplanationSource: vi.fn(async () => source()),
    ...overrides,
  };
}

function buildFollowUpSelector(
  overrides: Partial<FollowUpQuestionRepository> = {},
): FollowUpQuestionSelector {
  const repository: FollowUpQuestionRepository = {
    loadEligibleCandidates: vi.fn(async () => []),
    ...overrides,
  };
  return new FollowUpQuestionSelector(repository);
}

describe("QuestionExplainerService.getExplanation", () => {
  it("returns an eligible explanation with a context hash for an incorrect, owned attempt", async () => {
    const service = new QuestionExplainerService(
      buildRepository(),
      buildFollowUpSelector(),
    );

    const result = await service.getExplanation({
      learnerId: "learner-1",
      attemptId: "attempt-1",
      audience: "learner",
    });

    expect(result.eligible).toBe(true);
    if (!result.eligible) throw new Error("expected eligible result");
    expect(result.explanation.source).toBe("authored");
    expect(result.explanation.keyConcept).toBe("75% is three quarters.");
    expect(typeof result.contextHash).toBe("string");
    expect(result.contextHash.length).toBeGreaterThan(0);
  });

  it("returns attempt_not_found when the repository finds no source data", async () => {
    const service = new QuestionExplainerService(
      buildRepository({ getExplanationSource: vi.fn(async () => null) }),
      buildFollowUpSelector(),
    );

    const result = await service.getExplanation({
      learnerId: "learner-1",
      attemptId: "attempt-1",
      audience: "learner",
    });

    expect(result).toEqual({ eligible: false, reason: "attempt_not_found" });
  });

  it("returns answer_correct without building an explanation for a correct attempt", async () => {
    const repository = buildRepository({
      getExplanationSource: vi.fn(async () => source({ isCorrect: true })),
    });
    const service = new QuestionExplainerService(
      repository,
      buildFollowUpSelector(),
    );

    const result = await service.getExplanation({
      learnerId: "learner-1",
      attemptId: "attempt-1",
      audience: "learner",
    });

    expect(result).toEqual({ eligible: false, reason: "answer_correct" });
    expect(repository.getLearnerDisplayName).not.toHaveBeenCalled();
  });

  it("propagates an ownership error rather than returning an ineligible result", async () => {
    const repository = buildRepository({
      assertLearnerOwned: vi.fn(async () => {
        throw new ExplainerAccessError("not owned");
      }),
    });
    const service = new QuestionExplainerService(
      repository,
      buildFollowUpSelector(),
    );

    await expect(
      service.getExplanation({
        learnerId: "learner-1",
        attemptId: "attempt-1",
        audience: "learner",
      }),
    ).rejects.toThrow(ExplainerAccessError);
  });

  it("attaches a deterministic follow-up question's id to the next action when one is found", async () => {
    const service = new QuestionExplainerService(
      buildRepository(),
      buildFollowUpSelector({
        loadEligibleCandidates: vi.fn(async () => [
          { questionId: "question-2", difficulty: 2 },
        ]),
      }),
    );

    const result = await service.getExplanation({
      learnerId: "learner-1",
      attemptId: "attempt-1",
      audience: "learner",
    });

    expect(result.eligible).toBe(true);
    if (!result.eligible) throw new Error("expected eligible result");
    expect(result.explanation.nextAction).toEqual({
      type: "linked-question",
      text: "Try another question on Percentages.",
      questionId: "question-2",
    });
  });

  it("excludes the original question from follow-up candidates and targets one difficulty step down", async () => {
    const loadEligibleCandidates = vi.fn(async () => []);
    const service = new QuestionExplainerService(
      buildRepository({
        getExplanationSource: vi.fn(async () => source({ difficulty: 3 })),
      }),
      buildFollowUpSelector({ loadEligibleCandidates }),
    );

    await service.getExplanation({
      learnerId: "learner-1",
      attemptId: "attempt-1",
      audience: "learner",
    });

    expect(loadEligibleCandidates).toHaveBeenCalledWith(
      expect.objectContaining({
        skillId: "skill-1",
        excludeQuestionIds: ["question-1"],
      }),
    );
  });

  it("builds the parent-audience explanation, naming the learner, for audience: 'parent'", async () => {
    const service = new QuestionExplainerService(
      buildRepository(),
      buildFollowUpSelector(),
    );

    const result = await service.getExplanation({
      learnerId: "learner-1",
      attemptId: "attempt-1",
      audience: "parent",
    });

    expect(result.eligible).toBe(true);
    if (!result.eligible) throw new Error("expected eligible result");
    expect(result.explanation.whatHappened).toContain("Amelia");
  });
});
