import { describe, expect, it, vi } from "vitest";
import { createInitialMasteryState } from "@/modules/learning-profile/mastery-calculator";
import {
  MasteryConcurrencyConflictError,
  type InsertMasteryParams,
  type MasteryRepository,
  type UpdateMasteryParams,
} from "@/modules/learning-profile/mastery.repository";
import { MasteryService } from "@/modules/learning-profile/mastery.service";
import type {
  LearnerSkillMasteryRecord,
  SkillCurriculumMetadata,
} from "@/modules/learning-profile/mastery.types";

const LEARNER_ID = "learner-1";
const QUESTION_ID = "question-1";
const ATTEMPT_ID = "attempt-1";
const SKILL_META: SkillCurriculumMetadata = {
  skillId: "skill-1",
  subjectId: "subject-1",
  topicId: "topic-1",
  difficulty: 3,
};

function buildRecord(
  overrides: Partial<LearnerSkillMasteryRecord> = {},
): LearnerSkillMasteryRecord {
  return {
    id: "mastery-1",
    learnerId: LEARNER_ID,
    skillId: SKILL_META.skillId,
    subjectId: SKILL_META.subjectId,
    topicId: SKILL_META.topicId,
    ...createInitialMasteryState(),
    updatedAt: "2026-07-21T00:00:00.000Z",
    ...overrides,
  };
}

function buildRepository(
  overrides: Partial<MasteryRepository> = {},
): MasteryRepository {
  return {
    getAuthenticatedUserId: vi.fn(async () => "parent-1"),
    assertLearnerOwned: vi.fn(async () => undefined),
    getQuestionCurriculumMetadata: vi.fn(async () => SKILL_META),
    claimAttemptForMastery: vi.fn(async () => true),
    unclaimAttempt: vi.fn(async () => undefined),
    getMasteryRow: vi.fn(async () => null),
    insertMasteryRow: vi.fn(async (params: InsertMasteryParams) =>
      buildRecord({ ...params.state }),
    ),
    updateMasteryRow: vi.fn(async (params: UpdateMasteryParams) =>
      buildRecord({ id: params.id, ...params.state }),
    ),
    getAllMasteryForLearner: vi.fn(async () => []),
    getAllMasteryForLearnerEnriched: vi.fn(async () => []),
    ...overrides,
  };
}

function baseParams() {
  return {
    learnerId: LEARNER_ID,
    attemptId: ATTEMPT_ID,
    questionId: QUESTION_ID,
    isCorrect: true,
    responseMs: 10_000,
    answeredAt: new Date("2026-07-21T00:00:00.000Z"),
  };
}

