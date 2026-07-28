import { describe, expect, it, vi } from "vitest";
import { MissionAccessError } from "@/modules/missions/mission.repository";
import { MissionPlayerService } from "@/modules/missions/mission-player.service";
import type {
  MissionItemForGrading,
  MissionItemRecord,
  MissionPlayerRepository,
  MissionRecord,
} from "@/modules/missions/mission-player.repository";
import { MissionCompletionService } from "@/modules/missions/mission-completion.service";
import type { MissionCompletionRepository } from "@/modules/missions/mission-completion.repository";

const missionRecord: MissionRecord = {
  missionId: "mission-1",
  learnerId: "learner-1",
  missionDate: "2026-07-20",
  status: "completed",
  estimatedMinutes: 20,
  completedAt: "2026-07-20T12:00:00.000Z",
};

function buildItems(): MissionItemRecord[] {
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
      attempt: {
        attemptId: "attempt-1",
        selectedOptionId: "a",
        isCorrect: false,
        responseMs: 1000,
      },
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
      attempt: {
        attemptId: "attempt-1",
        selectedOptionId: "c",
        isCorrect: true,
        responseMs: 900,
      },
    },
  ];
}

function buildPlayerRepository(
  overrides: Partial<MissionPlayerRepository> = {},
): MissionPlayerRepository {
  return {
    getAuthenticatedUserId: vi.fn(async () => "parent-1"),
    assertLearnerOwned: vi.fn(async () => undefined),
    getMissionRecord: vi.fn(async () => missionRecord),
    getMissionItems: vi.fn(async () => buildItems()),
    getMissionItemForGrading: vi.fn(
      async () => null as MissionItemForGrading | null,
    ),
    upsertAttempt: vi.fn(async () => ({
      attemptId: "attempt-1",
      answeredAt: "2026-07-20T00:00:00.000Z",
    })),
    countAttempts: vi.fn(async () => ({
      answeredCount: 2,
      correctCount: 1,
      totalQuestions: 2,
    })),
    updateMissionStatus: vi.fn(async () => undefined),
    ...overrides,
  };
}

function buildCompletionRepository(
  displayName: string | null = "Amelia",
): MissionCompletionRepository {
  return {
    getLearnerDisplayName: vi.fn(async () => displayName),
  };
}

describe("MissionCompletionService.getSummary", () => {
  it("returns a completion summary using the learner's display name", async () => {
    const playerService = new MissionPlayerService(buildPlayerRepository());
    const service = new MissionCompletionService(
      playerService,
      buildCompletionRepository("Amelia"),
    );

    const summary = await service.getSummary("learner-1", "mission-1");

    expect(summary.learnerName).toBe("Amelia");
    expect(summary.correctCount).toBe(1);
    expect(summary.answeredCount).toBe(2);
    expect(summary.accuracyPercent).toBe(50);
  });

  it("falls back to a generic name when the learner has none on file", async () => {
    const playerService = new MissionPlayerService(buildPlayerRepository());
    const service = new MissionCompletionService(
      playerService,
      buildCompletionRepository(null),
    );

    const summary = await service.getSummary("learner-1", "mission-1");

    expect(summary.learnerName).toBe("Learner");
  });

  it("propagates ownership failures without exposing mission data", async () => {
    const playerRepository = buildPlayerRepository({
      assertLearnerOwned: vi.fn(async () => {
        throw new MissionAccessError(
          "Learner is not owned by the current user",
        );
      }),
    });
    const service = new MissionCompletionService(
      new MissionPlayerService(playerRepository),
      buildCompletionRepository(),
    );

    await expect(service.getSummary("learner-1", "mission-1")).rejects.toThrow(
      MissionAccessError,
    );
  });
});

describe("MissionCompletionService.getReview", () => {
  it("returns only the incorrect answered question", async () => {
    const playerService = new MissionPlayerService(buildPlayerRepository());
    const service = new MissionCompletionService(
      playerService,
      buildCompletionRepository("Amelia"),
    );

    const review = await service.getReview("learner-1", "mission-1");

    expect(review.mistakes).toHaveLength(1);
    expect(review.mistakes[0].missionItemId).toBe("item-1");
    expect(review.mistakes[0].correctOptionLabel).toBe("4");
    expect(review.isPerfectScore).toBe(false);
  });

  it("never touches unanswered items' correct-answer data", async () => {
    const itemsWithUnanswered: MissionItemRecord[] = [
      ...buildItems(),
      {
        missionItemId: "item-3",
        questionId: "question-3",
        position: 3,
        subjectName: "Verbal Reasoning",
        subjectSlug: "verbal-reasoning",
        topicName: null,
        prompt: "Unanswered question",
        explanation: "Should never be exposed",
        options: [
          { id: "e", label: "Option E", isCorrect: true, sortOrder: 1 },
          { id: "f", label: "Option F", isCorrect: false, sortOrder: 2 },
        ],
        attempt: null,
      },
    ];
    const playerRepository = buildPlayerRepository({
      getMissionItems: vi.fn(async () => itemsWithUnanswered),
    });
    const service = new MissionCompletionService(
      new MissionPlayerService(playerRepository),
      buildCompletionRepository(),
    );

    const review = await service.getReview("learner-1", "mission-1");

    expect(review.mistakes.some((m) => m.missionItemId === "item-3")).toBe(
      false,
    );
  });

  it("reports isPerfectScore when there are no mistakes", async () => {
    const allCorrect: MissionItemRecord[] = buildItems().map((item) => ({
      ...item,
      attempt: item.attempt
        ? { ...item.attempt, isCorrect: true, selectedOptionId: "b" }
        : null,
    }));
    allCorrect[0]!.attempt = {
      attemptId: "attempt-1",
      selectedOptionId: "b",
      isCorrect: true,
      responseMs: 1000,
    };
    const playerRepository = buildPlayerRepository({
      getMissionItems: vi.fn(async () => allCorrect),
    });
    const service = new MissionCompletionService(
      new MissionPlayerService(playerRepository),
      buildCompletionRepository(),
    );

    const review = await service.getReview("learner-1", "mission-1");

    expect(review.mistakes).toEqual([]);
    expect(review.isPerfectScore).toBe(true);
  });
});
