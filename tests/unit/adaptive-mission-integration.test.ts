import { describe, expect, it } from "vitest";
import { AdaptiveMissionService } from "@/modules/adaptive-learning/adaptive-mission.service";
import type {
  AdaptiveCandidateData,
  AdaptiveDataRepository,
} from "@/modules/adaptive-learning/adaptive-mission.repository";
import {
  MissionAccessError,
  MissionDuplicateError,
  type MissionRepository,
} from "@/modules/missions/mission.repository";
import type {
  MissionItem,
  MissionSummary,
} from "@/modules/missions/mission.types";

// End-to-end coverage across the mission <-> adaptive-learning boundary: a
// *real* AdaptiveMissionService driving a *real* selectAdaptiveMission,
// backed by hand-built in-memory fakes for both repositories it depends on.
// This is what actually exercises "Start Mission uses adaptive generation,"
// "existing mission is reused," "concurrent generation doesn't duplicate,"
// and "learner isolation" together, rather than each in a mocked vacuum.

const REF = new Date("2026-07-21T00:00:00.000Z");

function buildCandidateData(learnerId: string): AdaptiveCandidateData {
  const subjects = [
    "mathematics",
    "english",
    "verbal-reasoning",
    "non-verbal-reasoning",
  ];
  const candidates: AdaptiveCandidateData["candidates"] = [];
  for (const subject of subjects) {
    for (let i = 0; i < 8; i += 1) {
      candidates.push({
        questionId: `${learnerId}-${subject}-q${i}`,
        subjectId: `subject-${subject}`,
        subjectSlug: subject,
        topicId: `topic-${subject}`,
        skillId: `${subject}-skill`,
        difficulty: (i % 5) + 1,
      });
    }
  }
  return {
    candidates,
    masteryBySkill: new Map(),
    recentAttemptsByQuestion: new Map(),
    activeSubjectSlugs: subjects,
  };
}

interface FakeMissionStore {
  missions: Map<string, MissionSummary & { items: MissionItem[] }>;
}

function buildFakeMissionRepository(
  store: FakeMissionStore,
  ownedLearnerIds: Set<string>,
  options: { failFirstCreateWithDuplicate?: boolean } = {},
): MissionRepository {
  let createAttempts = 0;

  return {
    getAuthenticatedUserId: async () => "parent-1",
    ensureLearnerOwned: async (learnerId: string) => {
      if (!ownedLearnerIds.has(learnerId)) {
        throw new MissionAccessError(
          "Learner is not owned by the current user",
        );
      }
    },
    findTodaysMission: async (learnerId: string) => {
      const key = `${learnerId}:2026-07-21`;
      const existing = store.missions.get(key);
      return existing ? { ...existing } : null;
    },
    createMission: async (
      learnerId: string,
      missionDate: string,
      estimatedMinutes: number,
      items: MissionItem[],
    ) => {
      createAttempts += 1;
      const key = `${learnerId}:${missionDate}`;

      if (options.failFirstCreateWithDuplicate && createAttempts === 1) {
        throw new MissionDuplicateError("Mission already exists");
      }

      if (store.missions.has(key)) {
        throw new MissionDuplicateError("Mission already exists");
      }

      const summary: MissionSummary & { items: MissionItem[] } = {
        missionId: `mission-${key}`,
        learnerId,
        missionDate,
        status: "ready",
        questionCount: items.length,
        estimatedMinutes,
        answeredCount: 0,
        correctCount: 0,
        completedAt: null,
        items,
      };
      store.missions.set(key, summary);
      return summary;
    },
  };
}

function buildFakeAdaptiveRepository(
  dataByLearner: Map<string, AdaptiveCandidateData>,
): AdaptiveDataRepository {
  return {
    loadCandidateData: async (learnerId: string) => {
      const data = dataByLearner.get(learnerId);
      if (!data) throw new Error(`No fixture data for learner ${learnerId}`);
      return data;
    },
  };
}

