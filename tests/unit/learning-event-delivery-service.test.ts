import { describe, expect, it, vi } from "vitest";
import { LearningEventDeliveryService } from "@/modules/question-explainer/learning-event-delivery.service";
import type {
  InsertEventOutcome,
  LearningEventRepository,
} from "@/modules/question-explainer/learning-event.repository";
import type { LearningEvent } from "@/modules/question-explainer/explanation-event.types";

function buildRepository(outcome: InsertEventOutcome = "inserted") {
  const insertEvent = vi.fn(async (): Promise<InsertEventOutcome> => outcome);
  return { insertEvent } satisfies LearningEventRepository;
}

const OCCURRED_AT = "2026-07-28T00:00:00.000Z";

describe("LearningEventDeliveryService.deliver", () => {
  it("maps an explanation_opened event, filling step/lastStep/exitMethod/durationMs with null", async () => {
    const repository = buildRepository();
    const service = new LearningEventDeliveryService(repository);
    const event: LearningEvent = {
      eventId: "eid-1",
      eventType: "explanation_opened",
      attemptId: "attempt-1",
      sessionId: "session-1",
      occurredAt: OCCURRED_AT,
    };

    await service.deliver({ learnerId: "learner-1", event });

    expect(repository.insertEvent).toHaveBeenCalledWith({
      eventId: "eid-1",
      learnerId: "learner-1",
      attemptId: "attempt-1",
      sessionId: "session-1",
      eventType: "explanation_opened",
      step: null,
      lastStep: null,
      exitMethod: null,
      durationMs: null,
      occurredAt: OCCURRED_AT,
    });
  });

  it("maps a step_viewed event's step, leaving lastStep/exitMethod/durationMs null", async () => {
    const repository = buildRepository();
    const service = new LearningEventDeliveryService(repository);
    const event: LearningEvent = {
      eventId: "eid-2",
      eventType: "step_viewed",
      attemptId: "attempt-1",
      sessionId: "session-1",
      step: "worked_example",
      occurredAt: OCCURRED_AT,
    };

    await service.deliver({ learnerId: "learner-1", event });

    expect(repository.insertEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "step_viewed",
        step: "worked_example",
        lastStep: null,
        exitMethod: null,
        durationMs: null,
      }),
    );
  });

  it("maps an explanation_completed event's durationMs, leaving step/lastStep/exitMethod null", async () => {
    const repository = buildRepository();
    const service = new LearningEventDeliveryService(repository);
    const event: LearningEvent = {
      eventId: "eid-3",
      eventType: "explanation_completed",
      attemptId: "attempt-1",
      sessionId: "session-1",
      durationMs: 4200,
      occurredAt: OCCURRED_AT,
    };

    await service.deliver({ learnerId: "learner-1", event });

    expect(repository.insertEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "explanation_completed",
        step: null,
        lastStep: null,
        exitMethod: null,
        durationMs: 4200,
      }),
    );
  });

  it("maps an explanation_abandoned event's lastStep/exitMethod/durationMs, leaving step null", async () => {
    const repository = buildRepository();
    const service = new LearningEventDeliveryService(repository);
    const event: LearningEvent = {
      eventId: "eid-4",
      eventType: "explanation_abandoned",
      attemptId: "attempt-1",
      sessionId: "session-1",
      lastStep: "explain",
      exitMethod: "escape",
      durationMs: 900,
      occurredAt: OCCURRED_AT,
    };

    await service.deliver({ learnerId: "learner-1", event });

    expect(repository.insertEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "explanation_abandoned",
        step: null,
        lastStep: "explain",
        exitMethod: "escape",
        durationMs: 900,
      }),
    );
  });

  it("passes the repository's outcome straight through unchanged", async () => {
    const repository = buildRepository("alreadyExists");
    const service = new LearningEventDeliveryService(repository);
    const event: LearningEvent = {
      eventId: "eid-5",
      eventType: "explanation_opened",
      attemptId: "attempt-1",
      sessionId: "session-1",
      occurredAt: OCCURRED_AT,
    };

    const outcome = await service.deliver({ learnerId: "learner-1", event });

    expect(outcome).toBe("alreadyExists");
  });
});
