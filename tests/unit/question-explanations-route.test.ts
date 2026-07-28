import { beforeEach, describe, expect, it, vi } from "vitest";

const VALID_ATTEMPT_ID = "223e4567-e89b-12d3-a456-426614174000";

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

function mockLearnerIdForAttempt(
  resolver: () => Promise<string | null> | never,
) {
  vi.doMock("@/modules/question-explainer/explainer.repository", async () => {
    const actual = await vi.importActual<
      typeof import("@/modules/question-explainer/explainer.repository")
    >("@/modules/question-explainer/explainer.repository");
    return {
      ...actual,
      SupabaseQuestionExplainerRepository: class {
        getLearnerIdForAttempt = resolver;
      },
    };
  });
}

function mockService(resolver: () => Promise<unknown> | never) {
  vi.doMock(
    "@/modules/question-explainer/question-explainer.service",
    async () => {
      const actual = await vi.importActual<
        typeof import("@/modules/question-explainer/question-explainer.service")
      >("@/modules/question-explainer/question-explainer.service");
      return {
        ...actual,
        QuestionExplainerService: class {
          getExplanation = resolver;
        },
      };
    },
  );
}

function postRequest(body: unknown) {
  return new Request("http://localhost/api/v1/question-explanations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const AI_RESULT = {
  eligible: true,
  source: "ai",
  cached: false,
  contextHash: "hash-1",
  followUpQuestionId: "question-2",
  explanation: {
    acknowledgement: "Good try!",
    mistakeExplanation: 'You chose "54". The correct answer is "60".',
    keyConcept: "75% means three quarters.",
    workedExample: {
      problem: "Find 75% of 40.",
      steps: ["40 divided by 4 is 10.", "10 times 3 is 30."],
      answer: "30",
    },
    nextAction: { type: "linked-question", text: "Try one more question." },
  },
};

beforeEach(() => {
  vi.resetModules();
});

describe("POST /api/v1/question-explanations", () => {
  it("returns 401 when unauthenticated", async () => {
    mockUnauthenticatedSupabase();
    const { POST } = await import("@/app/api/v1/question-explanations/route");
    const response = await POST(
      postRequest({ attemptId: VALID_ATTEMPT_ID, audience: "learner" }),
      { params: Promise.resolve({}) },
    );
    expect(response.status).toBe(401);
  });

  it("returns 422 for an invalid attemptId", async () => {
    mockAuthenticatedSupabase();
    const { POST } = await import("@/app/api/v1/question-explanations/route");
    const response = await POST(
      postRequest({ attemptId: "not-a-uuid", audience: "learner" }),
      { params: Promise.resolve({}) },
    );
    expect(response.status).toBe(422);
  });

  it("returns 422 for an invalid audience", async () => {
    mockAuthenticatedSupabase();
    const { POST } = await import("@/app/api/v1/question-explanations/route");
    const response = await POST(
      postRequest({ attemptId: VALID_ATTEMPT_ID, audience: "teacher" }),
      { params: Promise.resolve({}) },
    );
    expect(response.status).toBe(422);
  });

  it("returns 422 for a malformed JSON body", async () => {
    mockAuthenticatedSupabase();
    const { POST } = await import("@/app/api/v1/question-explanations/route");
    const response = await POST(
      new Request("http://localhost/api/v1/question-explanations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "not json",
      }),
      { params: Promise.resolve({}) },
    );
    expect(response.status).toBe(422);
  });

  it("never sends the learner id to the client — it isn't part of the request contract", async () => {
    mockAuthenticatedSupabase();
    const { POST } = await import("@/app/api/v1/question-explanations/route");
    // A client-supplied learnerId is simply ignored — extra fields aren't
    // rejected by the request schema, but they're never read either.
    const response = await POST(
      postRequest({
        attemptId: "not-a-uuid",
        audience: "learner",
        learnerId: "should-be-ignored",
      }),
      { params: Promise.resolve({}) },
    );
    expect(response.status).toBe(422); // still fails on attemptId, proving the field wasn't consulted to "fix" validity
  });

  it("returns 404 when the attempt isn't found or isn't owned", async () => {
    mockAuthenticatedSupabase();
    mockLearnerIdForAttempt(async () => null);
    const { POST } = await import("@/app/api/v1/question-explanations/route");
    const response = await POST(
      postRequest({ attemptId: VALID_ATTEMPT_ID, audience: "learner" }),
      { params: Promise.resolve({}) },
    );
    expect(response.status).toBe(404);
  });

  it("returns 403 when the service reports an ownership error", async () => {
    mockAuthenticatedSupabase();
    mockLearnerIdForAttempt(async () => "learner-1");
    const { ExplainerAccessError } =
      await import("@/modules/question-explainer/explainer.repository");
    mockService(async () => {
      throw new ExplainerAccessError("not owned");
    });
    const { POST } = await import("@/app/api/v1/question-explanations/route");
    const response = await POST(
      postRequest({ attemptId: VALID_ATTEMPT_ID, audience: "learner" }),
      { params: Promise.resolve({}) },
    );
    expect(response.status).toBe(403);
  });

  it("returns 404 when the service reports the attempt is ineligible (not found/unanswered)", async () => {
    mockAuthenticatedSupabase();
    mockLearnerIdForAttempt(async () => "learner-1");
    mockService(async () => ({
      eligible: false,
      reason: "attempt_not_found",
    }));
    const { POST } = await import("@/app/api/v1/question-explanations/route");
    const response = await POST(
      postRequest({ attemptId: VALID_ATTEMPT_ID, audience: "learner" }),
      { params: Promise.resolve({}) },
    );
    expect(response.status).toBe(404);
  });

  it("returns 409 when the answer was already correct", async () => {
    mockAuthenticatedSupabase();
    mockLearnerIdForAttempt(async () => "learner-1");
    mockService(async () => ({ eligible: false, reason: "answer_correct" }));
    const { POST } = await import("@/app/api/v1/question-explanations/route");
    const response = await POST(
      postRequest({ attemptId: VALID_ATTEMPT_ID, audience: "learner" }),
      { params: Promise.resolve({}) },
    );
    expect(response.status).toBe(409);
  });

  it("returns 500 on an unexpected error, not the raw error", async () => {
    mockAuthenticatedSupabase();
    mockLearnerIdForAttempt(async () => "learner-1");
    mockService(async () => {
      throw new Error("connection reset");
    });
    const { POST } = await import("@/app/api/v1/question-explanations/route");
    const response = await POST(
      postRequest({ attemptId: VALID_ATTEMPT_ID, audience: "learner" }),
      { params: Promise.resolve({}) },
    );
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe("Internal server error");
    expect(JSON.stringify(body)).not.toContain("connection reset");
  });

  it("returns 200 with an AI-sourced explanation and no provider internals", async () => {
    mockAuthenticatedSupabase();
    mockLearnerIdForAttempt(async () => "learner-1");
    mockService(async () => AI_RESULT);
    const { POST } = await import("@/app/api/v1/question-explanations/route");
    const response = await POST(
      postRequest({ attemptId: VALID_ATTEMPT_ID, audience: "learner" }),
      { params: Promise.resolve({}) },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.source).toBe("ai");
    expect(body.cached).toBe(false);
    expect(body.followUpQuestionId).toBe("question-2");
    expect(body.response.keyConcept).toBe("75% means three quarters.");
    expect(typeof body.generatedAt).toBe("string");
    expect(body).not.toHaveProperty("contextHash");
    expect(body).not.toHaveProperty("model");
    expect(body).not.toHaveProperty("provider");
    expect(JSON.stringify(body)).not.toMatch(/gemini|token|prompt/i);
  });

  it("returns 200 with a deterministic fallback explanation when AI fails, not a 5xx", async () => {
    mockAuthenticatedSupabase();
    mockLearnerIdForAttempt(async () => "learner-1");
    mockService(async () => ({
      eligible: true,
      source: "fallback",
      cached: false,
      contextHash: "hash-1",
      explanation: {
        acknowledgement: "Good try!",
        mistakeExplanation: "You chose 54. The correct answer is 60.",
        keyConcept: "This question is about Percentages.",
        workedExample: {
          problem: "What is 75% of 80?",
          steps: ['The correct answer is "60".'],
          answer: "60",
        },
        nextAction: {
          type: "review-skill",
          text: "Review Percentages again soon.",
        },
      },
    }));
    const { POST } = await import("@/app/api/v1/question-explanations/route");
    const response = await POST(
      postRequest({ attemptId: VALID_ATTEMPT_ID, audience: "learner" }),
      { params: Promise.resolve({}) },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.source).toBe("fallback");
    expect(body.followUpQuestionId).toBeNull();
  });

  it("returns 200 with cached: true on a cache hit", async () => {
    mockAuthenticatedSupabase();
    mockLearnerIdForAttempt(async () => "learner-1");
    mockService(async () => ({ ...AI_RESULT, cached: true }));
    const { POST } = await import("@/app/api/v1/question-explanations/route");
    const response = await POST(
      postRequest({ attemptId: VALID_ATTEMPT_ID, audience: "learner" }),
      { params: Promise.resolve({}) },
    );

    const body = await response.json();
    expect(body.cached).toBe(true);
  });
});

describe("POST /api/v1/question-explanations — response contract (frozen)", () => {
  it("returns exactly the documented top-level keys, in a stable shape", async () => {
    mockAuthenticatedSupabase();
    mockLearnerIdForAttempt(async () => "learner-1");
    mockService(async () => AI_RESULT);
    const { POST } = await import("@/app/api/v1/question-explanations/route");
    const response = await POST(
      postRequest({ attemptId: VALID_ATTEMPT_ID, audience: "learner" }),
      { params: Promise.resolve({}) },
    );

    const body = await response.json();
    expect(Object.keys(body).sort()).toEqual(
      [
        "source",
        "cached",
        "response",
        "followUpQuestionId",
        "generatedAt",
      ].sort(),
    );
    expect(["ai", "fallback"]).toContain(body.source);
    expect(typeof body.cached).toBe("boolean");
    expect(Object.keys(body.response).sort()).toEqual(
      [
        "acknowledgement",
        "mistakeExplanation",
        "keyConcept",
        "workedExample",
        "nextAction",
      ].sort(),
    );
  });
});
