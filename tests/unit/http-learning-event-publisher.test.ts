import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { httpLearningEventPublisher } from "@/modules/question-explainer/http-learning-event-publisher";
import { logger } from "@/lib/observability/logger";
import type { LearningEvent } from "@/modules/question-explainer/explanation-event.types";

const EVENT: LearningEvent = {
  eventId: "eid-1",
  eventType: "explanation_opened",
  attemptId: "attempt-1",
  sessionId: "session-1",
  occurredAt: "2026-07-28T00:00:00.000Z",
};

function jsonResponse(ok: boolean, status: number) {
  return { ok, status, json: async () => ({}) } as Response;
}

// vi.waitFor gives the publisher's internal .then()/.catch() microtask a
// turn to run — publish() itself returns synchronously (that's the whole
// point: nothing for a caller to await), so tests observe its effects
// asynchronously rather than awaiting the call itself.
async function flushMicrotasks() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("httpLearningEventPublisher.publish", () => {
  it("issues exactly one POST to /api/v1/learning-events with the event as the JSON body", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(true, 201));

    httpLearningEventPublisher.publish(EVENT);
    await flushMicrotasks();

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/learning-events",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(EVENT),
      }),
    );
  });

  it("returns undefined synchronously — there is nothing for the caller to await or catch", () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(true, 201));
    const result = httpLearningEventPublisher.publish(EVENT);
    expect(result).toBeUndefined();
  });

  it("does not retry after a non-ok response — logs a warning instead", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(false, 500));
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

    httpLearningEventPublisher.publish(EVENT);
    await flushMicrotasks();

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      "learning-event.delivery-rejected",
      expect.objectContaining({ eventId: "eid-1", status: 500 }),
    );
  });

  it("does not retry after a network error — swallows it and logs a warning instead of throwing", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("network down"));
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

    expect(() => httpLearningEventPublisher.publish(EVENT)).not.toThrow();
    await flushMicrotasks();

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      "learning-event.delivery-error",
      expect.objectContaining({ eventId: "eid-1", error: "network down" }),
    );
  });

  it("never produces an unhandled promise rejection on failure", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("network down"));
    vi.spyOn(logger, "warn").mockImplementation(() => {});

    // If publish() left a rejected promise unhandled, this test file would
    // fail the suite via an unhandledRejection — completing cleanly is the
    // assertion.
    httpLearningEventPublisher.publish(EVENT);
    await flushMicrotasks();
  });
});
