import { describe, expect, it, vi } from "vitest";
import {
  MissionAccessError,
  MissionDuplicateError,
  MissionQuestionBankError,
  type CreateMissionOptions,
  type MissionRepository,
} from "@/modules/missions/mission.repository";
import type {
  MissionItem,
  MissionSummary,
} from "@/modules/missions/mission.types";
import { AdaptiveMissionService } from "@/modules/adaptive-learning/adaptive-mission.service";
import type {
  AdaptiveCandidateData,
  AdaptiveDataRepository,
} from "@/modules/adaptive-learning/adaptive-mission.repository";

const REF = new Date("2026-07-21T00:00:00.000Z");

function buildMissionSummary(
  overrides: Partial<MissionSummary> = {},
): MissionSummary {
  return {
    missionId: "mission-1",
    learnerId: "learner-1",
    missionDate: "2026-07-21",
    status: "ready",
    questionCount: 16,
    estimatedMinutes: 20,
    answeredCount: 0,
    correctCount: 0,
    completedAt: null,
    ...overrides,
  };
}

function buildMissionRepository(
  overrides: Partial<MissionRepository> = {},
): MissionRepository {
  return {
    getAuthenticatedUserId: vi.fn(async () => "parent-1"),
    ensureLearnerOwned: vi.fn(async () => undefined),
    findTodaysMission: vi.fn(async () => null),
    createMission: vi.fn(async () => buildMissionSummary()),
    ...overrides,
  };
}

function buildAdaptiveCandidateData(
  overrides: Partial<AdaptiveCandidateData> = {},
): AdaptiveCandidateData {
  return {
    candidates: Array.from({ length: 16 }, (_, i) => ({
      questionId: `q${i}`,
      subjectId: "subject-1",
      subjectSlug: "mathematics",
      topicId: "topic-1",
      skillId: "skill-1",
      difficulty: 3,
    })),
    masteryBySkill: new Map(),
    recentAttemptsByQuestion: new Map(),
    activeSubjectSlugs: ["mathematics"],
    ...overrides,
  };
}

function buildAdaptiveRepository(
  overrides: Partial<AdaptiveDataRepository> = {},
): AdaptiveDataRepository {
  return {
    loadCandidateData: vi.fn(async () => buildAdaptiveCandidateData()),
    ...overrides,
  };
}

describe("AdaptiveMissionService.getOrCreateTodaysMission", () => {
  it("rejects a learner the parent does not own", async () => {
    const missionRepository = buildMissionRepository({
      ensureLearnerOwned: vi.fn(async () => {
        throw new MissionAccessError(
          "Learner is not owned by the current user",
        );
      }),
    });
    const service = new AdaptiveMissionService(
      missionRepository,
      buildAdaptiveRepository(),
    );

    await expect(
      service.getOrCreateTodaysMission("learner-1", REF),
    ).rejects.toThrow(MissionAccessError);
  });

  it("reuses an existing mission without loading candidate data", async () => {
    const existing = buildMissionSummary({ missionId: "existing-mission" });
    const loadCandidateData = vi.fn(async () => buildAdaptiveCandidateData());
    const missionRepository = buildMissionRepository({
      findTodaysMission: vi.fn(async () => existing),
    });
    const service = new AdaptiveMissionService(
      missionRepository,
      buildAdaptiveRepository({ loadCandidateData }),
    );

    const result = await service.getOrCreateTodaysMission("learner-1", REF);

    expect(result.missionId).toBe("existing-mission");
    expect(loadCandidateData).not.toHaveBeenCalled();
    expect(missionRepository.createMission).not.toHaveBeenCalled();
  });

  it("throws MissionQuestionBankError when there are zero eligible candidates", async () => {
    const missionRepository = buildMissionRepository();
    const service = new AdaptiveMissionService(
      missionRepository,
      buildAdaptiveRepository({
        loadCandidateData: vi.fn(async () =>
          buildAdaptiveCandidateData({ candidates: [] }),
        ),
      }),
    );

    await expect(
      service.getOrCreateTodaysMission("learner-1", REF),
    ).rejects.toThrow(MissionQuestionBankError);
  });

  it("generates a mission and persists it with generation metadata", async () => {
    let capturedItems: MissionItem[] = [];
    let capturedOptions: CreateMissionOptions | undefined;
    const missionRepository = buildMissionRepository({
      createMission: vi.fn(
        async (
          _learnerId: string,
          _missionDate: string,
          _estimatedMinutes: number,
          items: MissionItem[],
          options?: CreateMissionOptions,
        ) => {
          capturedItems = items;
          capturedOptions = options;
          return buildMissionSummary({ questionCount: items.length });
        },
      ),
    });
    const service = new AdaptiveMissionService(
      missionRepository,
      buildAdaptiveRepository(),
    );

    const result = await service.getOrCreateTodaysMission("learner-1", REF);

    expect(result.questionCount).toBe(16);
    expect(capturedItems).toHaveLength(16);
    expect(new Set(capturedItems.map((i) => i.questionId)).size).toBe(16);
    expect(capturedItems.map((i) => i.position)).toEqual(
      Array.from({ length: 16 }, (_, i) => i + 1),
    );
    expect(
      capturedItems.every((i) => typeof i.selectionReason === "string"),
    ).toBe(true);
    expect(capturedOptions?.generationStrategy).toBe("adaptive-v1");
    expect(capturedOptions?.generationMetadata).toMatchObject({
      selectedCount: 16,
    });
  });

  it("returns the competing mission after a unique-constraint race", async () => {
    const competing = buildMissionSummary({ missionId: "competing-mission" });
    let lookupCount = 0;
    const missionRepository = buildMissionRepository({
      findTodaysMission: vi.fn(async () => {
        lookupCount += 1;
        return lookupCount > 1 ? competing : null;
      }),
      createMission: vi.fn(async () => {
        throw new MissionDuplicateError("Mission already exists");
      }),
    });
    const service = new AdaptiveMissionService(
      missionRepository,
      buildAdaptiveRepository(),
    );

    const result = await service.getOrCreateTodaysMission("learner-1", REF);

    expect(result.missionId).toBe("competing-mission");
  });

  it("computes the cooldown window from the reference timestamp and config", async () => {
    let capturedSinceIso = "";
    const loadCandidateData = vi.fn(
      async (_learnerId: string, sinceIso: string) => {
        capturedSinceIso = sinceIso;
        return buildAdaptiveCandidateData();
      },
    );
    const service = new AdaptiveMissionService(
      buildMissionRepository(),
      buildAdaptiveRepository({ loadCandidateData }),
    );

    await service.getOrCreateTodaysMission("learner-1", REF);

    // Default cooldown is 7 days.
    expect(capturedSinceIso).toBe(
      new Date(REF.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    );
  });
});
