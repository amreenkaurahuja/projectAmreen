// Regression coverage for a production bug verified directly against the
// database for mission b57ff967-549a-444d-99c8-66d15de4f996: mission_items
// position 1 had a persisted question_attempts row, position 2 (and every
// later position) had none. Resume must open position 2 (array index 1),
// not position 1.
import { describe, expect, it, vi } from "vitest";
import { getInitialMissionIndex } from "@/modules/missions/resume";
import { MissionPlayerService } from "@/modules/missions/mission-player.service";
import type {
  MissionItemForGrading,
  MissionItemRecord,
  MissionPlayerRepository,
  MissionRecord,
} from "@/modules/missions/mission-player.repository";
import type { MissionPlayer } from "@/modules/missions/mission-player.types";

const missionRecord: MissionRecord = {
  missionId: "b57ff967-549a-444d-99c8-66d15de4f996",
  learnerId: "learner-1",
  missionDate: "2026-07-20",
  status: "in_progress",
  estimatedMinutes: 20,
  completedAt: null,
};

function buildItems(answeredPositions: number[]): MissionItemRecord[] {
  return Array.from({ length: 16 }, (_, index) => {
    const position = index + 1;
    const answered = answeredPositions.includes(position);
    return {
      missionItemId: `item-${position}`,
      questionId: `question-${position}`,
      position,
      subjectName: "Mathematics",
      subjectSlug: "mathematics",
      topicName: null,
      prompt: `Question ${position}`,
      explanation: "Explanation",
      options: [
        { id: `${position}-a`, label: "A", isCorrect: true, sortOrder: 1 },
        { id: `${position}-b`, label: "B", isCorrect: false, sortOrder: 2 },
      ],
      attempt: answered
        ? {
            selectedOptionId: `${position}-a`,
            isCorrect: true,
            responseMs: 1000,
          }
        : null,
    };
  });
}

function buildRepository(items: MissionItemRecord[]): MissionPlayerRepository {
  return {
    getAuthenticatedUserId: vi.fn(async () => "parent-1"),
    assertLearnerOwned: vi.fn(async () => undefined),
    getMissionRecord: vi.fn(async () => missionRecord),
    getMissionItems: vi.fn(async () => items),
    getMissionItemForGrading: vi.fn(
      async () => null as MissionItemForGrading | null,
    ),
    upsertAttempt: vi.fn(async () => undefined),
    countAttempts: vi.fn(async () => ({
      answeredCount: items.filter((item) => item.attempt).length,
      correctCount: items.filter((item) => item.attempt?.isCorrect).length,
      totalQuestions: items.length,
    })),
    updateMissionStatus: vi.fn(async () => undefined),
  };
}

async function loadMission(
  answeredPositions: number[],
): Promise<MissionPlayer> {
  const repository = buildRepository(buildItems(answeredPositions));
  const service = new MissionPlayerService(repository);
  return service.getMissionForPlayer("learner-1", missionRecord.missionId);
}

describe("mission resume regression: mission b57ff967-549a-444d-99c8-66d15de4f996", () => {
  it("resolves to array index 1 (question 2) when only position 1 has an attempt", async () => {
    const mission = await loadMission([1]);

    expect(mission.questions[0].attempt).not.toBeNull();
    expect(mission.questions[1].attempt).toBeNull();
    expect(getInitialMissionIndex(mission)).toBe(1);
  });

  it("resolves to array index 5 (question 6) when positions 1-5 have attempts", async () => {
    const mission = await loadMission([1, 2, 3, 4, 5]);

    expect(getInitialMissionIndex(mission)).toBe(5);
  });

  it("resolves to completion when all 16 positions have attempts", async () => {
    const mission = await loadMission(
      Array.from({ length: 16 }, (_, index) => index + 1),
    );

    expect(getInitialMissionIndex(mission)).toBe(16);
    expect(mission.answeredCount).toBe(16);
  });

  it("never creates a new mission when resuming — getMissionRecord is read-only", async () => {
    const repository = buildRepository(buildItems([1]));
    const service = new MissionPlayerService(repository);

    await service.getMissionForPlayer("learner-1", missionRecord.missionId);

    expect(repository.getMissionRecord).toHaveBeenCalledWith(
      missionRecord.missionId,
      "learner-1",
    );
    expect(repository.upsertAttempt).not.toHaveBeenCalled();
  });
});