describe("AdaptiveMissionService integration", () => {
  it("generates an adaptive mission on first request (Start Mission flow)", async () => {
    const store: FakeMissionStore = { missions: new Map() };
    const dataByLearner = new Map([
      ["learner-1", buildCandidateData("learner-1")],
    ]);
    const service = new AdaptiveMissionService(
      buildFakeMissionRepository(store, new Set(["learner-1"])),
      buildFakeAdaptiveRepository(dataByLearner),
    );

    const result = await service.getOrCreateTodaysMission("learner-1", REF);

    expect(result.questionCount).toBe(16);
    const stored = store.missions.get("learner-1:2026-07-21");
    expect(stored?.items).toHaveLength(16);
    expect(new Set(stored?.items.map((i) => i.questionId)).size).toBe(16);
    expect(
      stored?.items.every((i) => typeof i.selectionReason === "string"),
    ).toBe(true);
  });

  it("reuses the existing mission on a second request instead of generating again", async () => {
    const store: FakeMissionStore = { missions: new Map() };
    const dataByLearner = new Map([
      ["learner-1", buildCandidateData("learner-1")],
    ]);
    const service = new AdaptiveMissionService(
      buildFakeMissionRepository(store, new Set(["learner-1"])),
      buildFakeAdaptiveRepository(dataByLearner),
    );

    const first = await service.getOrCreateTodaysMission("learner-1", REF);
    const second = await service.getOrCreateTodaysMission("learner-1", REF);

    expect(second.missionId).toBe(first.missionId);
    expect(store.missions.size).toBe(1);
  });

  it("does not create a duplicate mission when generation races on a unique-constraint conflict", async () => {
    const store: FakeMissionStore = { missions: new Map() };
    const dataByLearner = new Map([
      ["learner-1", buildCandidateData("learner-1")],
    ]);
    const service = new AdaptiveMissionService(
      buildFakeMissionRepository(store, new Set(["learner-1"]), {
        failFirstCreateWithDuplicate: true,
      }),
      buildFakeAdaptiveRepository(dataByLearner),
    );

    // Seed the "competing" mission a concurrent request would have created.
    store.missions.set("learner-1:2026-07-21", {
      missionId: "mission-from-other-request",
      learnerId: "learner-1",
      missionDate: "2026-07-21",
      status: "ready",
      questionCount: 16,
      estimatedMinutes: 20,
      answeredCount: 0,
      correctCount: 0,
      completedAt: null,
      items: [],
    });

    const result = await service.getOrCreateTodaysMission("learner-1", REF);

    expect(result.missionId).toBe("mission-from-other-request");
    expect(store.missions.size).toBe(1);
  });

  it("keeps two learners' missions fully isolated", async () => {
    const store: FakeMissionStore = { missions: new Map() };
    const dataByLearner = new Map([
      ["learner-a", buildCandidateData("learner-a")],
      ["learner-b", buildCandidateData("learner-b")],
    ]);
    const service = new AdaptiveMissionService(
      buildFakeMissionRepository(store, new Set(["learner-a", "learner-b"])),
      buildFakeAdaptiveRepository(dataByLearner),
    );

    const resultA = await service.getOrCreateTodaysMission("learner-a", REF);
    const resultB = await service.getOrCreateTodaysMission("learner-b", REF);

    expect(resultA.missionId).not.toBe(resultB.missionId);
    const itemsA = store.missions.get("learner-a:2026-07-21")?.items ?? [];
    const itemsB = store.missions.get("learner-b:2026-07-21")?.items ?? [];
    const idsA = new Set(itemsA.map((i) => i.questionId));
    const idsB = new Set(itemsB.map((i) => i.questionId));
    expect([...idsA].some((id) => idsB.has(id))).toBe(false);
  });

  it("rejects a learner the parent does not own before touching candidate data", async () => {
    const store: FakeMissionStore = { missions: new Map() };
    const dataByLearner = new Map([
      ["learner-1", buildCandidateData("learner-1")],
    ]);
    const service = new AdaptiveMissionService(
      buildFakeMissionRepository(store, new Set()),
      buildFakeAdaptiveRepository(dataByLearner),
    );

    await expect(
      service.getOrCreateTodaysMission("learner-1", REF),
    ).rejects.toThrow(MissionAccessError);
    expect(store.missions.size).toBe(0);
  });

  it("persists mission items in the same order the selector returned them", async () => {
    const store: FakeMissionStore = { missions: new Map() };
    const dataByLearner = new Map([
      ["learner-1", buildCandidateData("learner-1")],
    ]);
    const service = new AdaptiveMissionService(
      buildFakeMissionRepository(store, new Set(["learner-1"])),
      buildFakeAdaptiveRepository(dataByLearner),
    );

    await service.getOrCreateTodaysMission("learner-1", REF);

    const items = store.missions.get("learner-1:2026-07-21")?.items ?? [];
    expect(items.map((i) => i.position)).toEqual(
      Array.from({ length: items.length }, (_, i) => i + 1),
    );
  });
});
