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
import {
  AiProviderError,
  AiProviderQuotaError,
  AiProviderTimeoutError,
  type AiGateway,
  type AiGenerationResponse,
} from "@/modules/ai/gateway/ai-gateway";
import { BudgetManager } from "@/modules/ai/shared/budget-manager";
import {
  ExplanationCacheDuplicateError,
  type CachedExplanationEntry,
  type ExplanationCacheRepository,
} from "@/modules/question-explainer/explanation-cache.repository";

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
    getQuestionPromptById: vi.fn(async () => null),
    getLearnerIdForAttempt: vi.fn(async () => "learner-1"),
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

function buildCacheRepository(
  overrides: Partial<ExplanationCacheRepository> = {},
): ExplanationCacheRepository {
  return {
    find: vi.fn(async () => null),
    save: vi.fn(async (params): Promise<CachedExplanationEntry> => ({
      provider: params.provider,
      model: params.model,
      response: params.response,
    })),
    ...overrides,
  };
}

const VALID_AI_JSON = JSON.stringify({
  acknowledgement: "Good try!",
  mistakeExplanation: 'You chose "54". The correct answer is "60".',
  keyConcept: "75% means three quarters.",
  workedExample: {
    problem: "Find 75% of 40.",
    steps: ["40 divided by 4 is 10.", "10 times 3 is 30."],
    answer: "30",
  },
  nextAction: { type: "review-skill", text: "Review percentages again soon." },
});

const VALID_AI_JSON_WITH_LINKED_QUESTION = JSON.stringify({
  acknowledgement: "Good try!",
  mistakeExplanation: 'You chose "54". The correct answer is "60".',
  keyConcept: "75% means three quarters.",
  workedExample: {
    problem: "Find 75% of 40.",
    steps: ["40 divided by 4 is 10.", "10 times 3 is 30."],
    answer: "30",
  },
  nextAction: { type: "linked-question", text: "Try one more question." },
});

function buildBudgetManager(): BudgetManager {
  return new BudgetManager({
    monthlyBudgetGbp: 1_000_000,
    estimatedGbpPer1kTokens: 0.0001,
  });
}

function buildGateway(overrides: Partial<AiGateway> = {}): AiGateway {
  return {
    generate: vi.fn(async (): Promise<AiGenerationResponse> => ({
      raw: VALID_AI_JSON,
      provider: "gemini",
      model: "gemini-2.5-flash",
      durationMs: 5,
    })),
    ...overrides,
  };
}

