import { beforeEach, describe, expect, it, vi } from "vitest";

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

const coachResult = {
  headline: "Great progress!",
  message: "Keep it up.",
  strengths: ["Vocabulary"],
  focusAreas: ["Fractions"],
  nextSteps: ["Practise Fractions tomorrow."],
  source: "ai" as const,
  cached: false,
};

function mockAiCoachService(
  impl: () => Promise<typeof coachResult> = async () => coachResult,
) {
  vi.doMock("@/modules/ai/coach/ai-coach.service", async () => {
    const actual = await vi.importActual<
      typeof import("@/modules/ai/coach/ai-coach.service")
    >("@/modules/ai/coach/ai-coach.service");
    return {
      ...actual,
      AiCoachService: class {
        getCoachResponse() {
          return impl();
        }
      },
    };
  });
}

beforeEach(() => {
  vi.resetModules();
});

describe("GET /api/learners/[learnerId]/coach", () => {
  it("returns 400 for an invalid learner id", async () => {
    mockAuthenticatedSupabase();
    mockAiCoachService();
    const { GET } = await import("@/app/api/learners/[learnerId]/coach/route");

    const response = await GET(
      new Request(
        "http://localhost/api/learners/not-a-uuid/coach?audience=parent",
      ),
      { params: Promise.resolve({ learnerId: "not-a-uuid" }) },
    );

    expect(response.status).toBe(400);
  });

  it("returns 400 for a missing or invalid audience", async () => {
    mockAuthenticatedSupabase();
    mockAiCoachService();
    const { GET } = await import("@/app/api/learners/[learnerId]/coach/route");

    const response = await GET(
      new Request(`http://localhost/api/learners/${VALID_LEARNER_ID}/coach`),
      { params: Promise.resolve({ learnerId: VALID_LEARNER_ID }) },
    );

    expect(response.status).toBe(400);
  });

  it("returns 401 when unauthenticated", async () => {
    mockUnauthenticatedSupabase();
    mockAiCoachService();
    const { GET } = await import("@/app/api/learners/[learnerId]/coach/route");

    const response = await GET(
      new Request(
        `http://localhost/api/learners/${VALID_LEARNER_ID}/coach?audience=parent`,
      ),
      { params: Promise.resolve({ learnerId: VALID_LEARNER_ID }) },
    );

    expect(response.status).toBe(401);
  });

  it("returns 403 when the learner is not owned by the authenticated parent", async () => {
    mockAuthenticatedSupabase();
    vi.doMock("@/modules/ai/coach/ai-coach.service", async () => {
      const { ParentDashboardAccessError } =
        await import("@/modules/parent-dashboard/dashboard.repository");
      return {
        AiCoachService: class {
          getCoachResponse() {
            throw new ParentDashboardAccessError("not owned");
          }
        },
      };
    });
    const { GET } = await import("@/app/api/learners/[learnerId]/coach/route");

    const response = await GET(
      new Request(
        `http://localhost/api/learners/${VALID_LEARNER_ID}/coach?audience=parent`,
      ),
      { params: Promise.resolve({ learnerId: VALID_LEARNER_ID }) },
    );

    expect(response.status).toBe(403);
  });

  it("returns 200 with the coach result for a valid request", async () => {
    mockAuthenticatedSupabase();
    mockAiCoachService();
    const { GET } = await import("@/app/api/learners/[learnerId]/coach/route");

    const response = await GET(
      new Request(
        `http://localhost/api/learners/${VALID_LEARNER_ID}/coach?audience=parent`,
      ),
      { params: Promise.resolve({ learnerId: VALID_LEARNER_ID }) },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(coachResult);
  });

  it("passes forceRefresh through to the coach service when set", async () => {
    mockAuthenticatedSupabase();
    const getCoachResponse = vi.fn(async () => coachResult);
    vi.doMock("@/modules/ai/coach/ai-coach.service", async () => {
      const actual = await vi.importActual<
        typeof import("@/modules/ai/coach/ai-coach.service")
      >("@/modules/ai/coach/ai-coach.service");
      return {
        ...actual,
        AiCoachService: class {
          getCoachResponse = getCoachResponse;
        },
      };
    });
    const { GET } = await import("@/app/api/learners/[learnerId]/coach/route");

    await GET(
      new Request(
        `http://localhost/api/learners/${VALID_LEARNER_ID}/coach?audience=parent&forceRefresh=true`,
      ),
      { params: Promise.resolve({ learnerId: VALID_LEARNER_ID }) },
    );

    expect(getCoachResponse).toHaveBeenCalledWith(
      expect.objectContaining({ forceRefresh: true }),
    );
  });

  it("defaults forceRefresh to false when not present", async () => {
    mockAuthenticatedSupabase();
    const getCoachResponse = vi.fn(async () => coachResult);
    vi.doMock("@/modules/ai/coach/ai-coach.service", async () => {
      const actual = await vi.importActual<
        typeof import("@/modules/ai/coach/ai-coach.service")
      >("@/modules/ai/coach/ai-coach.service");
      return {
        ...actual,
        AiCoachService: class {
          getCoachResponse = getCoachResponse;
        },
      };
    });
    const { GET } = await import("@/app/api/learners/[learnerId]/coach/route");

    await GET(
      new Request(
        `http://localhost/api/learners/${VALID_LEARNER_ID}/coach?audience=parent`,
      ),
      { params: Promise.resolve({ learnerId: VALID_LEARNER_ID }) },
    );

    expect(getCoachResponse).toHaveBeenCalledWith(
      expect.objectContaining({ forceRefresh: false }),
    );
  });

  it("returns a generic 500 and never leaks a provider error's details", async () => {
    mockAuthenticatedSupabase();
    mockAiCoachService(async () => {
      throw new Error("Gemini request failed: invalid API key sk-secret-123");
    });
    const { GET } = await import("@/app/api/learners/[learnerId]/coach/route");

    const response = await GET(
      new Request(
        `http://localhost/api/learners/${VALID_LEARNER_ID}/coach?audience=parent`,
      ),
      { params: Promise.resolve({ learnerId: VALID_LEARNER_ID }) },
    );

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({ error: "Internal server error" });
    expect(JSON.stringify(body)).not.toContain("sk-secret-123");
  });

  it("returns a generic 500 even when a non-Error value is thrown", async () => {
    mockAuthenticatedSupabase();
    mockAiCoachService(async () => {
      throw "a plain string failure";
    });
    const { GET } = await import("@/app/api/learners/[learnerId]/coach/route");

    const response = await GET(
      new Request(
        `http://localhost/api/learners/${VALID_LEARNER_ID}/coach?audience=parent`,
      ),
      { params: Promise.resolve({ learnerId: VALID_LEARNER_ID }) },
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Internal server error" });
  });

  it("constructs a real gateway attempt when the coach is enabled for the audience", async () => {
    mockAuthenticatedSupabase();
    mockAiCoachService();
    vi.stubEnv("AI_COACH_ENABLED", "true");
    vi.stubEnv("AI_PARENT_ENABLED", "true");
    const { GET } = await import("@/app/api/learners/[learnerId]/coach/route");

    const response = await GET(
      new Request(
        `http://localhost/api/learners/${VALID_LEARNER_ID}/coach?audience=parent`,
      ),
      { params: Promise.resolve({ learnerId: VALID_LEARNER_ID }) },
    );

    expect(response.status).toBe(200);
    vi.unstubAllEnvs();
  });
});
