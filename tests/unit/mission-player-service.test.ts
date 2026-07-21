import { describe, expect, it, vi } from "vitest";
import {
  MissionAccessError,
  MissionNotFoundError,
} from "@/modules/missions/mission.repository";
import {
  MissionOptionInvalidError,
  MissionPlayerService,
} from "@/modules/missions/mission-player.service";
import type {
  MissionItemForGrading,
  MissionItemRecord,
  MissionPlayerRepository,
  MissionRecord,
} from "@/modules/missions/mission-player.repository";

function buildRepository(
  overrides: Partial<MissionPlayerRepository> = {},
): MissionPlayerRepository {
  return {
    getAuthenticatedUserId: vi.fn(async () => "parent-1"),
    assertLearnerOwned: vi.fn(async () => undefined),
    getMissionRecord: vi.fn(async () => null),
    getMissionItems: vi.fn(async () => []),
    getMissionItemForGrading: vi.fn(async () => null),
    upsertAttempt: vi.fn(async () => ({
      attemptId: "attempt-1",
      answeredAt: "2026-07-20T00:00:00.000Z",
    })),
    countAttempts: vi.fn(async () => ({
      answeredCount: 0,
      correctCount: 0,
      totalQuestions: 16,
    })),
    updateMissionStatus: vi.fn(async () => undefined),
    ...overrides,
  };
}

const missionRecord: MissionRecord = {
  missionId: "mission-1",
  learnerId: "learner-1",
  missionDate: "2026-07-20",
  status: "in_progress",
  estimatedMinutes: 20,
  completedAt: null,
};

describe("MissionPlayerService.getMissionForPlayer", () => {
  it("rejects access to a learner the parent does not own", async () => {
    const repository = buildRepository({
      assertLearnerOwned: vi.fn(async () => {
        throw new MissionAccessError(
          "Learner is not owned by the current user",
        );
      }),
    });
    const service = new MissionPlayerService(repository);

    await expect(
      service.getMissionForPlayer("learner-1", "mission-1"),
    ).rejects.toThrow(MissionAccessError);
  });

  it("throws MissionNotFoundError when the mission does not belong to the learner", async () => {
    const repository = buildRepository({
      getMissionRecord: vi.fn(async () => null),
    });
    const service = new MissionPlayerService(repository);

    await expect(
      service.getMissionForPlayer("learner-1", "mission-1"),
    ).rejects.toThrow(MissionNotFoundError);
  });

  it("hides the correct answer and explanation for unanswered questions", async () => {
    const items: MissionItemRecord[] = [
      {
        missionItemId: "item-1",
        questionId: "question-1",
        position: 1,
        subjectName: "Mathematics",
        subjectSlug: "mathematics",
        topicName: "Arithmetic",
        prompt: "What is 2 + 2?",
        explanation: "Add the two numbers together.",
        options: [
          { id: "a", label: "3", isCorrect: false, sortOrder: 1 },
          { id: "b", label: "4", isCorrect: true, sortOrder: 2 },
        ],
        attempt: null,
      },
    ];
    const repository = buildRepository({
      getMissionRecord: vi.fn(async () => missionRecord),
      getMissionItems: vi.fn(async () => items),
    });
    const service = new MissionPlayerService(repository);

    const mission = await service.getMissionForPlayer("learner-1", "mission-1");

    expect(mission.answeredCount).toBe(0);
    expect(mission.questions[0].attempt).toBeNull();
    expect(mission.questions[0].options).toEqual([
      { id: "a", label: "3" },
      { id: "b", label: "4" },
    ]);
  });

  it("exposes the correct answer and explanation once a question is answered", async () => {
    const items: MissionItemRecord[] = [
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
        attempt: { selectedOptionId: "a", isCorrect: false, responseMs: 1500 },
      },
    ];
    const repository = buildRepository({
      getMissionRecord: vi.fn(async () => missionRecord),
      getMissionItems: vi.fn(async () => items),
    });
    const service = new MissionPlayerService(repository);

    const mission = await service.getMissionForPlayer("learner-1", "mission-1");

    expect(mission.answeredCount).toBe(1);
    expect(mission.correctCount).toBe(0);
    expect(mission.questions[0].attempt).toEqual({
      selectedOptionId: "a",
      correctOptionId: "b",
      isCorrect: false,
      explanation: "Add the two numbers together.",
      responseMs: 1500,
    });
  });
});

const gradingItem: MissionItemForGrading = {
  missionItemId: "item-1",
  questionId: "question-1",
  explanation: "Add the two numbers together.",
  options: [
    { id: "a", isCorrect: false },
    { id: "b", isCorrect: true },
  ],
};

