import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MissionPlayer } from "@/modules/missions/mission-player.types";

const VALID_MISSION_ID = "123e4567-e89b-12d3-a456-426614174000";
const VALID_LEARNER_ID = "223e4567-e89b-12d3-a456-426614174000";

function mockAuthenticatedSupabase() {
  vi.doMock("@/lib/supabase/server", () => ({
    createClient: vi.fn(async () => ({
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: { id: "parent-1" } },
          error: null,
        })),
      },
    })),
  }));
}

function mockUnauthenticatedSupabase() {
  vi.doMock("@/lib/supabase/server", () => ({
    createClient: vi.fn(async () => ({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
      },
    })),
  }));
}

function mockLearnerName() {
  vi.doMock("@/modules/missions/mission-completion.repository", () => ({
    SupabaseMissionCompletionRepository: class {
      async getLearnerDisplayName() {
        return "Amelia";
      }
    },
  }));
}

function mockPlayerServiceThrows(error: unknown) {
  vi.doMock("@/modules/missions/mission-player.service", async () => {
    const actual = await vi.importActual<
      typeof import("@/modules/missions/mission-player.service")
    >("@/modules/missions/mission-player.service");
    return {
      ...actual,
      MissionPlayerService: class {
        getMissionForPlayer() {
          throw error;
        }
      },
    };
  });
}

