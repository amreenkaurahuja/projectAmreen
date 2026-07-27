import { describe, expect, it, vi } from "vitest";
import { AiCoachService } from "@/modules/ai/coach/ai-coach.service";
import { ContextBuilder } from "@/modules/ai/coach/context-builder";
import { BudgetManager } from "@/modules/ai/shared/budget-manager";
import type {
  AiCacheRepository,
  CachedCoachEntry,
} from "@/modules/ai/cache/ai-cache.repository";
import { AiCacheDuplicateError } from "@/modules/ai/cache/ai-cache.repository";
import type {
  AiGateway,
  AiGenerationResponse,
} from "@/modules/ai/gateway/ai-gateway";
import {
  AiProviderError,
  AiProviderQuotaError,
  AiProviderTimeoutError,
} from "@/modules/ai/gateway/ai-gateway";
import { ParentDashboardAccessError } from "@/modules/parent-dashboard/dashboard.repository";
import { ParentDashboardService } from "@/modules/parent-dashboard/dashboard.service";
import type {
  ParentDashboardRepository,
  RecentMissionData,
} from "@/modules/parent-dashboard/dashboard.repository";
import type { MasteryRepository } from "@/modules/learning-profile/mastery.repository";
import type { AdaptiveDataRepository } from "@/modules/adaptive-learning/adaptive-mission.repository";
import type { MissionCompletionRepository } from "@/modules/missions/mission-completion.repository";
import { MissionCompletionService } from "@/modules/missions/mission-completion.service";
import { MissionPlayerService } from "@/modules/missions/mission-player.service";
import type { MissionPlayerRepository } from "@/modules/missions/mission-player.repository";

const REF = new Date("2026-07-21T00:00:00.000Z");

function buildDashboardRepository(
  overrides: Partial<ParentDashboardRepository> = {},
): ParentDashboardRepository {
  const emptyRecentMissionData: RecentMissionData = {
    missions: [],
    attemptsByMission: new Map(),
  };
  return {
    getAuthenticatedUserId: vi.fn(async () => "parent-1"),
    assertLearnerOwned: vi.fn(async () => undefined),
    getCompletedMissionDates: vi.fn(async () => []),
    getRecentMissionData: vi.fn(async () => emptyRecentMissionData),
    getSkillNames: vi.fn(async () => new Map()),
    ...overrides,
  };
}

function buildMasteryRepository(
  overrides: Partial<MasteryRepository> = {},
): MasteryRepository {
  return {
    getAuthenticatedUserId: vi.fn(async () => "parent-1"),
    assertLearnerOwned: vi.fn(async () => undefined),
    getQuestionCurriculumMetadata: vi.fn(async () => null),
    claimAttemptForMastery: vi.fn(async () => true),
    unclaimAttempt: vi.fn(async () => undefined),
    getMasteryRow: vi.fn(async () => null),
    insertMasteryRow: vi.fn(),
    updateMasteryRow: vi.fn(),
    getAllMasteryForLearner: vi.fn(async () => []),
    getAllMasteryForLearnerEnriched: vi.fn(async () => []),
    ...overrides,
  } as MasteryRepository;
}

function buildAdaptiveRepository(
  overrides: Partial<AdaptiveDataRepository> = {},
): AdaptiveDataRepository {
  return {
    loadCandidateData: vi.fn(async () => ({
      candidates: [],
      masteryBySkill: new Map(),
      recentAttemptsByQuestion: new Map(),
      activeSubjectSlugs: [],
    })),
    ...overrides,
  };
}

function buildCompletionRepository(
  overrides: Partial<MissionCompletionRepository> = {},
): MissionCompletionRepository {
  return {
    getLearnerDisplayName: vi.fn(async () => "Amelia"),
    ...overrides,
  };
}

function buildDashboardService(
  dashboardRepoOverrides: Partial<ParentDashboardRepository> = {},
): ParentDashboardService {
  return new ParentDashboardService(
    buildDashboardRepository(dashboardRepoOverrides),
    buildMasteryRepository(),
    buildAdaptiveRepository(),
    buildCompletionRepository(),
  );
}

function buildMissionCompletionService(): MissionCompletionService {
  const playerRepository: MissionPlayerRepository = {
    getAuthenticatedUserId: vi.fn(async () => "parent-1"),
    assertLearnerOwned: vi.fn(async () => undefined),
    getMissionRecord: vi.fn(async () => null),
    getMissionItems: vi.fn(async () => []),
    getMissionItemForGrading: vi.fn(async () => null),
    upsertAttempt: vi.fn(async () => ({
      attemptId: "attempt-1",
      answeredAt: REF.toISOString(),
    })),
    countAttempts: vi.fn(async () => ({
      answeredCount: 0,
      correctCount: 0,
      totalQuestions: 0,
    })),
    updateMissionStatus: vi.fn(async () => undefined),
  };
  return new MissionCompletionService(
    new MissionPlayerService(playerRepository),
    buildCompletionRepository(),
  );
}

