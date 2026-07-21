import { describe, expect, it } from "vitest";
import { MissionPlayerService } from "@/modules/missions/mission-player.service";
import type {
  MissionItemForGrading,
  MissionPlayerRepository,
  MissionRecord,
} from "@/modules/missions/mission-player.repository";
import { MasteryService } from "@/modules/learning-profile/mastery.service";
import type {
  InsertMasteryParams,
  MasteryRepository,
  UpdateMasteryParams,
} from "@/modules/learning-profile/mastery.repository";
import type {
  LearnerSkillMasteryRecord,
  SkillCurriculumMetadata,
} from "@/modules/learning-profile/mastery.types";

// End-to-end coverage across the mission-player <-> learning-profile
// boundary: a *real* MasteryService (not a stub) driven by a *real*
// MissionPlayerService, both backed by hand-built in-memory fakes. This
// exercises the actual glue between submitAnswer() and
// processQuestionAttempt() that the per-module unit tests (mocking the
// other side) can't catch.

interface FakeQuestion {
  questionId: string;
  skillId: string;
  subjectId: string;
  topicId: string | null;
  difficulty: number;
  correctOptionId: string;
  wrongOptionId: string;
}

function buildFakeMissionRepository(options: {
  learnerId: string;
  missionId: string;
  items: Array<{ missionItemId: string; question: FakeQuestion }>;
  ownedLearnerIds: Set<string>;
}): MissionPlayerRepository {
  const attempts = new Map<
    string,
    {
      questionId: string;
      optionId: string;
      isCorrect: boolean;
      responseMs: number;
    }
  >();
  let attemptCounter = 0;

  return {
    getAuthenticatedUserId: async () => "parent-1",
    assertLearnerOwned: async (learnerId: string) => {
      if (!options.ownedLearnerIds.has(learnerId)) {
        const { MissionAccessError } =
          await import("@/modules/missions/mission.repository");
        throw new MissionAccessError(
          "Learner is not owned by the current user",
        );
      }
    },
    getMissionRecord: async (
      missionId,
      learnerId,
    ): Promise<MissionRecord | null> => {
      if (missionId !== options.missionId || learnerId !== options.learnerId) {
        return null;
      }
      return {
        missionId: options.missionId,
        learnerId: options.learnerId,
        missionDate: "2026-07-21",
        status: "in_progress",
        estimatedMinutes: 20,
        completedAt: null,
      };
    },
    getMissionItems: async () => [],
    getMissionItemForGrading: async (
      missionId,
      missionItemId,
    ): Promise<MissionItemForGrading | null> => {
      if (missionId !== options.missionId) return null;
      const item = options.items.find((i) => i.missionItemId === missionItemId);
      if (!item) return null;
      return {
        missionItemId: item.missionItemId,
        questionId: item.question.questionId,
        explanation: "Explanation",
        options: [
          { id: item.question.correctOptionId, isCorrect: true },
          { id: item.question.wrongOptionId, isCorrect: false },
        ],
      };
    },
    upsertAttempt: async (params) => {
      attemptCounter += 1;
      const attemptId = `attempt-${options.missionId}-${params.missionItemId}-${attemptCounter}`;
      attempts.set(params.missionItemId, {
        questionId: params.questionId,
        optionId: params.optionId,
        isCorrect: params.isCorrect,
        responseMs: params.responseMs,
      });
      return { attemptId, answeredAt: "2026-07-21T00:00:00.000Z" };
    },
    countAttempts: async () => ({
      answeredCount: attempts.size,
      correctCount: [...attempts.values()].filter((a) => a.isCorrect).length,
      totalQuestions: options.items.length,
    }),
    updateMissionStatus: async () => undefined,
  };
}

