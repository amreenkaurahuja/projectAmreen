import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/missions/today/route";

describe("missions today route", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns 400 for an invalid learner id", async () => {
    const request = new Request(
      "http://localhost/api/missions/today?learner=invalid",
    );
    const response = await GET(request, { params: Promise.resolve({}) });

    expect(response.status).toBe(400);
  });

  it("returns 401 when the user is unauthenticated", async () => {
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: vi.fn(async () => ({
        auth: {
          getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
        },
      })),
    }));

    const request = new Request(
      "http://localhost/api/missions/today?learner=123e4567-e89b-12d3-a456-426614174000",
    );
    const { GET: mockedGet } = await import("@/app/api/missions/today/route");
    const response = await mockedGet(request, { params: Promise.resolve({}) });

    expect(response.status).toBe(401);
  });

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

  const validLearnerRequest = () =>
    new Request(
      "http://localhost/api/missions/today?learner=123e4567-e89b-12d3-a456-426614174000",
    );

  it("returns 200 with the mission on success", async () => {
    mockAuthenticatedSupabase();
    vi.doMock(
      "@/modules/adaptive-learning/adaptive-mission.service",
      async () => {
        const actual = await vi.importActual<
          typeof import("@/modules/adaptive-learning/adaptive-mission.service")
        >("@/modules/adaptive-learning/adaptive-mission.service");
        return {
          ...actual,
          AdaptiveMissionService: class {
            async getOrCreateTodaysMission() {
              return { missionId: "mission-1", questionCount: 16 };
            }
          },
        };
      },
    );

    const { GET: mockedGet } = await import("@/app/api/missions/today/route");
    const response = await mockedGet(validLearnerRequest(), {
      params: Promise.resolve({}),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      missionId: "mission-1",
      questionCount: 16,
    });
  });

  it("returns 403 when the learner is not owned", async () => {
    mockAuthenticatedSupabase();
    vi.doMock(
      "@/modules/adaptive-learning/adaptive-mission.service",
      async () => {
        const actual = await vi.importActual<
          typeof import("@/modules/adaptive-learning/adaptive-mission.service")
        >("@/modules/adaptive-learning/adaptive-mission.service");
        const { MissionAccessError } =
          await import("@/modules/missions/mission.repository");
        return {
          ...actual,
          AdaptiveMissionService: class {
            getOrCreateTodaysMission() {
              throw new MissionAccessError(
                "Learner is not owned by the current user",
              );
            }
          },
        };
      },
    );

    const { GET: mockedGet } = await import("@/app/api/missions/today/route");
    const response = await mockedGet(validLearnerRequest(), {
      params: Promise.resolve({}),
    });

    expect(response.status).toBe(403);
  });

  it("returns 409 when the question bank has too few active questions", async () => {
    mockAuthenticatedSupabase();
    vi.doMock(
      "@/modules/adaptive-learning/adaptive-mission.service",
      async () => {
        const actual = await vi.importActual<
          typeof import("@/modules/adaptive-learning/adaptive-mission.service")
        >("@/modules/adaptive-learning/adaptive-mission.service");
        const { MissionQuestionBankError } =
          await import("@/modules/missions/mission.repository");
        return {
          ...actual,
          AdaptiveMissionService: class {
            getOrCreateTodaysMission() {
              throw new MissionQuestionBankError("Not enough questions");
            }
          },
        };
      },
    );

    const { GET: mockedGet } = await import("@/app/api/missions/today/route");
    const response = await mockedGet(validLearnerRequest(), {
      params: Promise.resolve({}),
    });

    expect(response.status).toBe(409);
  });

  it("returns 409 on a mission creation race", async () => {
    mockAuthenticatedSupabase();
    vi.doMock(
      "@/modules/adaptive-learning/adaptive-mission.service",
      async () => {
        const actual = await vi.importActual<
          typeof import("@/modules/adaptive-learning/adaptive-mission.service")
        >("@/modules/adaptive-learning/adaptive-mission.service");
        const { MissionDuplicateError } =
          await import("@/modules/missions/mission.repository");
        return {
          ...actual,
          AdaptiveMissionService: class {
            getOrCreateTodaysMission() {
              throw new MissionDuplicateError("Mission already exists");
            }
          },
        };
      },
    );

    const { GET: mockedGet } = await import("@/app/api/missions/today/route");
    const response = await mockedGet(validLearnerRequest(), {
      params: Promise.resolve({}),
    });

    expect(response.status).toBe(409);
  });

  it("returns 500 and reports to Sentry for an unexpected error", async () => {
    mockAuthenticatedSupabase();
    vi.doMock(
      "@/modules/adaptive-learning/adaptive-mission.service",
      async () => {
        const actual = await vi.importActual<
          typeof import("@/modules/adaptive-learning/adaptive-mission.service")
        >("@/modules/adaptive-learning/adaptive-mission.service");
        return {
          ...actual,
          AdaptiveMissionService: class {
            getOrCreateTodaysMission() {
              throw new Error("boom");
            }
          },
        };
      },
    );

    const { GET: mockedGet } = await import("@/app/api/missions/today/route");
    const response = await mockedGet(validLearnerRequest(), {
      params: Promise.resolve({}),
    });

    expect(response.status).toBe(500);
  });
});
