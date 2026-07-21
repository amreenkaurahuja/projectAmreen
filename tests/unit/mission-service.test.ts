import { describe, expect, it, vi } from "vitest";
import {
  MissionAccessError,
  MissionDuplicateError,
} from "@/modules/missions/mission.repository";
import { MissionService } from "@/modules/missions/mission.service";
import type { MissionSummary } from "@/modules/missions/mission.types";

describe("mission service", () => {
  it("reuses an existing mission for the learner", async () => {
    const existingMission: MissionSummary = {
      missionId: "mission-1",
      learnerId: "learner-1",
      missionDate: "2026-07-20",
      status: "ready",
      questionCount: 16,
      estimatedMinutes: 20,
      answeredCount: 3,
      correctCount: 2,
      completedAt: null,
    };

    const repository = {
      getAuthenticatedUserId: vi.fn(async () => "parent-1"),
      ensureLearnerOwned: vi.fn(async () => undefined),
      findTodaysMission: vi.fn(async () => existingMission),
      createMission: vi.fn(async () => existingMission),
      getActiveQuestionsBySubject: vi.fn(async () => []),
    };

    const service = new MissionService(repository as never);
    const result = await service.getOrCreateTodaysMission("learner-1");

    expect(result.missionId).toBe(existingMission.missionId);
    expect(repository.createMission).not.toHaveBeenCalled();
  });

  it("returns the competing mission after a unique-constraint race", async () => {
    const competingMission: MissionSummary = {
      missionId: "mission-2",
      learnerId: "learner-1",
      missionDate: "2026-07-20",
      status: "ready",
      questionCount: 16,
      estimatedMinutes: 20,
      answeredCount: 0,
      correctCount: 0,
      completedAt: null,
    };

    let lookupCount = 0;
    const repository = {
      getAuthenticatedUserId: vi.fn(async () => "parent-1"),
      ensureLearnerOwned: vi.fn(async () => undefined),
      findTodaysMission: vi.fn(async () => {
        lookupCount += 1;
        if (lookupCount > 1) {
          return competingMission;
        }
        return null;
      }),
      createMission: vi.fn(async () => {
        throw new MissionDuplicateError("Mission already exists");
      }),
      getActiveQuestionsBySubject: vi.fn(async () =>
        Array.from({ length: 16 }, (_, index) => ({
          id: `question-${index}`,
          subjectSlug: "mathematics",
        })),
      ),
    };

    const service = new MissionService(repository as never);
    const result = await service.getOrCreateTodaysMission("learner-1");

    expect(result.missionId).toBe(competingMission.missionId);
  });

  it("rejects unowned learner access", async () => {
    const repository = {
      getAuthenticatedUserId: vi.fn(async () => "parent-1"),
      ensureLearnerOwned: vi.fn(async () => {
        throw new MissionAccessError(
          "Learner is not owned by the current user",
        );
      }),
      findTodaysMission: vi.fn(async () => null),
      createMission: vi.fn(async () => null),
      getActiveQuestionsBySubject: vi.fn(async () => []),
    };

    const service = new MissionService(repository as never);

    await expect(service.getOrCreateTodaysMission("learner-1")).rejects.toThrow(
      MissionAccessError,
    );
  });
});