describe("MasteryService.processQuestionAttempt", () => {
  it("creates a new mastery row on a skill's first attempt", async () => {
    const repository = buildRepository();
    const service = new MasteryService(repository);

    const outcome = await service.processQuestionAttempt(baseParams());

    expect(outcome.processed).toBe(true);
    if (outcome.processed) {
      expect(outcome.mastery.masteryScore).toBe(54); // 50 + 4 (difficulty 3, correct)
      expect(outcome.mastery.totalAttempts).toBe(1);
    }
    expect(repository.insertMasteryRow).toHaveBeenCalledTimes(1);
    expect(repository.updateMasteryRow).not.toHaveBeenCalled();
  });

  it("updates the existing row on a second attempt for the same skill", async () => {
    const existing = buildRecord({
      masteryScore: 60,
      totalAttempts: 1,
      correctAttempts: 1,
    });
    const repository = buildRepository({
      getMasteryRow: vi.fn(async () => existing),
    });
    const service = new MasteryService(repository);

    const outcome = await service.processQuestionAttempt(baseParams());

    expect(outcome.processed).toBe(true);
    expect(repository.updateMasteryRow).toHaveBeenCalledTimes(1);
    expect(repository.insertMasteryRow).not.toHaveBeenCalled();
    if (outcome.processed) {
      expect(outcome.mastery.totalAttempts).toBe(2);
    }
  });

  it("does not process an attempt that was already claimed (idempotent)", async () => {
    const repository = buildRepository({
      claimAttemptForMastery: vi.fn(async () => false),
    });
    const service = new MasteryService(repository);

    const outcome = await service.processQuestionAttempt(baseParams());

    expect(outcome).toEqual({ processed: false, reason: "already-processed" });
    expect(repository.getMasteryRow).not.toHaveBeenCalled();
    expect(repository.insertMasteryRow).not.toHaveBeenCalled();
    expect(repository.updateMasteryRow).not.toHaveBeenCalled();
  });

  it("skips processing when no skill can be resolved for the question", async () => {
    const repository = buildRepository({
      getQuestionCurriculumMetadata: vi.fn(async () => null),
    });
    const service = new MasteryService(repository);

    const outcome = await service.processQuestionAttempt(baseParams());

    expect(outcome).toEqual({
      processed: false,
      reason: "no-resolvable-skill",
    });
    expect(repository.claimAttemptForMastery).not.toHaveBeenCalled();
  });

  it("retries on an insert race and succeeds as an update on the second pass", async () => {
    let getMasteryCalls = 0;
    const existingAfterRace = buildRecord({
      totalAttempts: 1,
      correctAttempts: 1,
    });
    const repository = buildRepository({
      getMasteryRow: vi.fn(async () => {
        getMasteryCalls += 1;
        return getMasteryCalls === 1 ? null : existingAfterRace;
      }),
      insertMasteryRow: vi.fn(async () => {
        throw new MasteryConcurrencyConflictError("race");
      }),
    });
    const service = new MasteryService(repository);

    const outcome = await service.processQuestionAttempt(baseParams());

    expect(outcome.processed).toBe(true);
    expect(repository.insertMasteryRow).toHaveBeenCalledTimes(1);
    expect(repository.updateMasteryRow).toHaveBeenCalledTimes(1);
  });

  it("retries on an update race and succeeds once the write no longer conflicts", async () => {
    const existing = buildRecord({ totalAttempts: 1, correctAttempts: 1 });
    let updateCalls = 0;
    const repository = buildRepository({
      getMasteryRow: vi.fn(async () => existing),
      updateMasteryRow: vi.fn(async (params: UpdateMasteryParams) => {
        updateCalls += 1;
        if (updateCalls === 1) {
          throw new MasteryConcurrencyConflictError("race");
        }
        return buildRecord({ id: params.id, ...params.state });
      }),
    });
    const service = new MasteryService(repository);

    const outcome = await service.processQuestionAttempt(baseParams());

    expect(outcome.processed).toBe(true);
    expect(updateCalls).toBe(2);
  });

  it("gives up after repeated conflicts, unclaims the attempt, and returns a soft error", async () => {
    const existing = buildRecord({ totalAttempts: 1, correctAttempts: 1 });
    const repository = buildRepository({
      getMasteryRow: vi.fn(async () => existing),
      updateMasteryRow: vi.fn(async () => {
        throw new MasteryConcurrencyConflictError("always races");
      }),
    });
    const service = new MasteryService(repository);

    const outcome = await service.processQuestionAttempt(baseParams());

    expect(outcome).toEqual({ processed: false, reason: "error" });
    expect(repository.unclaimAttempt).toHaveBeenCalledWith(ATTEMPT_ID);
  });

  it("never throws — an unexpected repository error is logged and returned as a soft outcome", async () => {
    const repository = buildRepository({
      getMasteryRow: vi.fn(async () => {
        throw new Error("database is on fire");
      }),
    });
    const service = new MasteryService(repository);

    const outcome = await service.processQuestionAttempt(baseParams());

    expect(outcome).toEqual({ processed: false, reason: "error" });
    expect(repository.unclaimAttempt).toHaveBeenCalledWith(ATTEMPT_ID);
  });

  it("keeps two learners' mastery fully isolated", async () => {
    const repository = buildRepository();
    const service = new MasteryService(repository);

    await service.processQuestionAttempt({
      ...baseParams(),
      learnerId: "learner-a",
    });
    await service.processQuestionAttempt({
      ...baseParams(),
      learnerId: "learner-b",
    });

    expect(repository.assertLearnerOwned).toHaveBeenNthCalledWith(
      1,
      "learner-a",
    );
    expect(repository.assertLearnerOwned).toHaveBeenNthCalledWith(
      2,
      "learner-b",
    );
    expect(repository.insertMasteryRow).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ learnerId: "learner-a" }),
    );
    expect(repository.insertMasteryRow).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ learnerId: "learner-b" }),
    );
  });
});
