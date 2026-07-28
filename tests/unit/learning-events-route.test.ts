import { beforeEach, describe, expect, it, vi } from "vitest";

const VALID_ATTEMPT_ID = "223e4567-e89b-12d3-a456-426614174000";
const VALID_SESSION_ID = "323e4567-e89b-12d3-a456-426614174000";
const VALID_EVENT_ID = "423e4567-e89b-12d3-a456-426614174000";

const VALID_OPENED_EVENT = {
  eventId: VALID_EVENT_ID,
  eventType: "explanation_opened",
  attemptId: VALID_ATTEMPT_ID,
  sessionId: VALID_SESSION_ID,
  occurredAt: "2026-07-28T00:00:00.000Z",
};

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

function mockDeliveryService(deliverSpy: (...args: unknown[]) => unknown) {
  vi.doMock(
    "@/modules/question-explainer/learning-event-delivery.service",
    async () => {
      const actual = await vi.importActual<
        typeof import("@/modules/question-explainer/learning-event-delivery.service")
      >("@/modules/question-explainer/learning-event-delivery.service");
      return {
        ...actual,
        LearningEventDeliveryService: class {
          deliver = deliverSpy;
        },
      };
    },
  );
}

function postRequest(body: unknown) {
  return new Request("http://localhost/api/v1/learning-events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetModules();
});