describe("MissionPlayerService.submitAnswer", () => {
  it("determines correctness server-side from the stored options", async () => {
    const repository = buildRepository({
      getMissionRecord: vi.fn(async () => missionRecord),
      getMissionItemForGrading: vi.fn(async () => gradingItem),
      countAttempts: vi.fn(async () => ({
        answeredCount: 1,
        correctCount: 1,
        totalQuestions: 16,
      })),
    });
    const service = new MissionPlayerService(repository);

    const result = await service.submitAnswer({
      learnerId: "learner-1",
      missionId: "mission-1",
      missionItemId: "item-1",
      optionId: "b",
      responseMs: 2000,
    });

    expect(result.isCorrect).toBe(true);
    expect(result.correctOptionId).toBe("b");
    expect(repository.upsertAttempt).toHaveBeenCalledWith({
      missionItemId: "item-1",
      questionId: "question-1",
      optionId: "b",
      isCorrect: true,
      responseMs: 2000,
    });
  });

  it("rejects a mission item that belongs to a different mission", async () => {
    const repository = buildRepository({
      getMissionRecord: vi.fn(async () => missionRecord),
      getMissionItemForGrading: vi.fn(async () => null),
    });
    const service = new MissionPlayerService(repository);

    await expect(
      service.submitAnswer({
        learnerId: "learner-1",
        missionId: "mission-1",
        missionItemId: "item-from-another-mission",
        optionId: "b",
        responseMs: 1000,
      }),
    ).rejects.toThrow(MissionNotFoundError);
  });

  it("rejects an option that does not belong to the question", async () => {
    const repository = buildRepository({
      getMissionRecord: vi.fn(async () => missionRecord),
      getMissionItemForGrading: vi.fn(async () => gradingItem),
    });
    const service = new MissionPlayerService(repository);

    await expect(
      service.submitAnswer({
        learnerId: "learner-1",
        missionId: "mission-1",
        missionItemId: "item-1",
        optionId: "not-a-real-option",
        responseMs: 1000,
      }),
    ).rejects.toThrow(MissionOptionInvalidError);
  });

  it("sets the mission to in_progress after the first answer", async () => {
    const updateMissionStatus = vi.fn(async () => undefined);
    const repository = buildRepository({
      getMissionRecord: vi.fn(async () => ({
        ...missionRecord,
        status: "ready" as const,
      })),
      getMissionItemForGrading: vi.fn(async () => gradingItem),
      countAttempts: vi.fn(async () => ({
        answeredCount: 1,
        correctCount: 0,
        totalQuestions: 16,
      })),
      updateMissionStatus,
    });
    const service = new MissionPlayerService(repository);

    await service.submitAnswer({
      learnerId: "learner-1",
      missionId: "mission-1",
      missionItemId: "item-1",
      optionId: "a",
      responseMs: 1000,
    });

    expect(updateMissionStatus).toHaveBeenCalledWith({
      missionId: "mission-1",
      status: "in_progress",
      completedAt: null,
    });
  });

  it("completes the mission and stamps completedAt when the final answer is submitted", async () => {
    const updateMissionStatus = vi.fn(async () => undefined);
    const repository = buildRepository({
      getMissionRecord: vi.fn(async () => missionRecord),
      getMissionItemForGrading: vi.fn(async () => gradingItem),
      countAttempts: vi.fn(async () => ({
        answeredCount: 16,
        correctCount: 12,
        totalQuestions: 16,
      })),
      updateMissionStatus,
    });
    const service = new MissionPlayerService(repository);

    const result = await service.submitAnswer({
      learnerId: "learner-1",
      missionId: "mission-1",
      missionItemId: "item-1",
      optionId: "b",
      responseMs: 1000,
    });

    expect(result.mission.status).toBe("completed");
    expect(result.mission.completedAt).not.toBeNull();
    expect(updateMissionStatus).toHaveBeenCalledWith(
      expect.objectContaining({ missionId: "mission-1", status: "completed" }),
    );
  });

  it("preserves the original completedAt when a completed mission's answer is changed", async () => {
    const originalCompletedAt = "2026-07-01T00:00:00.000Z";
    const updateMissionStatus = vi.fn(async () => undefined);
    const repository = buildRepository({
      getMissionRecord: vi.fn(async () => ({
        ...missionRecord,
        status: "completed" as const,
        completedAt: originalCompletedAt,
      })),
      getMissionItemForGrading: vi.fn(async () => gradingItem),
      countAttempts: vi.fn(async () => ({
        answeredCount: 16,
        correctCount: 12,
        totalQuestions: 16,
      })),
      updateMissionStatus,
    });
    const service = new MissionPlayerService(repository);

    await service.submitAnswer({
      learnerId: "learner-1",
      missionId: "mission-1",
      missionItemId: "item-1",
      optionId: "a",
      responseMs: 1000,
    });

    expect(updateMissionStatus).toHaveBeenCalledWith({
      missionId: "mission-1",
      status: "completed",
      completedAt: originalCompletedAt,
    });
  });

  it("safely updates the same attempt when an answer changes, without duplicating", async () => {
    const upsertAttempt = vi.fn(async () => ({
      attemptId: "attempt-1",
      answeredAt: "2026-07-20T00:00:00.000Z",
    }));
    const repository = buildRepository({
      getMissionRecord: vi.fn(async () => missionRecord),
      getMissionItemForGrading: vi.fn(async () => gradingItem),
      upsertAttempt,
    });
    const service = new MissionPlayerService(repository);

    await service.submitAnswer({
      learnerId: "learner-1",
      missionId: "mission-1",
      missionItemId: "item-1",
      optionId: "a",
      responseMs: 1000,
    });
    await service.submitAnswer({
      learnerId: "learner-1",
      missionId: "mission-1",
      missionItemId: "item-1",
      optionId: "b",
      responseMs: 1200,
    });

    expect(upsertAttempt).toHaveBeenCalledTimes(2);
    expect(upsertAttempt).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        missionItemId: "item-1",
        optionId: "a",
        isCorrect: false,
      }),
    );
    expect(upsertAttempt).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        missionItemId: "item-1",
        optionId: "b",
        isCorrect: true,
      }),
    );
  });

  it("clamps response time to the supported range", async () => {
    const upsertAttempt = vi.fn(async () => ({
      attemptId: "attempt-1",
      answeredAt: "2026-07-20T00:00:00.000Z",
    }));
    const repository = buildRepository({
      getMissionRecord: vi.fn(async () => missionRecord),
      getMissionItemForGrading: vi.fn(async () => gradingItem),
      upsertAttempt,
    });
    const service = new MissionPlayerService(repository);

    await service.submitAnswer({
      learnerId: "learner-1",
      missionId: "mission-1",
      missionItemId: "item-1",
      optionId: "b",
      responseMs: 999_999_999,
    });

    expect(upsertAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ responseMs: 3_600_000 }),
    );
  });

  it("hands the persisted attempt off to the mastery processor after grading completes", async () => {
    const repository = buildRepository({
      getMissionRecord: vi.fn(async () => missionRecord),
      getMissionItemForGrading: vi.fn(async () => gradingItem),
      upsertAttempt: vi.fn(async () => ({
        attemptId: "attempt-42",
        answeredAt: "2026-07-20T12:00:00.000Z",
      })),
    });
    const processQuestionAttempt = vi.fn(async () => ({ processed: true }));
    const service = new MissionPlayerService(repository, {
      processQuestionAttempt,
    });

    await service.submitAnswer({
      learnerId: "learner-1",
      missionId: "mission-1",
      missionItemId: "item-1",
      optionId: "b",
      responseMs: 2000,
      requestId: "req-1",
    });

    expect(processQuestionAttempt).toHaveBeenCalledWith({
      learnerId: "learner-1",
      attemptId: "attempt-42",
      questionId: "question-1",
      isCorrect: true,
      responseMs: 2000,
      answeredAt: new Date("2026-07-20T12:00:00.000Z"),
      requestId: "req-1",
    });
  });

  it("does not fail the answer submission when mastery processing throws", async () => {
    const repository = buildRepository({
      getMissionRecord: vi.fn(async () => missionRecord),
      getMissionItemForGrading: vi.fn(async () => gradingItem),
    });
    const processQuestionAttempt = vi.fn(async () => {
      throw new Error("mastery engine exploded");
    });
    const service = new MissionPlayerService(repository, {
      processQuestionAttempt,
    });

    const result = await service.submitAnswer({
      learnerId: "learner-1",
      missionId: "mission-1",
      missionItemId: "item-1",
      optionId: "b",
      responseMs: 2000,
    });

    expect(result.isCorrect).toBe(true);
    expect(processQuestionAttempt).toHaveBeenCalledTimes(1);
  });

  it("works without a mastery processor configured", async () => {
    const repository = buildRepository({
      getMissionRecord: vi.fn(async () => missionRecord),
      getMissionItemForGrading: vi.fn(async () => gradingItem),
    });
    const service = new MissionPlayerService(repository);

    const result = await service.submitAnswer({
      learnerId: "learner-1",
      missionId: "mission-1",
      missionItemId: "item-1",
      optionId: "b",
      responseMs: 2000,
    });

    expect(result.isCorrect).toBe(true);
  });
});