function buildFakeMasteryRepository(options: {
  ownedLearnerIds: Set<string>;
  questionsBySkill: Map<string, SkillCurriculumMetadata>;
}): {
  repository: MasteryRepository;
  store: Map<string, LearnerSkillMasteryRecord>;
} {
  const store = new Map<string, LearnerSkillMasteryRecord>();
  const claimedAttempts = new Set<string>();
  let idCounter = 0;

  const key = (learnerId: string, skillId: string) => `${learnerId}:${skillId}`;

  const repository: MasteryRepository = {
    getAuthenticatedUserId: async () => "parent-1",
    assertLearnerOwned: async (learnerId: string) => {
      if (!options.ownedLearnerIds.has(learnerId)) {
        const { MasteryAccessError } =
          await import("@/modules/learning-profile/mastery.repository");
        throw new MasteryAccessError(
          "Learner is not owned by the current user",
        );
      }
    },
    getQuestionCurriculumMetadata: async (questionId: string) =>
      options.questionsBySkill.get(questionId) ?? null,
    claimAttemptForMastery: async (attemptId: string) => {
      if (claimedAttempts.has(attemptId)) return false;
      claimedAttempts.add(attemptId);
      return true;
    },
    unclaimAttempt: async (attemptId: string) => {
      claimedAttempts.delete(attemptId);
    },
    getMasteryRow: async (learnerId: string, skillId: string) =>
      store.get(key(learnerId, skillId)) ?? null,
    insertMasteryRow: async (params: InsertMasteryParams) => {
      idCounter += 1;
      const record: LearnerSkillMasteryRecord = {
        id: `mastery-${idCounter}`,
        learnerId: params.learnerId,
        skillId: params.skillId,
        subjectId: params.subjectId,
        topicId: params.topicId,
        ...params.state,
        updatedAt: new Date().toISOString(),
      };
      store.set(key(params.learnerId, params.skillId), record);
      return record;
    },
    updateMasteryRow: async (params: UpdateMasteryParams) => {
      const existingEntry = [...store.entries()].find(
        ([, value]) => value.id === params.id,
      );
      if (!existingEntry) throw new Error("mastery row not found");
      const [mapKey, existing] = existingEntry;
      const updated: LearnerSkillMasteryRecord = {
        ...existing,
        ...params.state,
        updatedAt: new Date().toISOString(),
      };
      store.set(mapKey, updated);
      return updated;
    },
    getAllMasteryForLearner: async (learnerId: string) =>
      [...store.values()].filter((r) => r.learnerId === learnerId),
    getAllMasteryForLearnerEnriched: async (learnerId: string) =>
      [...store.values()]
        .filter((r) => r.learnerId === learnerId)
        .map((r) => ({ ...r, skillName: "Skill", subjectName: "Subject" })),
  };

  return { repository, store };
}

