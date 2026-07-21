import { beforeEach, describe, expect, it, vi } from "vitest";

const VALID_MISSION_ID = "123e4567-e89b-12d3-a456-426614174000";
const VALID_LEARNER_ID = "223e4567-e89b-12d3-a456-426614174000";
const VALID_ITEM_ID = "323e4567-e89b-12d3-a456-426614174000";
const VALID_OPTION_ID = "423e4567-e89b-12d3-a456-426614174000";

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

beforeEach(() => {
  vi.resetModules();
});

describe("GET /api/missions/[missionId]", () => {
  it("returns 400 for an invalid mission id", async () => {
    mockAuthenticatedSupabase();
    const { GET } = await import("@/app/api/missions/[missionId]/route");
    const response = await GET(
      new Request(
        `http://localhost/api/missions/not-a-uuid?learner=${VALID_LEARNER_ID}`,
      ),
      { params: Promise.resolve({ missionId: "not-a-uuid" }) },
    );
    expect(response.status).toBe(400);
  });

  it("returns 400 for a missing learner id", async () => {
    mockAuthenticatedSupabase();
    const { GET } = await import("@/app/api/missions/[missionId]/route");
    const response = await GET(
      new Request(`http://localhost/api/missions/${VALID_MISSION_ID}`),
      { params: Promise.resolve({ missionId: VALID_MISSION_ID }) },
    );
    expect(response.status).toBe(400);
  });

  it("returns 401 when unauthenticated", async () => {
    mockUnauthenticatedSupabase();
    const { GET } = await import("@/app/api/missions/[missionId]/route");
    const response = await GET(
      new Request(
        `http://localhost/api/missions/${VALID_MISSION_ID}?learner=${VALID_LEARNER_ID}`,
      ),
      { params: Promise.resolve({ missionId: VALID_MISSION_ID }) },
    );
    expect(response.status).toBe(401);
  });

  it("returns 403 when another parent's learner is requested", async () => {
    mockAuthenticatedSupabase();
    vi.doMock("@/modules/missions/mission-player.service", async () => {
      const actual = await vi.importActual<
        typeof import("@/modules/missions/mission-player.service")
      >("@/modules/missions/mission-player.service");
      const { MissionAccessError } =
        await import("@/modules/missions/mission.repository");
      return {
        ...actual,
        MissionPlayerService: class {
          getMissionForPlayer() {
            throw new MissionAccessError(
              "Learner is not owned by the current user",
            );
          }
        },
      };
    });
    const { GET } = await import("@/app/api/missions/[missionId]/route");
    const response = await GET(
      new Request(
        `http://localhost/api/missions/${VALID_MISSION_ID}?learner=${VALID_LEARNER_ID}`,
      ),
      { params: Promise.resolve({ missionId: VALID_MISSION_ID }) },
    );
    expect(response.status).toBe(403);
  });

  it("returns 404 when the mission cannot be found for the learner", async () => {
    mockAuthenticatedSupabase();
    vi.doMock("@/modules/missions/mission-player.service", async () => {
      const actual = await vi.importActual<
        typeof import("@/modules/missions/mission-player.service")
      >("@/modules/missions/mission-player.service");
      const { MissionNotFoundError } =
        await import("@/modules/missions/mission.repository");
      return {
        ...actual,
        MissionPlayerService: class {
          getMissionForPlayer() {
            throw new MissionNotFoundError("Mission not found");
          }
        },
      };
    });
    const { GET } = await import("@/app/api/missions/[missionId]/route");
    const response = await GET(
      new Request(
        `http://localhost/api/missions/${VALID_MISSION_ID}?learner=${VALID_LEARNER_ID}`,
      ),
      { params: Promise.resolve({ missionId: VALID_MISSION_ID }) },
    );
    expect(response.status).toBe(404);
  });
});

describe("POST /api/missions/[missionId]/attempts", () => {
  function validBody() {
    return {
      learnerId: VALID_LEARNER_ID,
      missionItemId: VALID_ITEM_ID,
      optionId: VALID_OPTION_ID,
      responseMs: 1500,
    };
  }

  it("returns 400 for an invalid mission id", async () => {
    mockAuthenticatedSupabase();
    const { POST } =
      await import("@/app/api/missions/[missionId]/attempts/route");
    const response = await POST(
      new Request("http://localhost/api/missions/not-a-uuid/attempts", {
        method: "POST",
        body: JSON.stringify(validBody()),
      }),
      { params: Promise.resolve({ missionId: "not-a-uuid" }) },
    );
    expect(response.status).toBe(400);
  });

  it("returns 400 for an invalid request body", async () => {
    mockAuthenticatedSupabase();
    const { POST } =
      await import("@/app/api/missions/[missionId]/attempts/route");
    const response = await POST(
      new Request(
        `http://localhost/api/missions/${VALID_MISSION_ID}/attempts`,
        {
          method: "POST",
          body: JSON.stringify({ learnerId: "not-a-uuid" }),
        },
      ),
      { params: Promise.resolve({ missionId: VALID_MISSION_ID }) },
    );
    expect(response.status).toBe(400);
  });

  it("returns 401 when unauthenticated", async () => {
    mockUnauthenticatedSupabase();
    const { POST } =
      await import("@/app/api/missions/[missionId]/attempts/route");
    const response = await POST(
      new Request(
        `http://localhost/api/missions/${VALID_MISSION_ID}/attempts`,
        {
          method: "POST",
          body: JSON.stringify(validBody()),
        },
      ),
      { params: Promise.resolve({ missionId: VALID_MISSION_ID }) },
    );
    expect(response.status).toBe(401);
  });

  it("returns 404 when the mission item belongs to a different mission", async () => {
    mockAuthenticatedSupabase();
    vi.doMock("@/modules/missions/mission-player.service", async () => {
      const actual = await vi.importActual<
        typeof import("@/modules/missions/mission-player.service")
      >("@/modules/missions/mission-player.service");
      const { MissionNotFoundError } =
        await import("@/modules/missions/mission.repository");
      return {
        ...actual,
        MissionPlayerService: class {
          submitAnswer() {
            throw new MissionNotFoundError("Mission item not found");
          }
        },
      };
    });
    const { POST } =
      await import("@/app/api/missions/[missionId]/attempts/route");
    const response = await POST(
      new Request(
        `http://localhost/api/missions/${VALID_MISSION_ID}/attempts`,
        {
          method: "POST",
          body: JSON.stringify(validBody()),
        },
      ),
      { params: Promise.resolve({ missionId: VALID_MISSION_ID }) },
    );
    expect(response.status).toBe(404);
  });

  it("returns 400 when the option does not belong to the question", async () => {
    mockAuthenticatedSupabase();
    vi.doMock("@/modules/missions/mission-player.service", async () => {
      const actual = await vi.importActual<
        typeof import("@/modules/missions/mission-player.service")
      >("@/modules/missions/mission-player.service");
      return {
        ...actual,
        MissionPlayerService: class {
          submitAnswer() {
            throw new actual.MissionOptionInvalidError("Invalid option");
          }
        },
      };
    });
    const { POST } =
      await import("@/app/api/missions/[missionId]/attempts/route");
    const response = await POST(
      new Request(
        `http://localhost/api/missions/${VALID_MISSION_ID}/attempts`,
        {
          method: "POST",
          body: JSON.stringify(validBody()),
        },
      ),
      { params: Promise.resolve({ missionId: VALID_MISSION_ID }) },
    );
    expect(response.status).toBe(400);
  });
});
