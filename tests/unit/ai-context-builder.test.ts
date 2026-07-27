import { describe, expect, it, vi } from "vitest";
import {
  ContextBuilder,
  ContextBuilderValidationError,
} from "@/modules/ai/coach/context-builder";
import { ParentDashboardService } from "@/modules/parent-dashboard/dashboard.service";
import type {
  ParentDashboardRepository,
  RecentMissionData,
} from "@/modules/parent-dashboard/dashboard.repository";
import type { MasteryRepository } from "@/modules/learning-profile/mastery.repository";
import type { AdaptiveDataRepository } from "@/modules/adaptive-learning/adaptive-mission.repository";
import type { MissionCompletionRepository } from "@/modules/missions/mission-completion.repository";
import type { EnrichedMasteryRecord } from "@/modules/learning-profile/mastery.types";
import { MissionCompletionService } from "@/modules/missions/mission-completion.service";
import { MissionPlayerService } from "@/modules/missions/mission-player.service";
import type {
  MissionItemRecord,
  MissionPlayerRepository,
  MissionRecord,
} from "@/modules/missions/mission-player.repository";

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

function buildDashboardService(
  overrides: {
    dashboardRepository?: Partial<ParentDashboardRepository>;
    masteryRepository?: Partial<MasteryRepository>;
    adaptiveRepository?: Partial<AdaptiveDataRepository>;
    completionRepository?: Partial<MissionCompletionRepository>;
  } = {},
): ParentDashboardService {
  return new ParentDashboardService(
    buildDashboardRepository(overrides.dashboardRepository),
    buildMasteryRepository(overrides.masteryRepository),
    buildAdaptiveRepository(overrides.adaptiveRepository),
    buildMissionCompletionRepository(overrides.completionRepository),
  );
}

const missionRecord: MissionRecord = {
  missionId: "mission-1",
  learnerId: "learner-1",
  missionDate: "2026-07-20",
  status: "completed",
  estimatedMinutes: 20,
  completedAt: "2026-07-20T12:00:00.000Z",
};

function buildMissionItems(): MissionItemRecord[] {
  return [
    {
      missionItemId: "item-1",
      questionId: "question-1",
      position: 1,
      subjectName: "Mathematics",
      subjectSlug: "mathematics",
      topicName: null,
      prompt: "What is 2 + 2?",
      explanation: "Add the two numbers together.",
      options: [
        { id: "a", label: "3", isCorrect: false, sortOrder: 1 },
        { id: "b", label: "4", isCorrect: true, sortOrder: 2 },
      ],
      attempt: { selectedOptionId: "b", isCorrect: true, responseMs: 60_000 },
    },
    {
      missionItemId: "item-2",
      questionId: "question-2",
      position: 2,
      subjectName: "English",
      subjectSlug: "english",
      topicName: null,
      prompt: "Choose the synonym for 'happy'.",
      explanation: "Joyful means happy.",
      options: [
        { id: "c", label: "Joyful", isCorrect: true, sortOrder: 1 },
        { id: "d", label: "Sad", isCorrect: false, sortOrder: 2 },
      ],
      attempt: { selectedOptionId: "d", isCorrect: false, responseMs: 60_000 },
    },
  ];
}

function buildMissionCompletionService(
  completionRepositoryOverrides: Partial<MissionCompletionRepository> = {},
): MissionCompletionService {
  const playerRepository: MissionPlayerRepository = {
    getAuthenticatedUserId: vi.fn(async () => "parent-1"),
    assertLearnerOwned: vi.fn(async () => undefined),
    getMissionRecord: vi.fn(async () => missionRecord),
    getMissionItems: vi.fn(async () => buildMissionItems()),
    getMissionItemForGrading: vi.fn(async () => null),
    upsertAttempt: vi.fn(async () => ({
      attemptId: "attempt-1",
      answeredAt: "2026-07-20T12:00:00.000Z",
    })),
    countAttempts: vi.fn(async () => ({
      answeredCount: 2,
      correctCount: 1,
      totalQuestions: 2,
    })),
    updateMissionStatus: vi.fn(async () => undefined),
  };
  const playerService = new MissionPlayerService(playerRepository);
  const completionRepository = buildMissionCompletionRepository(
    completionRepositoryOverrides,
  );
  return new MissionCompletionService(playerService, completionRepository);
}

