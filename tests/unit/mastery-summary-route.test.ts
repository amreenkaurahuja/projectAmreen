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

beforeEach(() => {
  vi.resetModules();
});

describe("GET /api/learners/[learnerId]/mastery-summary", () => {
  it("returns 400 for an invalid learner id", async () => {
    mockAuthenticatedSupabase();
    const { GET } =
      await import("@/app/api/learners/[learnerId]/mastery-summary/route");
    const response = await GET(
      new Request("http://localhost/api/learners/not-a-uuid/mastery-summary"),
      { params: Promise.resolve({ learnerId: "not-a-uuid" }) },
    );
    expect(response.status).toBe(400);
  });

  it("returns 401 when unauthenticated", async () => {
    mockUnauthenticatedSupabase();
    const { GET } =
      await import("@/app/api/learners/[learnerId]/mastery-summary/route");
    const response = await GET(
      new Request(
        `http://localhost/api/learners/${VALID_LEARNER_ID}/mastery-summary`,
      ),
      { params: Promise.resolve({ learnerId: VALID_LEARNER_ID }) },
    );
    expect(response.status).toBe(401);
  });

  it("returns 403 when another parent's learner is requested", async () => {
    mockAuthenticatedSupabase();
    vi.doMock("@/modules/learning-profile/mastery.service", async () => {
      const actual = await vi.importActual<
        typeof import("@/modules/learning-profile/mastery.service")
      >("@/modules/learning-profile/mastery.service");
      const { MasteryAccessError } =
        await import("@/modules/learning-profile/mastery.repository");
      return {
        ...actual,
        MasteryService: class {
          getLearnerProfileSummary() {
            throw new MasteryAccessError(
              "Learner is not owned by the current user",
            );
          }
        },
      };
    });
    const { GET } =
      await import("@/app/api/learners/[learnerId]/mastery-summary/route");
    const response = await GET(
      new Request(
        `http://localhost/api/learners/${VALID_LEARNER_ID}/mastery-summary`,
      ),
      { params: Promise.resolve({ learnerId: VALID_LEARNER_ID }) },
    );
    expect(response.status).toBe(403);
  });

  it("returns 200 with the learner's profile summary", async () => {
    mockAuthenticatedSupabase();
    const emptySummary = {
      hasData: false,
      overallMasteryScore: null,
      overallConfidenceScore: null,
      totalQuestionsAnswered: 0,
      correctAnswers: 0,
      overallAccuracy: null,
      averageResponseMs: null,
      strongestSubject: null,
      weakestSubject: null,
      subjectSummaries: [],
      strongestSkills: [],
      weakestSkills: [],
      skillsDueForReview: [],
      lastPractisedAt: null,
    };
    vi.doMock("@/modules/learning-profile/mastery.service", async () => {
      const actual = await vi.importActual<
        typeof import("@/modules/learning-profile/mastery.service")
      >("@/modules/learning-profile/mastery.service");
      return {
        ...actual,
        MasteryService: class {
          async getLearnerProfileSummary() {
            return emptySummary;
          }
        },
      };
    });
    const { GET } =
      await import("@/app/api/learners/[learnerId]/mastery-summary/route");
    const response = await GET(
      new Request(
        `http://localhost/api/learners/${VALID_LEARNER_ID}/mastery-summary`,
      ),
      { params: Promise.resolve({ learnerId: VALID_LEARNER_ID }) },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(emptySummary);
  });
});
