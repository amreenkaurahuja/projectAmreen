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
import type {
  EnrichedMasteryRecord,
  LearnerSkillMasteryRecord,
} from "@/modules/learning-profile/mastery.types";
import type {
  MissionAttemptRow,
  MissionMeta,
} from "@/modules/parent-dashboard/learning-health";

// End-to-end coverage across the parent-dashboard <-> mastery/mission
// boundary: a *real* ParentDashboardService driving the *real* pure
// aggregation functions (learning-health.ts, recommendation-engine.ts),
// backed by hand-built in-memory fakes for every repository it depends on —
// the same pattern used by mission-mastery-integration.test.ts and
// adaptive-mission-integration.test.ts.

const REF = new Date("2026-07-21T00:00:00.000Z");

function masteryRecord(
  learnerId: string,
  overrides: Partial<EnrichedMasteryRecord> = {},
): EnrichedMasteryRecord {
  return {
    id: `mastery-${Math.random()}`,
    learnerId,
    skillId: `skill-${Math.random()}`,
    subjectId: "subject-maths",
    topicId: "topic-1",
    skillName: "Addition",
    subjectName: "Mathematics",
    masteryScore: 50,
    confidenceScore: 50,
    totalAttempts: 4,
    correctAttempts: 3,
    incorrectAttempts: 1,
    averageResponseMs: 8_000,
    lastResponseMs: 8_000,
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
  learnerData: Map<
    string,
    { completedDates: string[]; recentMissionData: RecentMissionData }
  >,
  ownedLearnerIds: Set<string>,
): ParentDashboardRepository {
  return {
    getAuthenticatedUserId: async () => "parent-1",
    assertLearnerOwned: async (learnerId: string) => {
      if (!ownedLearnerIds.has(learnerId)) {
        throw new ParentDashboardAccessError(
          "Learner is not owned by the current user",
        );
      }
    },
    getCompletedMissionDates: async (learnerId: string) =>
      learnerData.get(learnerId)?.completedDates ?? [],
    getRecentMissionData: async (learnerId: string) =>
      learnerData.get(learnerId)?.recentMissionData ?? {
        missions: [],
        attemptsByMission: new Map(),
      },
    getSkillNames: async () => new Map(),
  };
}

function buildMasteryRepository(
  recordsByLearner: Map<string, EnrichedMasteryRecord[]>,
): MasteryRepository {
  return {
    getAuthenticatedUserId: vi.fn(async () => "parent-1"),
    assertLearnerOwned: vi.fn(async () => undefined),
    getQuestionCurriculumMetadata: vi.fn(async () => null),
    claimAttemptForMastery: vi.fn(async () => true),
    unclaimAttempt: vi.fn(async () => undefined),
    getMasteryRow: vi.fn(async () => null),
    insertMasteryRow: vi.fn(async () => {
      throw new Error("not used in this test");
    }),
    updateMasteryRow: vi.fn(async () => {
      throw new Error("not used in this test");
    }),
    getAllMasteryForLearner: vi.fn(
      async (learnerId: string) =>
        (recordsByLearner.get(learnerId) ?? []) as LearnerSkillMasteryRecord[],
    ),
    getAllMasteryForLearnerEnriched: vi.fn(
      async (learnerId: string) => recordsByLearner.get(learnerId) ?? [],
    ),
  };
}

function buildAdaptiveRepository(): AdaptiveDataRepository {
  return {
    loadCandidateData: async () => ({
      candidates: [],
      masteryBySkill: new Map(),
      recentAttemptsByQuestion: new Map(),
      activeSubjectSlugs: [],
    }),
  };
}

function buildMissionCompletionRepository(
  namesByLearner: Map<string, string>,
): MissionCompletionRepository {
  return {
    getLearnerDisplayName: async (learnerId: string) =>
      namesByLearner.get(learnerId) ?? null,
  };
}

describe("Parent dashboard integration — many learners", () => {
  it("keeps two learners' dashboards fully isolated", async () => {
    const learnerAId = "learner-a";
    const learnerBId = "learner-b";

    const recordsByLearner = new Map<string, EnrichedMasteryRecord[]>([
      [
        learnerAId,
        [
          masteryRecord(learnerAId, {
            skillName: "Fractions",
            masteryScore: 20,
          }),
        ],
      ],
      [
        learnerBId,
        [masteryRecord(learnerBId, { skillName: "Grammar", masteryScore: 95 })],
      ],
    ]);
    const namesByLearner = new Map([
      [learnerAId, "Amelia"],
      [learnerBId, "Ben"],
    ]);
    const missionDataByLearner = new Map([
      [
        learnerAId,
        {
          completedDates: ["2026-07-21"],
          recentMissionData: emptyMissionData(),
        },
      ],
      [
        learnerBId,
        { completedDates: [], recentMissionData: emptyMissionData() },
      ],
    ]);

    const service = new ParentDashboardService(
      buildDashboardRepository(
        missionDataByLearner,
        new Set([learnerAId, learnerBId]),
      ),
      buildMasteryRepository(recordsByLearner),
      buildAdaptiveRepository(),
      buildMissionCompletionRepository(namesByLearner),
    );

    const dataA = await service.getDashboardData(learnerAId, REF);
    const dataB = await service.getDashboardData(learnerBId, REF);

    expect(dataA.learnerName).toBe("Amelia");
    expect(dataB.learnerName).toBe("Ben");
    expect(dataA.focusSkills[0]?.skillName).toBe("Fractions");
    expect(dataB.focusSkills[0]?.skillName).toBe("Grammar");
    expect(dataA.learningHealth.currentStreakDays).toBe(1);
    expect(dataB.learningHealth.currentStreakDays).toBe(0);
  });

  it("rejects access to a learner that isn't in the owned set, independent of other learners", async () => {
    const dashboardRepository = buildDashboardRepository(
      new Map(),
      new Set(["learner-a"]),
    );
    const service = new ParentDashboardService(
      dashboardRepository,
      buildMasteryRepository(new Map()),
      buildAdaptiveRepository(),
      buildMissionCompletionRepository(new Map()),
    );

    await expect(service.getDashboardData("learner-b", REF)).rejects.toThrow(
      ParentDashboardAccessError,
    );
  });
});

function emptyMissionData(): RecentMissionData {
  return { missions: [], attemptsByMission: new Map() };
}

describe("Parent dashboard integration — large history", () => {
  it("handles many mastery records and a long mission history without error", async () => {
    const learnerId = "learner-heavy";
    const records = Array.from({ length: 60 }, (_, i) =>
      masteryRecord(learnerId, {
        skillId: `skill-${i}`,
        skillName: `Skill ${i}`,
        subjectId: `subject-${i % 4}`,
        subjectName: `Subject ${i % 4}`,
        masteryScore: (i * 7) % 100,
      }),
    );

    // 90 consecutive days of completed missions, plus a long-past run —
    // exercises both the streak walk and the recent-missions cap.
    const completedDates = Array.from({ length: 90 }, (_, i) => {
      const date = new Date(REF.getTime() - (89 - i) * 24 * 60 * 60 * 1000);
      return date.toISOString().slice(0, 10);
    });

    const missions: MissionMeta[] = completedDates
      .slice(-30)
      .map((date, i) => ({
        missionId: `mission-${i}`,
        missionDate: date,
        status: "completed",
        completedAt: `${date}T12:00:00.000Z`,
        questionCount: 16,
      }));
    const attemptsByMission = new Map<string, MissionAttemptRow[]>(
      missions.map((mission) => [
        mission.missionId,
        Array.from({ length: 16 }, (_, q) => ({
          isCorrect: q % 3 !== 0,
          difficulty: (q % 5) + 1,
          responseMs: 4_000,
        })),
      ]),
    );

    const missionDataByLearner = new Map([
      [
        learnerId,
        {
          completedDates,
          recentMissionData: { missions, attemptsByMission },
        },
      ],
    ]);

    const service = new ParentDashboardService(
      buildDashboardRepository(missionDataByLearner, new Set([learnerId])),
      buildMasteryRepository(new Map([[learnerId, records]])),
      buildAdaptiveRepository(),
      buildMissionCompletionRepository(new Map([[learnerId, "Charlie"]])),
    );

    const data = await service.getDashboardData(learnerId, REF);

    expect(data.hasData).toBe(true);
    expect(data.learningHealth.currentStreakDays).toBe(90);
    expect(data.learningHealth.longestStreakDays).toBe(90);
    expect(data.subjectInsights).toHaveLength(4);
    expect(data.strongestSkills).toHaveLength(5);
    expect(data.focusSkills).toHaveLength(5);
    expect(data.weeklyProgress).toHaveLength(7);
    expect(data.sessionHistory.length).toBeGreaterThan(0);
    expect(data.recommendations.length).toBeGreaterThan(0);
  });
});