describe("ContextBuilder.build", () => {
  it("defaults referenceTimestamp to the current time when omitted", async () => {
    const builder = new ContextBuilder(
      buildDashboardService(),
      buildMissionCompletionService(),
    );

    const context = await builder.build({
      learnerId: "learner-1",
      audience: "parent",
    });

    expect(context.generatedForDate).toBe(
      new Date().toISOString().slice(0, 10),
    );
  });

  it("produces a valid, empty-state DTO for a learner with no mastery data", async () => {
    const builder = new ContextBuilder(
      buildDashboardService(),
      buildMissionCompletionService(),
    );

    const context = await builder.build({
      learnerId: "learner-1",
      audience: "parent",
      referenceTimestamp: REF,
    });

    expect(context.schemaVersion).toBe("1.0");
    expect(context.promptVersion).toBe("coach-v1");
    expect(context.audience).toBe("parent");
    expect(context.generatedForDate).toBe("2026-07-21");
    expect(context.overallMastery).toBe(0);
    expect(context.overallAccuracy).toBe(0);
    expect(context.strongestSkills).toEqual([]);
    expect(context.focusSkills).toEqual([]);
    expect(context.deterministicRecommendations).toEqual([]);
    expect(context.recentMission).toBeNull();
    expect(context.upcomingFocusSkills).toEqual([]);
  });

  it("maps mastery records into skill/subject summaries and recommendations", async () => {
    const records = [
      record({
        skillId: "s1",
        subjectId: "sub-1",
        subjectName: "Maths",
        skillName: "Fractions",
        masteryScore: 20,
        confidenceScore: 15,
      }),
    ];
    const builder = new ContextBuilder(
      buildDashboardService({
        masteryRepository: {
          getAllMasteryForLearnerEnriched: vi.fn(async () => records),
        },
      }),
      buildMissionCompletionService(),
    );

    const context = await builder.build({
      learnerId: "learner-1",
      audience: "learner",
      referenceTimestamp: REF,
    });

    expect(context.focusSkills[0]).toEqual({
      name: "Fractions",
      subject: "Maths",
      mastery: 20,
      confidence: 15,
    });
    expect(context.subjectInsights[0]?.subject).toBe("Maths");
    // masteryScore 20 < 40 triggers the deterministic "focus_weak_skill" rule.
    expect(context.deterministicRecommendations).toEqual([
      {
        title: "Focus on a weak skill",
        description: "Focus on Fractions tomorrow.",
      },
    ]);
  });

  it("builds recentMission from the most recent completed session via MissionCompletionService", async () => {
    const dashboardService = buildDashboardService({
      dashboardRepository: {
        getRecentMissionData: vi.fn(async (): Promise<RecentMissionData> => ({
          missions: [
            {
              missionId: "mission-1",
              missionDate: "2026-07-20",
              status: "completed" as const,
              completedAt: "2026-07-20T12:00:00.000Z",
              questionCount: 2,
            },
          ],
          attemptsByMission: new Map([
            [
              "mission-1",
              [
                { isCorrect: true, responseMs: 60_000, difficulty: 3 },
                { isCorrect: false, responseMs: 60_000, difficulty: 3 },
              ],
            ],
          ]),
        })),
      },
    });
    const builder = new ContextBuilder(
      dashboardService,
      buildMissionCompletionService(),
    );

    const context = await builder.build({
      learnerId: "learner-1",
      audience: "parent",
      referenceTimestamp: REF,
    });

    expect(context.recentMission).toEqual({
      score: 1,
      totalQuestions: 2,
      durationMinutes: 2,
      completedAt: "2026-07-20T12:00:00.000Z",
    });
  });

  it("throws ContextBuilderValidationError when the assembled DTO is invalid", async () => {
    const builder = new ContextBuilder(
      buildDashboardService({
        completionRepository: { getLearnerDisplayName: vi.fn(async () => "") },
      }),
      buildMissionCompletionService(),
    );

    await expect(
      builder.build({
        learnerId: "learner-1",
        audience: "learner",
        referenceTimestamp: REF,
      }),
    ).rejects.toThrow(ContextBuilderValidationError);
  });
});