describe("POST /api/v1/learning-events", () => {
  it("returns 401 when unauthenticated", async () => {
    mockUnauthenticatedSupabase();
    const { POST } = await import("@/app/api/v1/learning-events/route");
    const response = await POST(postRequest(VALID_OPENED_EVENT), {
      params: Promise.resolve({}),
    });
    expect(response.status).toBe(401);
  });

  it("returns 400 for a malformed JSON body", async () => {
    mockAuthenticatedSupabase();
    const { POST } = await import("@/app/api/v1/learning-events/route");
    const response = await POST(
      new Request("http://localhost/api/v1/learning-events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "not json",
      }),
      { params: Promise.resolve({}) },
    );
    expect(response.status).toBe(400);
  });

  it("returns 400 when a required field is missing", async () => {
    mockAuthenticatedSupabase();
    const { POST } = await import("@/app/api/v1/learning-events/route");
    const withoutSessionId: Record<string, unknown> = {
      ...VALID_OPENED_EVENT,
    };
    delete withoutSessionId.sessionId;
    const response = await POST(postRequest(withoutSessionId), {
      params: Promise.resolve({}),
    });
    expect(response.status).toBe(400);
  });

  it("returns 400 for an unsupported eventType", async () => {
    mockAuthenticatedSupabase();
    const { POST } = await import("@/app/api/v1/learning-events/route");
    const response = await POST(
      postRequest({ ...VALID_OPENED_EVENT, eventType: "explanation_liked" }),
      { params: Promise.resolve({}) },
    );
    expect(response.status).toBe(400);
  });

  it("returns 400 and never constructs the delivery service when a client-supplied learnerId is present — authenticated identity always wins", async () => {
    mockAuthenticatedSupabase();
    mockLearnerIdForAttempt(async () => "learner-1");
    const deliverSpy = vi.fn(async () => "inserted");
    mockDeliveryService(deliverSpy);
    const { POST } = await import("@/app/api/v1/learning-events/route");

    const response = await POST(
      postRequest({ ...VALID_OPENED_EVENT, learnerId: "attacker-supplied" }),
      { params: Promise.resolve({}) },
    );

    expect(response.status).toBe(400);
    expect(deliverSpy).not.toHaveBeenCalled();
  });

  it("returns 404 when the attempt isn't found or isn't owned, without calling the delivery service", async () => {
    mockAuthenticatedSupabase();
    mockLearnerIdForAttempt(async () => null);
    const deliverSpy = vi.fn(async () => "inserted");
    mockDeliveryService(deliverSpy);
    const { POST } = await import("@/app/api/v1/learning-events/route");

    const response = await POST(postRequest(VALID_OPENED_EVENT), {
      params: Promise.resolve({}),
    });

    expect(response.status).toBe(404);
    expect(deliverSpy).not.toHaveBeenCalled();
  });

  it("resolves learnerId from attemptId via getLearnerIdForAttempt and never from the request body", async () => {
    mockAuthenticatedSupabase();
    mockLearnerIdForAttempt(async () => "learner-resolved-server-side");
    const deliverSpy = vi.fn(async () => "inserted");
    mockDeliveryService(deliverSpy);
    const { POST } = await import("@/app/api/v1/learning-events/route");

    await POST(postRequest(VALID_OPENED_EVENT), {
      params: Promise.resolve({}),
    });

    expect(deliverSpy).toHaveBeenCalledWith(
      expect.objectContaining({ learnerId: "learner-resolved-server-side" }),
    );
  });

  it("returns 201 when the event is newly inserted", async () => {
    mockAuthenticatedSupabase();
    mockLearnerIdForAttempt(async () => "learner-1");
    mockDeliveryService(vi.fn(async () => "inserted"));
    const { POST } = await import("@/app/api/v1/learning-events/route");

    const response = await POST(postRequest(VALID_OPENED_EVENT), {
      params: Promise.resolve({}),
    });

    expect(response.status).toBe(201);
  });

  it("returns 200 (not an error) when the eventId already exists — a duplicate is treated as successful delivery", async () => {
    mockAuthenticatedSupabase();
    mockLearnerIdForAttempt(async () => "learner-1");
    mockDeliveryService(vi.fn(async () => "alreadyExists"));
    const { POST } = await import("@/app/api/v1/learning-events/route");

    const response = await POST(postRequest(VALID_OPENED_EVENT), {
      params: Promise.resolve({}),
    });

    expect(response.status).toBe(200);
  });

  it("returns 500 on an unexpected repository failure, logged and correlated, not the raw error", async () => {
    mockAuthenticatedSupabase();
    mockLearnerIdForAttempt(async () => "learner-1");
    mockDeliveryService(
      vi.fn(async () => {
        throw new Error("connection reset");
      }),
    );
    const { POST } = await import("@/app/api/v1/learning-events/route");

    const response = await POST(postRequest(VALID_OPENED_EVENT), {
      params: Promise.resolve({}),
    });

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe("Internal server error");
    expect(JSON.stringify(body)).not.toContain("connection reset");
  });

  it("accepts a valid step_viewed event", async () => {
    mockAuthenticatedSupabase();
    mockLearnerIdForAttempt(async () => "learner-1");
    mockDeliveryService(vi.fn(async () => "inserted"));
    const { POST } = await import("@/app/api/v1/learning-events/route");

    const response = await POST(
      postRequest({
        ...VALID_OPENED_EVENT,
        eventType: "step_viewed",
        step: "worked_example",
      }),
      { params: Promise.resolve({}) },
    );

    expect(response.status).toBe(201);
  });

  it("accepts a valid explanation_completed event", async () => {
    mockAuthenticatedSupabase();
    mockLearnerIdForAttempt(async () => "learner-1");
    mockDeliveryService(vi.fn(async () => "inserted"));
    const { POST } = await import("@/app/api/v1/learning-events/route");

    const response = await POST(
      postRequest({
        ...VALID_OPENED_EVENT,
        eventType: "explanation_completed",
        durationMs: 4200,
      }),
      { params: Promise.resolve({}) },
    );

    expect(response.status).toBe(201);
  });

  it("accepts a valid explanation_abandoned event", async () => {
    mockAuthenticatedSupabase();
    mockLearnerIdForAttempt(async () => "learner-1");
    mockDeliveryService(vi.fn(async () => "inserted"));
    const { POST } = await import("@/app/api/v1/learning-events/route");

    const response = await POST(
      postRequest({
        ...VALID_OPENED_EVENT,
        eventType: "explanation_abandoned",
        lastStep: "explain",
        exitMethod: "escape",
        durationMs: 900,
      }),
      { params: Promise.resolve({}) },
    );

    expect(response.status).toBe(201);
  });

  it("rejects an explanation_abandoned event missing exitMethod (cross-field shape enforced, mirroring the DB CHECK constraint)", async () => {
    mockAuthenticatedSupabase();
    const { POST } = await import("@/app/api/v1/learning-events/route");

    const response = await POST(
      postRequest({
        ...VALID_OPENED_EVENT,
        eventType: "explanation_abandoned",
        lastStep: "explain",
        durationMs: 900,
      }),
      { params: Promise.resolve({}) },
    );

    expect(response.status).toBe(400);
  });

  it("rejects a negative durationMs", async () => {
    mockAuthenticatedSupabase();
    const { POST } = await import("@/app/api/v1/learning-events/route");

    const response = await POST(
      postRequest({
        ...VALID_OPENED_EVENT,
        eventType: "explanation_completed",
        durationMs: -1,
      }),
      { params: Promise.resolve({}) },
    );

    expect(response.status).toBe(400);
  });
});