describe("QuestionExplainerService.getExplanation", () => {
  it("returns attempt_not_found when the repository finds no source data", async () => {
    const service = new QuestionExplainerService(
      buildRepository({ getExplanationSource: vi.fn(async () => null) }),
      buildFollowUpSelector(),
      buildCacheRepository(),
      buildGateway(),
      buildBudgetManager(),
    );

    const result = await service.getExplanation({
      learnerId: "learner-1",
      attemptId: "attempt-1",
      audience: "learner",
    });

    expect(result).toEqual({ eligible: false, reason: "attempt_not_found" });
  });

  it("returns answer_correct without calling the gateway for a correct attempt", async () => {
    const gateway = buildGateway();
    const service = new QuestionExplainerService(
      buildRepository({
        getExplanationSource: vi.fn(async () => source({ isCorrect: true })),
      }),
      buildFollowUpSelector(),
      buildCacheRepository(),
      gateway,
      buildBudgetManager(),
    );

    const result = await service.getExplanation({
      learnerId: "learner-1",
      attemptId: "attempt-1",
      audience: "learner",
    });

    expect(result).toEqual({ eligible: false, reason: "answer_correct" });
    expect(gateway.generate).not.toHaveBeenCalled();
  });

  it("propagates an ownership error rather than falling back", async () => {
    const service = new QuestionExplainerService(
      buildRepository({
        assertLearnerOwned: vi.fn(async () => {
          throw new ExplainerAccessError("not owned");
        }),
      }),
      buildFollowUpSelector(),
      buildCacheRepository(),
      buildGateway(),
      buildBudgetManager(),
    );

    await expect(
      service.getExplanation({
        learnerId: "learner-1",
        attemptId: "attempt-1",
        audience: "learner",
      }),
    ).rejects.toThrow(ExplainerAccessError);
  });

  it("returns a fallback result when AI is disabled (null gateway), without consulting the cache", async () => {
    const cacheRepository = buildCacheRepository();
    const service = new QuestionExplainerService(
      buildRepository(),
      buildFollowUpSelector(),
      cacheRepository,
      null,
      buildBudgetManager(),
    );

    const result = await service.getExplanation({
      learnerId: "learner-1",
      attemptId: "attempt-1",
      audience: "learner",
    });

    expect(result.eligible).toBe(true);
    if (!result.eligible) throw new Error("expected eligible");
    expect(result.source).toBe("fallback");
    expect(result.cached).toBe(false);
    expect(result.explanation.keyConcept).toBe("75% is three quarters.");
    expect(cacheRepository.find).not.toHaveBeenCalled();
  });

  it("returns a cached entry on a cache hit without calling the gateway", async () => {
    const cachedResponse = JSON.parse(VALID_AI_JSON);
    const cacheRepository = buildCacheRepository({
      find: vi.fn(async () => ({
        response: cachedResponse,
        provider: "gemini",
        model: "gemini-2.5-flash",
      })),
    });
    const gateway = buildGateway();
    const service = new QuestionExplainerService(
      buildRepository(),
      buildFollowUpSelector(),
      cacheRepository,
      gateway,
      buildBudgetManager(),
    );

    const result = await service.getExplanation({
      learnerId: "learner-1",
      attemptId: "attempt-1",
      audience: "learner",
    });

    expect(result.eligible).toBe(true);
    if (!result.eligible) throw new Error("expected eligible");
    expect(result.source).toBe("ai");
    expect(result.cached).toBe(true);
    expect(result.explanation.keyConcept).toBe("75% means three quarters.");
    expect(gateway.generate).not.toHaveBeenCalled();
  });

  it("calls the gateway on a cache miss and persists an accepted AI response", async () => {
    const cacheRepository = buildCacheRepository();
    const gateway = buildGateway();
    const service = new QuestionExplainerService(
      buildRepository(),
      buildFollowUpSelector(),
      cacheRepository,
      gateway,
      buildBudgetManager(),
    );

    const result = await service.getExplanation({
      learnerId: "learner-1",
      attemptId: "attempt-1",
      audience: "learner",
    });

    expect(gateway.generate).toHaveBeenCalledTimes(1);
    expect(cacheRepository.save).toHaveBeenCalledTimes(1);
    expect(cacheRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        learnerId: "learner-1",
        attemptId: "attempt-1",
        audience: "learner",
        promptVersion: "v1",
      }),
    );
    expect(result.eligible).toBe(true);
    if (!result.eligible) throw new Error("expected eligible");
    expect(result.source).toBe("ai");
    expect(result.cached).toBe(false);
  });

  it("does not persist a fallback response", async () => {
    const cacheRepository = buildCacheRepository();
    const gateway = buildGateway({
      generate: vi.fn(async () => {
        throw new AiProviderTimeoutError("timed out");
      }),
    });
    const service = new QuestionExplainerService(
      buildRepository(),
      buildFollowUpSelector(),
      cacheRepository,
      gateway,
      buildBudgetManager(),
    );

    const result = await service.getExplanation({
      learnerId: "learner-1",
      attemptId: "attempt-1",
      audience: "learner",
    });

    expect(result.eligible).toBe(true);
    if (!result.eligible) throw new Error("expected eligible");
    expect(result.source).toBe("fallback");
    expect(cacheRepository.save).not.toHaveBeenCalled();
  });

  it("reuses the concurrent winner's row when save() reports a duplicate", async () => {
    const winningResponse = JSON.parse(VALID_AI_JSON);
    winningResponse.acknowledgement = "Winner acknowledgement";
    const cacheRepository = buildCacheRepository({
      save: vi.fn(async () => {
        throw new ExplanationCacheDuplicateError("conflict");
      }),
    });
    let callCount = 0;
    cacheRepository.find = vi.fn(async () => {
      callCount += 1;
      return callCount === 1
        ? null
        : {
            response: winningResponse,
            provider: "gemini",
            model: "gemini-2.5-flash",
          };
    });

    const gateway = buildGateway();
    const service = new QuestionExplainerService(
      buildRepository(),
      buildFollowUpSelector(),
      cacheRepository,
      gateway,
      buildBudgetManager(),
    );

    const result = await service.getExplanation({
      learnerId: "learner-1",
      attemptId: "attempt-1",
      audience: "learner",
    });

    expect(result.eligible).toBe(true);
    if (!result.eligible) throw new Error("expected eligible");
    expect(result.explanation.acknowledgement).toBe("Winner acknowledgement");
    expect(result.source).toBe("ai");
  });

  it("falls back when a duplicate save can't be resolved to an existing row", async () => {
    const cacheRepository = buildCacheRepository({
      save: vi.fn(async () => {
        throw new ExplanationCacheDuplicateError("conflict");
      }),
      find: vi.fn(async () => null),
    });
    const gateway = buildGateway();
    const service = new QuestionExplainerService(
      buildRepository(),
      buildFollowUpSelector(),
      cacheRepository,
      gateway,
      buildBudgetManager(),
    );

    const result = await service.getExplanation({
      learnerId: "learner-1",
      attemptId: "attempt-1",
      audience: "learner",
    });

    expect(result.eligible).toBe(true);
    if (!result.eligible) throw new Error("expected eligible");
    expect(result.source).toBe("fallback");
  });

  it("falls back when save() fails for a reason other than a duplicate", async () => {
    const cacheRepository = buildCacheRepository({
      save: vi.fn(async () => {
        throw new Error("connection reset");
      }),
    });
    const gateway = buildGateway();
    const service = new QuestionExplainerService(
      buildRepository(),
      buildFollowUpSelector(),
      cacheRepository,
      gateway,
      buildBudgetManager(),
    );

    const result = await service.getExplanation({
      learnerId: "learner-1",
      attemptId: "attempt-1",
      audience: "learner",
    });

    expect(result.eligible).toBe(true);
    if (!result.eligible) throw new Error("expected eligible");
    expect(result.source).toBe("fallback");
  });

  it("uses the learner prompt for audience: 'learner' and the parent prompt for audience: 'parent'", async () => {
    const gateway = buildGateway();
    const service = new QuestionExplainerService(
      buildRepository(),
      buildFollowUpSelector(),
      buildCacheRepository(),
      gateway,
      buildBudgetManager(),
    );

    await service.getExplanation({
      learnerId: "learner-1",
      attemptId: "attempt-1",
      audience: "parent",
    });

    expect(gateway.generate).toHaveBeenCalledWith(
      expect.objectContaining({ audience: "parent", promptVersion: "v1" }),
    );
  });

  it("falls back without recording usage when the AI response is not valid JSON", async () => {
    const gateway = buildGateway({
      generate: vi.fn(async () => ({
        raw: "not json",
        provider: "gemini",
        model: "gemini-2.5-flash",
        durationMs: 5,
      })),
    });
    const budgetManager = buildBudgetManager();
    const recordUsageSpy = vi.spyOn(budgetManager, "recordUsage");
    const service = new QuestionExplainerService(
      buildRepository(),
      buildFollowUpSelector(),
      buildCacheRepository(),
      gateway,
      budgetManager,
    );

    const result = await service.getExplanation({
      learnerId: "learner-1",
      attemptId: "attempt-1",
      audience: "learner",
    });

    expect(result.eligible).toBe(true);
    if (!result.eligible) throw new Error("expected eligible");
    expect(result.source).toBe("fallback");
    // Usage IS recorded before parsing (Gemini was already called/billed) —
    // this asserts the malformed response still falls back, not that usage
    // is skipped.
    expect(recordUsageSpy).toHaveBeenCalledTimes(1);
  });

  it("falls back when the AI response claims a linked question but none was available", async () => {
    const gateway = buildGateway({
      generate: vi.fn(async () => ({
        raw: VALID_AI_JSON_WITH_LINKED_QUESTION,
        provider: "gemini",
        model: "gemini-2.5-flash",
        durationMs: 5,
      })),
    });
    const service = new QuestionExplainerService(
      buildRepository(),
      buildFollowUpSelector(), // no candidates -> no follow-up available
      buildCacheRepository(),
      gateway,
      buildBudgetManager(),
    );

    const result = await service.getExplanation({
      learnerId: "learner-1",
      attemptId: "attempt-1",
      audience: "learner",
    });

    expect(result.eligible).toBe(true);
    if (!result.eligible) throw new Error("expected eligible");
    expect(result.source).toBe("fallback");
  });

  it("falls back when the AI response fails grounding (doesn't reference the correct answer)", async () => {
    const gateway = buildGateway({
      generate: vi.fn(async () => ({
        raw: JSON.stringify({
          acknowledgement: "Good try!",
          mistakeExplanation: "You made a mistake, but that's okay.",
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
        }),
        provider: "gemini",
        model: "gemini-2.5-flash",
        durationMs: 5,
      })),
    });
    const service = new QuestionExplainerService(
      buildRepository(),
      buildFollowUpSelector(),
      buildCacheRepository(),
      gateway,
      buildBudgetManager(),
    );

    const result = await service.getExplanation({
      learnerId: "learner-1",
      attemptId: "attempt-1",
      audience: "learner",
    });

    expect(result.eligible).toBe(true);
    if (!result.eligible) throw new Error("expected eligible");
    expect(result.source).toBe("fallback");
  });

  it("falls back when the gateway throws (e.g. timeout)", async () => {
    const gateway = buildGateway({
      generate: vi.fn(async () => {
        throw new AiProviderTimeoutError("timed out");
      }),
    });
    const service = new QuestionExplainerService(
      buildRepository(),
      buildFollowUpSelector(),
      buildCacheRepository(),
      gateway,
      buildBudgetManager(),
    );

    const result = await service.getExplanation({
      learnerId: "learner-1",
      attemptId: "attempt-1",
      audience: "learner",
    });

    expect(result.eligible).toBe(true);
    if (!result.eligible) throw new Error("expected eligible");
    expect(result.source).toBe("fallback");
  });

  it("falls back on a quota error", async () => {
    const gateway = buildGateway({
      generate: vi.fn(async () => {
        throw new AiProviderQuotaError("quota exceeded");
      }),
    });
    const service = new QuestionExplainerService(
      buildRepository(),
      buildFollowUpSelector(),
      buildCacheRepository(),
      gateway,
      buildBudgetManager(),
    );

    const result = await service.getExplanation({
      learnerId: "learner-1",
      attemptId: "attempt-1",
      audience: "learner",
    });

    expect(result.eligible).toBe(true);
    if (!result.eligible) throw new Error("expected eligible");
    expect(result.source).toBe("fallback");
  });

  it("falls back on a generic provider error", async () => {
    const gateway = buildGateway({
      generate: vi.fn(async () => {
        throw new AiProviderError("network down");
      }),
    });
    const service = new QuestionExplainerService(
      buildRepository(),
      buildFollowUpSelector(),
      buildCacheRepository(),
      gateway,
      buildBudgetManager(),
    );

    const result = await service.getExplanation({
      learnerId: "learner-1",
      attemptId: "attempt-1",
      audience: "learner",
    });

    expect(result.eligible).toBe(true);
    if (!result.eligible) throw new Error("expected eligible");
    expect(result.source).toBe("fallback");
  });

  it("falls back without calling the gateway when the budget is exhausted", async () => {
    const gateway = buildGateway();
    const exhaustedBudgetManager = new BudgetManager({
      monthlyBudgetGbp: 0.000001,
      estimatedGbpPer1kTokens: 1,
    });
    await exhaustedBudgetManager.recordUsage(1);

    const service = new QuestionExplainerService(
      buildRepository(),
      buildFollowUpSelector(),
      buildCacheRepository(),
      gateway,
      exhaustedBudgetManager,
    );

    const result = await service.getExplanation({
      learnerId: "learner-1",
      attemptId: "attempt-1",
      audience: "learner",
    });

    expect(result.eligible).toBe(true);
    if (!result.eligible) throw new Error("expected eligible");
    expect(result.source).toBe("fallback");
    expect(gateway.generate).not.toHaveBeenCalled();
  });

  it("records estimated usage after a successful generation", async () => {
    const budgetManager = buildBudgetManager();
    const recordUsageSpy = vi.spyOn(budgetManager, "recordUsage");
    const service = new QuestionExplainerService(
      buildRepository(),
      buildFollowUpSelector(),
      buildCacheRepository(),
      buildGateway(),
      budgetManager,
    );

    await service.getExplanation({
      learnerId: "learner-1",
      attemptId: "attempt-1",
      audience: "learner",
    });

    expect(recordUsageSpy).toHaveBeenCalledTimes(1);
    expect(recordUsageSpy.mock.calls[0]?.[0]).toBeGreaterThan(0);
  });

  it("falls back using the rejected candidate when the assembled DTO fails validation", async () => {
    // Empty display name fails QuestionExplanationContextSchema's min(1).
    const gateway = buildGateway();
    const service = new QuestionExplainerService(
      buildRepository({ getLearnerDisplayName: vi.fn(async () => "") }),
      buildFollowUpSelector(),
      buildCacheRepository(),
      gateway,
      buildBudgetManager(),
    );

    const result = await service.getExplanation({
      learnerId: "learner-1",
      attemptId: "attempt-1",
      audience: "learner",
    });

    expect(result.eligible).toBe(true);
    if (!result.eligible) throw new Error("expected eligible");
    expect(result.source).toBe("fallback");
    expect(gateway.generate).not.toHaveBeenCalled();
  });

  it("attaches the follow-up's questionId when a linked-question next action is returned", async () => {
    const gateway = buildGateway({
      generate: vi.fn(async () => ({
        raw: VALID_AI_JSON_WITH_LINKED_QUESTION,
        provider: "gemini",
        model: "gemini-2.5-flash",
        durationMs: 5,
      })),
    });
    const service = new QuestionExplainerService(
      buildRepository({
        getQuestionPromptById: vi.fn(async () => "Find 75% of 40."),
      }),
      buildFollowUpSelector({
        loadEligibleCandidates: vi.fn(async () => [
          { questionId: "question-2", difficulty: 2 },
        ]),
      }),
      buildCacheRepository(),
      gateway,
      buildBudgetManager(),
    );

    const result = await service.getExplanation({
      learnerId: "learner-1",
      attemptId: "attempt-1",
      audience: "learner",
    });

    expect(result.eligible).toBe(true);
    if (!result.eligible) throw new Error("expected eligible");
    expect(result.source).toBe("ai");
    expect(result.followUpQuestionId).toBe("question-2");
  });

  it("attaches a freshly resolved followUpQuestionId to a cached response too", async () => {
    const cachedResponse = JSON.parse(VALID_AI_JSON_WITH_LINKED_QUESTION);
    const cacheRepository = buildCacheRepository({
      find: vi.fn(async () => ({
        response: cachedResponse,
        provider: "gemini",
        model: "gemini-2.5-flash",
      })),
    });
    const service = new QuestionExplainerService(
      buildRepository({
        getQuestionPromptById: vi.fn(async () => "Find 75% of 40."),
      }),
      buildFollowUpSelector({
        loadEligibleCandidates: vi.fn(async () => [
          { questionId: "question-3", difficulty: 2 },
        ]),
      }),
      cacheRepository,
      buildGateway(),
      buildBudgetManager(),
    );

    const result = await service.getExplanation({
      learnerId: "learner-1",
      attemptId: "attempt-1",
      audience: "learner",
    });

    expect(result.eligible).toBe(true);
    if (!result.eligible) throw new Error("expected eligible");
    expect(result.cached).toBe(true);
    expect(result.followUpQuestionId).toBe("question-3");
  });

  it("does not attach a followUpQuestionId when the response's next action is review-skill, even if a follow-up was available", async () => {
    const gateway = buildGateway(); // VALID_AI_JSON -> review-skill
    const service = new QuestionExplainerService(
      buildRepository({
        getQuestionPromptById: vi.fn(async () => "Find 75% of 40."),
      }),
      buildFollowUpSelector({
        loadEligibleCandidates: vi.fn(async () => [
          { questionId: "question-2", difficulty: 2 },
        ]),
      }),
      buildCacheRepository(),
      gateway,
      buildBudgetManager(),
    );

    const result = await service.getExplanation({
      learnerId: "learner-1",
      attemptId: "attempt-1",
      audience: "learner",
    });

    expect(result.eligible).toBe(true);
    if (!result.eligible) throw new Error("expected eligible");
    expect(result.followUpQuestionId).toBeUndefined();
  });

  it("passes the original question's id and a step-down difficulty to the follow-up selector", async () => {
    const loadEligibleCandidates = vi.fn(async () => []);
    const service = new QuestionExplainerService(
      buildRepository({
        getExplanationSource: vi.fn(async () => source({ difficulty: 3 })),
      }),
      buildFollowUpSelector({ loadEligibleCandidates }),
      buildCacheRepository(),
      buildGateway(),
      buildBudgetManager(),
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
});