function buildMission(): MissionPlayer {
  return {
    missionId: VALID_MISSION_ID,
    learnerId: VALID_LEARNER_ID,
    missionDate: "2026-07-20",
    status: "completed",
    estimatedMinutes: 20,
    completedAt: "2026-07-20T12:00:00.000Z",
    totalQuestions: 2,
    answeredCount: 2,
    correctCount: 1,
    questions: [
      {
        missionItemId: "item-1",
        questionId: "question-1",
        position: 1,
        subjectName: "Mathematics",
        subjectSlug: "mathematics",
        topicName: null,
        prompt: "What is 2 + 2?",
        options: [
          { id: "a", label: "3" },
          { id: "b", label: "4" },
        ],
        attempt: {
          attemptId: "attempt-1",
          selectedOptionId: "a",
          correctOptionId: "b",
          isCorrect: false,
          explanation: "Add the two numbers together.",
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
        options: [
          { id: "c", label: "Joyful" },
          { id: "d", label: "Sad" },
        ],
        attempt: {
          attemptId: "attempt-1",
          selectedOptionId: "c",
          correctOptionId: "c",
          isCorrect: true,
          explanation: "Joyful means happy.",
          responseMs: 900,
        },
      },
    ],
  };
}

function mockPlayerServiceReturns(mission: MissionPlayer) {
  vi.doMock("@/modules/missions/mission-player.service", async () => {
    const actual = await vi.importActual<
      typeof import("@/modules/missions/mission-player.service")
    >("@/modules/missions/mission-player.service");
    return {
      ...actual,
      MissionPlayerService: class {
        async getMissionForPlayer() {
          return mission;
        }
      },
    };
  });
}

beforeEach(() => {
  vi.resetModules();
});

describe.each([
  ["summary", "@/app/api/missions/[missionId]/summary/route"],
  ["review", "@/app/api/missions/[missionId]/review/route"],
])("GET /api/missions/[missionId]/%s", (_name, modulePath) => {
  it("returns 400 for an invalid mission id", async () => {
    mockAuthenticatedSupabase();
    const { GET } = await import(modulePath);
    const response = await GET(
      new Request(
        `http://localhost/api/missions/not-a-uuid/x?learner=${VALID_LEARNER_ID}`,
      ),
      { params: Promise.resolve({ missionId: "not-a-uuid" }) },
    );
    expect(response.status).toBe(400);
  });

  it("returns 400 for a missing learner id", async () => {
    mockAuthenticatedSupabase();
    const { GET } = await import(modulePath);
    const response = await GET(
      new Request(`http://localhost/api/missions/${VALID_MISSION_ID}/x`),
      { params: Promise.resolve({ missionId: VALID_MISSION_ID }) },
    );
    expect(response.status).toBe(400);
  });

  it("returns 401 when unauthenticated", async () => {
    mockUnauthenticatedSupabase();
    const { GET } = await import(modulePath);
    const response = await GET(
      new Request(
        `http://localhost/api/missions/${VALID_MISSION_ID}/x?learner=${VALID_LEARNER_ID}`,
      ),
      { params: Promise.resolve({ missionId: VALID_MISSION_ID }) },
    );
    expect(response.status).toBe(401);
  });

  it("returns 403 when the learner is not owned by the caller", async () => {
    mockAuthenticatedSupabase();
    mockLearnerName();
    const { MissionAccessError } =
      await import("@/modules/missions/mission.repository");
    mockPlayerServiceThrows(
      new MissionAccessError("Learner is not owned by the current user"),
    );
    const { GET } = await import(modulePath);
    const response = await GET(
      new Request(
        `http://localhost/api/missions/${VALID_MISSION_ID}/x?learner=${VALID_LEARNER_ID}`,
      ),
      { params: Promise.resolve({ missionId: VALID_MISSION_ID }) },
    );
    expect(response.status).toBe(403);
  });

  it("returns 404 when the mission does not belong to the learner", async () => {
    mockAuthenticatedSupabase();
    mockLearnerName();
    const { MissionNotFoundError } =
      await import("@/modules/missions/mission.repository");
    mockPlayerServiceThrows(new MissionNotFoundError("Mission not found"));
    const { GET } = await import(modulePath);
    const response = await GET(
      new Request(
        `http://localhost/api/missions/${VALID_MISSION_ID}/x?learner=${VALID_LEARNER_ID}`,
      ),
      { params: Promise.resolve({ missionId: VALID_MISSION_ID }) },
    );
    expect(response.status).toBe(404);
  });

  it("returns 200 with data for a legitimately owned mission", async () => {
    mockAuthenticatedSupabase();
    mockLearnerName();
    mockPlayerServiceReturns(buildMission());
    const { GET } = await import(modulePath);
    const response = await GET(
      new Request(
        `http://localhost/api/missions/${VALID_MISSION_ID}/x?learner=${VALID_LEARNER_ID}`,
      ),
      { params: Promise.resolve({ missionId: VALID_MISSION_ID }) },
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.learnerName).toBe("Amelia");
  });
});

describe("GET /api/missions/[missionId]/review", () => {
  it("does not expose correct-answer data for unanswered questions", async () => {
    mockAuthenticatedSupabase();
    mockLearnerName();
    const mission = buildMission();
    mission.questions.push({
      missionItemId: "item-3",
      questionId: "question-3",
      position: 3,
      subjectName: "Verbal Reasoning",
      subjectSlug: "verbal-reasoning",
      topicName: null,
      prompt: "Unanswered question",
      options: [
        { id: "e", label: "Option E" },
        { id: "f", label: "Option F" },
      ],
      attempt: null,
    });
    mockPlayerServiceReturns(mission);

    const { GET } = await import("@/app/api/missions/[missionId]/review/route");
    const response = await GET(
      new Request(
        `http://localhost/api/missions/${VALID_MISSION_ID}/review?learner=${VALID_LEARNER_ID}`,
      ),
      { params: Promise.resolve({ missionId: VALID_MISSION_ID }) },
    );
    const body = await response.json();

    expect(
      body.mistakes.some(
        (m: { missionItemId: string }) => m.missionItemId === "item-3",
      ),
    ).toBe(false);
  });

  it("reports a perfect score with no mistakes when everything answered is correct", async () => {
    mockAuthenticatedSupabase();
    mockLearnerName();
    const mission = buildMission();
    mission.questions[0]!.attempt = {
      attemptId: "attempt-1",
      selectedOptionId: "b",
      correctOptionId: "b",
      isCorrect: true,
      explanation: "Add the two numbers together.",
      responseMs: 1000,
    };
    mockPlayerServiceReturns(mission);

    const { GET } = await import("@/app/api/missions/[missionId]/review/route");
    const response = await GET(
      new Request(
        `http://localhost/api/missions/${VALID_MISSION_ID}/review?learner=${VALID_LEARNER_ID}`,
      ),
      { params: Promise.resolve({ missionId: VALID_MISSION_ID }) },
    );
    const body = await response.json();

    expect(body.mistakes).toEqual([]);
    expect(body.isPerfectScore).toBe(true);
  });
});