function buildContextBuilder(
  dashboardRepoOverrides: Partial<ParentDashboardRepository> = {},
): ContextBuilder {
  return new ContextBuilder(
    buildDashboardService(dashboardRepoOverrides),
    buildMissionCompletionService(),
  );
}

function buildCacheRepository(
  overrides: Partial<AiCacheRepository> = {},
): AiCacheRepository {
  return {
    find: vi.fn(async () => null),
    save: vi.fn(async (params): Promise<CachedCoachEntry> => ({
      provider: params.provider,
      model: params.model,
      ...params.content,
    })),
    ...overrides,
  };
}

const VALID_AI_JSON = JSON.stringify({
  headline: "Great steady progress!",
  message: "Keep up the good work with regular practice this week.",
  strengths: [],
  focusAreas: [],
  nextSteps: [],
  disclaimer: null,
});

/** Always allows and no-ops recording — most tests aren't exercising the budget guard itself. */
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

describe("AiCoachService.getCoachResponse", () => {
  it("returns a fallback result when AI is disabled (null gateway)", async () => {
    const gateway = buildGateway();
    const service = new AiCoachService(
      buildContextBuilder(),
      buildCacheRepository(),
      null,
      buildBudgetManager(),
    );

    const result = await service.getCoachResponse({
      learnerId: "learner-1",
      audience: "parent",
      referenceTimestamp: REF,
    });

    expect(result.source).toBe("fallback");
    expect(result.cached).toBe(false);
    expect(gateway.generate).not.toHaveBeenCalled();
  });

  it("returns a cached entry on a cache hit without calling the gateway", async () => {
    const cached: CachedCoachEntry = {
      provider: "gemini",
      model: "gemini-2.5-flash",
      headline: "Cached headline",
      message: "Cached message",
      strengths: [],
      focusAreas: [],
      nextSteps: [],
      source: "ai",
    };
    const cacheRepository = buildCacheRepository({
      find: vi.fn(async () => cached),
    });
    const gateway = buildGateway();
    const service = new AiCoachService(
      buildContextBuilder(),
      cacheRepository,
      gateway,
      buildBudgetManager(),
    );

    const result = await service.getCoachResponse({
      learnerId: "learner-1",
      audience: "parent",
      referenceTimestamp: REF,
    });

    expect(result).toEqual({
      headline: "Cached headline",
      message: "Cached message",
      strengths: [],
      focusAreas: [],
      nextSteps: [],
      source: "ai",
      cached: true,
    });
    expect(gateway.generate).not.toHaveBeenCalled();
  });

  it("skips the cache read (but not the write) when forceRefresh is set", async () => {
    const cached: CachedCoachEntry = {
      provider: "gemini",
      model: "gemini-2.5-flash",
      headline: "Cached headline",
      message: "Cached message",
      strengths: [],
      focusAreas: [],
      nextSteps: [],
      source: "ai",
    };
    const cacheRepository = buildCacheRepository({
      find: vi.fn(async () => cached),
    });
    const gateway = buildGateway();
    const service = new AiCoachService(
      buildContextBuilder(),
      cacheRepository,
      gateway,
      buildBudgetManager(),
    );

    const result = await service.getCoachResponse({
      learnerId: "learner-1",
      audience: "parent",
      referenceTimestamp: REF,
      forceRefresh: true,
    });

    expect(gateway.generate).toHaveBeenCalledTimes(1);
    expect(cacheRepository.save).toHaveBeenCalledTimes(1);
    expect(result.headline).toBe("Great steady progress!");
    expect(result.cached).toBe(false);
  });

  it("calls the gateway on a cache miss and persists an accepted AI response", async () => {
    const cacheRepository = buildCacheRepository();
    const gateway = buildGateway();
    const service = new AiCoachService(
      buildContextBuilder(),
      cacheRepository,
      gateway,
      buildBudgetManager(),
    );

    const result = await service.getCoachResponse({
      learnerId: "learner-1",
      audience: "parent",
      referenceTimestamp: REF,
    });

    expect(gateway.generate).toHaveBeenCalledTimes(1);
    expect(cacheRepository.save).toHaveBeenCalledTimes(1);
    expect(result.source).toBe("ai");
    expect(result.cached).toBe(false);
    expect(result.headline).toBe("Great steady progress!");
  });

  it("falls back without persisting when the AI response is not valid JSON", async () => {
    const cacheRepository = buildCacheRepository();
    const gateway = buildGateway({
      generate: vi.fn(async () => ({
        raw: "not json",
        provider: "gemini",
        model: "gemini-2.5-flash",
        durationMs: 5,
      })),
    });
    const service = new AiCoachService(
      buildContextBuilder(),
      cacheRepository,
      gateway,
      buildBudgetManager(),
    );

    const result = await service.getCoachResponse({
      learnerId: "learner-1",
      audience: "parent",
      referenceTimestamp: REF,
    });

    expect(result.source).toBe("fallback");
    expect(cacheRepository.save).not.toHaveBeenCalled();
  });

  it("falls back without persisting when the AI response fails grounding", async () => {
    const cacheRepository = buildCacheRepository();
    const gateway = buildGateway({
      generate: vi.fn(async () => ({
        raw: JSON.stringify({
          headline: "Great job!",
          message: "You are guaranteed to pass the 11+ exam.",
          strengths: [],
          focusAreas: [],
          nextSteps: [],
          disclaimer: null,
        }),
        provider: "gemini",
        model: "gemini-2.5-flash",
        durationMs: 5,
      })),
    });
    const service = new AiCoachService(
      buildContextBuilder(),
      cacheRepository,
      gateway,
      buildBudgetManager(),
    );

    const result = await service.getCoachResponse({
      learnerId: "learner-1",
      audience: "parent",
      referenceTimestamp: REF,
    });

    expect(result.source).toBe("fallback");
    expect(cacheRepository.save).not.toHaveBeenCalled();
  });

  it("falls back when the gateway throws (e.g. timeout)", async () => {
    const cacheRepository = buildCacheRepository();
    const gateway = buildGateway({
      generate: vi.fn(async () => {
        throw new AiProviderTimeoutError("timed out");
      }),
    });
    const service = new AiCoachService(
      buildContextBuilder(),
      cacheRepository,
      gateway,
      buildBudgetManager(),
    );

    const result = await service.getCoachResponse({
      learnerId: "learner-1",
      audience: "parent",
      referenceTimestamp: REF,
    });

    expect(result.source).toBe("fallback");
    expect(cacheRepository.save).not.toHaveBeenCalled();
  });

  it("falls back without calling the gateway when the budget is exhausted", async () => {
    const gateway = buildGateway();
    const exhaustedBudgetManager = new BudgetManager({
      monthlyBudgetGbp: 0.000001,
      estimatedGbpPer1kTokens: 1,
    });
    await exhaustedBudgetManager.recordUsage(1);

    const service = new AiCoachService(
      buildContextBuilder(),
      buildCacheRepository(),
      gateway,
      exhaustedBudgetManager,
    );

    const result = await service.getCoachResponse({
      learnerId: "learner-1",
      audience: "parent",
      referenceTimestamp: REF,
    });

    expect(result.source).toBe("fallback");
    expect(gateway.generate).not.toHaveBeenCalled();
  });

  it("records estimated usage after a successful generation", async () => {
    const budgetManager = buildBudgetManager();
    const recordUsageSpy = vi.spyOn(budgetManager, "recordUsage");
    const service = new AiCoachService(
      buildContextBuilder(),
      buildCacheRepository(),
      buildGateway(),
      budgetManager,
    );

    await service.getCoachResponse({
      learnerId: "learner-1",
      audience: "parent",
      referenceTimestamp: REF,
    });

    expect(recordUsageSpy).toHaveBeenCalledTimes(1);
    expect(recordUsageSpy.mock.calls[0]?.[0]).toBeGreaterThan(0);
  });

  it("falls back on a generic provider error", async () => {
    const gateway = buildGateway({
      generate: vi.fn(async () => {
        throw new AiProviderError("network down");
      }),
    });
    const service = new AiCoachService(
      buildContextBuilder(),
      buildCacheRepository(),
      gateway,
      buildBudgetManager(),
    );

    const result = await service.getCoachResponse({
      learnerId: "learner-1",
      audience: "parent",
      referenceTimestamp: REF,
    });

    expect(result.source).toBe("fallback");
  });

  it("falls back using the rejected candidate when the assembled DTO fails validation", async () => {
    // Empty display name fails LearnerCoachingContextSchema's min(1) inside ContextBuilder.build.
    const dashboardServiceWithBadName = new ParentDashboardService(
      buildDashboardRepository(),
      buildMasteryRepository(),
      buildAdaptiveRepository(),
      buildCompletionRepository({
        getLearnerDisplayName: vi.fn(async () => ""),
      }),
    );
    const builderWithBadName = new ContextBuilder(
      dashboardServiceWithBadName,
      buildMissionCompletionService(),
    );

    const gateway = buildGateway();
    const service = new AiCoachService(
      builderWithBadName,
      buildCacheRepository(),
      gateway,
      buildBudgetManager(),
    );

    const result = await service.getCoachResponse({
      learnerId: "learner-1",
      audience: "parent",
      referenceTimestamp: REF,
    });

    expect(result.source).toBe("fallback");
    expect(gateway.generate).not.toHaveBeenCalled();
  });

  it("propagates an ownership error rather than falling back", async () => {
    const contextBuilder = buildContextBuilder({
      assertLearnerOwned: vi.fn(async () => {
        throw new ParentDashboardAccessError("not owned");
      }),
    });
    const service = new AiCoachService(
      contextBuilder,
      buildCacheRepository(),
      buildGateway(),
      buildBudgetManager(),
    );

    await expect(
      service.getCoachResponse({
        learnerId: "learner-1",
        audience: "parent",
        referenceTimestamp: REF,
      }),
    ).rejects.toThrow(ParentDashboardAccessError);
  });

  it("reuses the concurrent winner's row when save() reports a duplicate", async () => {
    const winningEntry: CachedCoachEntry = {
      provider: "gemini",
      model: "gemini-2.5-flash",
      headline: "Winner headline",
      message: "Winner message",
      strengths: [],
      focusAreas: [],
      nextSteps: [],
      source: "ai",
    };
    const cacheRepository = buildCacheRepository({
      save: vi.fn(async () => {
        throw new AiCacheDuplicateError("conflict");
      }),
      find: vi.fn(async () => null),
    });
    // First find() call (pre-generation) returns null (miss); second find()
    // call (after the duplicate save) returns the winner.
    let callCount = 0;
    cacheRepository.find = vi.fn(async () => {
      callCount += 1;
      return callCount === 1 ? null : winningEntry;
    });

    const gateway = buildGateway();
    const service = new AiCoachService(
      buildContextBuilder(),
      cacheRepository,
      gateway,
      buildBudgetManager(),
    );

    const result = await service.getCoachResponse({
      learnerId: "learner-1",
      audience: "parent",
      referenceTimestamp: REF,
    });

    expect(result.headline).toBe("Winner headline");
    expect(result.source).toBe("ai");
  });

  it("uses the learner prompt builder for the learner audience", async () => {
    const cacheRepository = buildCacheRepository();
    const gateway = buildGateway();
    const service = new AiCoachService(
      buildContextBuilder(),
      cacheRepository,
      gateway,
      buildBudgetManager(),
    );

    const result = await service.getCoachResponse({
      learnerId: "learner-1",
      audience: "learner",
      referenceTimestamp: REF,
    });

    expect(gateway.generate).toHaveBeenCalledWith(
      expect.objectContaining({ audience: "learner" }),
    );
    expect(result.source).toBe("ai");
  });

  it("falls back when a duplicate save can't be resolved to an existing row", async () => {
    const cacheRepository = buildCacheRepository({
      save: vi.fn(async () => {
        throw new AiCacheDuplicateError("conflict");
      }),
      find: vi.fn(async () => null),
    });
    const gateway = buildGateway();
    const service = new AiCoachService(
      buildContextBuilder(),
      cacheRepository,
      gateway,
      buildBudgetManager(),
    );

    const result = await service.getCoachResponse({
      learnerId: "learner-1",
      audience: "parent",
      referenceTimestamp: REF,
    });

    expect(result.source).toBe("fallback");
  });

  it("categorizes a quota error for logging and still falls back", async () => {
    const gateway = buildGateway({
      generate: vi.fn(async () => {
        throw new AiProviderQuotaError("quota exceeded");
      }),
    });
    const service = new AiCoachService(
      buildContextBuilder(),
      buildCacheRepository(),
      gateway,
      buildBudgetManager(),
    );

    const result = await service.getCoachResponse({
      learnerId: "learner-1",
      audience: "parent",
      referenceTimestamp: REF,
    });

    expect(result.source).toBe("fallback");
  });

  it("falls back when save() fails for a reason other than a duplicate", async () => {
    const cacheRepository = buildCacheRepository({
      save: vi.fn(async () => {
        throw new Error("connection reset");
      }),
    });
    const gateway = buildGateway();
    const service = new AiCoachService(
      buildContextBuilder(),
      cacheRepository,
      gateway,
      buildBudgetManager(),
    );

    const result = await service.getCoachResponse({
      learnerId: "learner-1",
      audience: "parent",
      referenceTimestamp: REF,
    });

    expect(result.source).toBe("fallback");
  });
});
