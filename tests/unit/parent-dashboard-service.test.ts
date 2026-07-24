import { describe, expect, it, vi } from "vitest";
import { ParentDashboardService } from "@/modules/parent-dashboard/dashboard.service";
import {
  ParentDashboardAccessError,
  type ParentDashboardRepository,
  type RecentMissionData,
} from "@/modules/parent-dashboard/dashboard.repository";
import type { MasteryRepository } from "@/modules/learning-profile/mastery.repository";
import type { AdaptiveDataRepository } from "@/modules/adaptive-learning/adaptive-mission.repository";
import type { MissionCompletionRepository } from "@/modules/missions/mission-completion.repository";
import type { EnrichedMasteryRecord } from "@/modules/learning-profile/mastery.types";

const REF = new Date("2026-07-21T00:00:00.000Z");

function record(
  overrides: Partial<EnrichedMasteryRecord> = {},
): EnrichedMasteryRecord {
  return {
    id: "mastery-1",
    learnerId: "learner-1",
    skillId: "skill-1",
    subjectId: "subject-1",
    topicId: "topic-1",
    skillName: "Addition",
    subjectName: "Maths",
    masteryScore: 50,
    confidenceScore: 50,
    totalAttempts: 4,
    correctAttempts: 3,
    incorrectAttempts: 1,
    averageResponseMs: 10_000,
    lastResponseMs: 10_000,
    currentStreak: 1,
    bestStreak: 1,
    currentIncorrectStreak: 0,
    lastAttemptCorrect: true,
    lastPractisedAt: REF.toISOString(),
    nextReviewAt: null,
    updatedAt: REF.toISOString(),
    ...overrides,
  };
}

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

function buildMissionCompletionRepository(
  overrides: Partial<MissionCompletionRepository> = {},
): MissionCompletionRepository {
  return {
    getLearnerDisplayName: vi.fn(async () => "Amelia"),
    ...overrides,
  };
}

describe("ParentDashboardService.getDashboardData", () => {
  it("rejects a learner the parent does not own before loading any data", async () => {
    const dashboardRepository = buildDashboardRepository({
      assertLearnerOwned: vi.fn(async () => {
        throw new ParentDashboardAccessError(
          "Learner is not owned by the current user",
        );
      }),
    });
    const masteryRepository = buildMasteryRepository();
    const service = new ParentDashboardService(
      dashboardRepository,
      masteryRepository,
      buildAdaptiveRepository(),
      buildMissionCompletionRepository(),
    );

    await expect(service.getDashboardData("learner-1", REF)).rejects.toThrow(
      ParentDashboardAccessError,
    );
    expect(
      masteryRepository.getAllMasteryForLearnerEnriched,
    ).not.toHaveBeenCalled();
  });

  it("returns hasData: false and empty sections for a learner with no mastery data", async () => {
    const service = new ParentDashboardService(
      buildDashboardRepository(),
      buildMasteryRepository(),
      buildAdaptiveRepository(),
      buildMissionCompletionRepository(),
    );

    const data = await service.getDashboardData("learner-1", REF);

    expect(data.hasData).toBe(false);
    expect(data.learnerName).toBe("Amelia");
    expect(data.subjectInsights).toEqual([]);
    expect(data.strongestSkills).toEqual([]);
    expect(data.recommendations).toEqual([]);
    expect(data.weeklyProgress).toEqual([]);
    expect(data.sessionHistory).toEqual([]);
  });

  it("falls back to a default learner name when none is on file", async () => {
    const service = new ParentDashboardService(
      buildDashboardRepository(),
      buildMasteryRepository(),
      buildAdaptiveRepository(),
      buildMissionCompletionRepository({
        getLearnerDisplayName: vi.fn(async () => null),
      }),
    );

    const data = await service.getDashboardData("learner-1", REF);
    expect(data.learnerName).toBe("Learner");
  });

  it("builds full learning health and subject insights from mastery records", async () => {
    const records = [
      record({
        skillId: "s1",
        subjectId: "sub-1",
        subjectName: "Maths",
        masteryScore: 30,
      }),
      record({
        skillId: "s2",
        subjectId: "sub-2",
        subjectName: "English",
        masteryScore: 90,
      }),
    ];
    const service = new ParentDashboardService(
      buildDashboardRepository({
        getCompletedMissionDates: vi.fn(async () => [
          "2026-07-20",
          "2026-07-21",
        ]),
      }),
      buildMasteryRepository({
        getAllMasteryForLearnerEnriched: vi.fn(async () => records),
      }),
      buildAdaptiveRepository(),
      buildMissionCompletionRepository(),
    );

    const data = await service.getDashboardData("learner-1", REF);

    expect(data.hasData).toBe(true);
    expect(data.learningHealth.currentStreakDays).toBe(2);
    expect(data.subjectInsights.map((s) => s.subjectName)).toEqual([
      "Maths",
      "English",
    ]);
    expect(data.focusSkills[0]!.skillName).toBe("Addition");
  });

  it("returns an empty upcoming-mission preview when there are no adaptive candidates", async () => {
    const service = new ParentDashboardService(
      buildDashboardRepository(),
      buildMasteryRepository({
        getAllMasteryForLearnerEnriched: vi.fn(async () => [record()]),
      }),
      buildAdaptiveRepository(),
      buildMissionCompletionRepository(),
    );

    const data = await service.getDashboardData("learner-1", REF);
    expect(data.upcomingMissionPreview.focusSkillNames).toEqual([]);
  });

  it("resolves upcoming-mission focus skill IDs to names via the dashboard repository", async () => {
    const adaptiveRepository = buildAdaptiveRepository({
      loadCandidateData: vi.fn(async () => ({
        candidates: [
          {
            questionId: "q1",
            subjectId: "sub-1",
            subjectSlug: "mathematics",
            topicId: "topic-1",
            skillId: "skill-weak",
            difficulty: 2,
          },
        ],
        masteryBySkill: new Map([
          [
            "skill-weak",
            {
              skillId: "skill-weak",
              subjectId: "sub-1",
              masteryScore: 20,
              totalAttempts: 5,
              nextReviewAt: null,
            },
          ],
        ]),
        recentAttemptsByQuestion: new Map(),
        activeSubjectSlugs: ["mathematics"],
      })),
    });
    const dashboardRepository = buildDashboardRepository({
      getSkillNames: vi.fn(async () => new Map([["skill-weak", "Fractions"]])),
    });
    const service = new ParentDashboardService(
      dashboardRepository,
      buildMasteryRepository({
        getAllMasteryForLearnerEnriched: vi.fn(async () => [
          record({ skillId: "skill-weak", masteryScore: 20 }),
        ]),
      }),
      adaptiveRepository,
      buildMissionCompletionRepository(),
    );

    const data = await service.getDashboardData("learner-1", REF);

    expect(data.upcomingMissionPreview.focusSkillNames).toEqual(["Fractions"]);
    expect(dashboardRepository.getSkillNames).toHaveBeenCalledWith([
      "skill-weak",
    ]);
  });
});