describe("MissionPlayerService + MasteryService integration", () => {
  const LEARNER_A = "learner-a";
  const LEARNER_B = "learner-b";
  const SKILL_ADDITION: SkillCurriculumMetadata = {
    skillId: "skill-addition",
    subjectId: "subject-maths",
    topicId: "topic-arithmetic",
    difficulty: 3,
  };

  function setup(ownedLearnerIds: string[]) {
    const questionsBySkill = new Map<string, SkillCurriculumMetadata>([
      ["question-1", SKILL_ADDITION],
      ["question-2", SKILL_ADDITION],
    ]);
    const owned = new Set(ownedLearnerIds);
    const mastery = buildFakeMasteryRepository({
      ownedLearnerIds: owned,
      questionsBySkill,
    });
    const masteryService = new MasteryService(mastery.repository);

    function buildMissionService(learnerId: string, missionId: string) {
      const missionRepository = buildFakeMissionRepository({
        learnerId,
        missionId,
        items: [
          {
            missionItemId: "item-1",
            question: {
              questionId: "question-1",
              skillId: SKILL_ADDITION.skillId,
              subjectId: SKILL_ADDITION.subjectId,
              topicId: SKILL_ADDITION.topicId,
              difficulty: 3,
              correctOptionId: "correct",
              wrongOptionId: "wrong",
            },
          },
          {
            missionItemId: "item-2",
            question: {
              questionId: "question-2",
              skillId: SKILL_ADDITION.skillId,
              subjectId: SKILL_ADDITION.subjectId,
              topicId: SKILL_ADDITION.topicId,
              difficulty: 3,
              correctOptionId: "correct",
              wrongOptionId: "wrong",
            },
          },
        ],
        ownedLearnerIds: owned,
      });
      return new MissionPlayerService(missionRepository, masteryService);
    }

    return { buildMissionService, masteryStore: mastery.store };
  }

  it("creates a mastery row the first time a learner answers a question for a skill", async () => {
    const { buildMissionService, masteryStore } = setup([LEARNER_A]);
    const service = buildMissionService(LEARNER_A, "mission-1");

    await service.submitAnswer({
      learnerId: LEARNER_A,
      missionId: "mission-1",
      missionItemId: "item-1",
      optionId: "correct",
      responseMs: 5_000,
    });

    const record = masteryStore.get(`${LEARNER_A}:${SKILL_ADDITION.skillId}`);
    expect(record).toBeDefined();
    expect(record?.totalAttempts).toBe(1);
    expect(record?.correctAttempts).toBe(1);
  });

  it("updates the existing mastery row when the same learner answers another question for the same skill", async () => {
    const { buildMissionService, masteryStore } = setup([LEARNER_A]);
    const service = buildMissionService(LEARNER_A, "mission-1");

    await service.submitAnswer({
      learnerId: LEARNER_A,
      missionId: "mission-1",
      missionItemId: "item-1",
      optionId: "correct",
      responseMs: 5_000,
    });
    await service.submitAnswer({
      learnerId: LEARNER_A,
      missionId: "mission-1",
      missionItemId: "item-2",
      optionId: "wrong",
      responseMs: 8_000,
    });

    const record = masteryStore.get(`${LEARNER_A}:${SKILL_ADDITION.skillId}`);
    expect(record?.totalAttempts).toBe(2);
    expect(record?.correctAttempts).toBe(1);
    expect(record?.incorrectAttempts).toBe(1);
  });

  it("keeps two learners' mastery for the same skill fully isolated", async () => {
    const { buildMissionService, masteryStore } = setup([LEARNER_A, LEARNER_B]);
    const serviceA = buildMissionService(LEARNER_A, "mission-a");
    const serviceB = buildMissionService(LEARNER_B, "mission-b");

    await serviceA.submitAnswer({
      learnerId: LEARNER_A,
      missionId: "mission-a",
      missionItemId: "item-1",
      optionId: "correct",
      responseMs: 5_000,
    });
    await serviceB.submitAnswer({
      learnerId: LEARNER_B,
      missionId: "mission-b",
      missionItemId: "item-1",
      optionId: "wrong",
      responseMs: 5_000,
    });

    const recordA = masteryStore.get(`${LEARNER_A}:${SKILL_ADDITION.skillId}`);
    const recordB = masteryStore.get(`${LEARNER_B}:${SKILL_ADDITION.skillId}`);
    expect(recordA?.totalAttempts).toBe(1);
    expect(recordA?.correctAttempts).toBe(1);
    expect(recordB?.totalAttempts).toBe(1);
    expect(recordB?.correctAttempts).toBe(0);
  });

  it("does not fail the answer submission when the learner cannot be verified for mastery purposes", async () => {
    // The learner is owned for mission purposes but not registered in the
    // mastery repository's owned set — simulates a bug/edge case in the
    // mastery layer specifically. The answer must still be graded and saved.
    const { masteryStore } = setup([]);
    const missionRepository = buildFakeMissionRepository({
      learnerId: LEARNER_A,
      missionId: "mission-1",
      items: [
        {
          missionItemId: "item-1",
          question: {
            questionId: "question-1",
            skillId: SKILL_ADDITION.skillId,
            subjectId: SKILL_ADDITION.subjectId,
            topicId: SKILL_ADDITION.topicId,
            difficulty: 3,
            correctOptionId: "correct",
            wrongOptionId: "wrong",
          },
        },
      ],
      ownedLearnerIds: new Set([LEARNER_A]),
    });
    const { repository } = buildFakeMasteryRepository({
      ownedLearnerIds: new Set(),
      questionsBySkill: new Map([["question-1", SKILL_ADDITION]]),
    });
    const service = new MissionPlayerService(
      missionRepository,
      new MasteryService(repository),
    );

    const result = await service.submitAnswer({
      learnerId: LEARNER_A,
      missionId: "mission-1",
      missionItemId: "item-1",
      optionId: "correct",
      responseMs: 5_000,
    });

    expect(result.isCorrect).toBe(true);
    expect(masteryStore.size).toBe(0);
  });
});
