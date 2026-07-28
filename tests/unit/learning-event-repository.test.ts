import { describe, expect, it, vi } from "vitest";
import {
  LearningEventRepositoryError,
  SupabaseLearningEventRepository,
  type SaveLearningEventParams,
} from "@/modules/question-explainer/learning-event.repository";

const BASE_PARAMS: SaveLearningEventParams = {
  eventId: "eid-1",
  learnerId: "learner-1",
  attemptId: "attempt-1",
  sessionId: "session-1",
  eventType: "explanation_opened",
  step: null,
  lastStep: null,
  exitMethod: null,
  durationMs: null,
  occurredAt: "2026-07-28T00:00:00.000Z",
};

function buildSupabase(overrides: { insertError?: unknown } = {}) {
  const insert = vi.fn(async () => ({
    error: overrides.insertError ?? null,
  }));
  const from = vi.fn((table: string) => {
    if (table !== "learning_events") {
      throw new Error(`Unexpected table: ${table}`);
    }
    return { insert };
  });
  return { client: { from } as never, from, insert };
}

describe("SupabaseLearningEventRepository.insertEvent", () => {
  it("maps camelCase params onto learning_events columns and returns 'inserted' on success", async () => {
    const { client, insert } = buildSupabase();
    const repository = new SupabaseLearningEventRepository(client);

    const outcome = await repository.insertEvent({
      ...BASE_PARAMS,
      eventType: "step_viewed",
      step: "worked_example",
    });

    expect(outcome).toBe("inserted");
    expect(insert).toHaveBeenCalledWith({
      event_id: "eid-1",
      learner_id: "learner-1",
      attempt_id: "attempt-1",
      session_id: "session-1",
      event_type: "step_viewed",
      step: "worked_example",
      last_step: null,
      exit_method: null,
      duration_ms: null,
      occurred_at: "2026-07-28T00:00:00.000Z",
    });
  });

  it("returns 'alreadyExists' on a unique-constraint conflict (23505) instead of throwing", async () => {
    const { client } = buildSupabase({
      insertError: { code: "23505", message: "duplicate key" },
    });
    const repository = new SupabaseLearningEventRepository(client);

    const outcome = await repository.insertEvent(BASE_PARAMS);

    expect(outcome).toBe("alreadyExists");
  });

  it("throws LearningEventRepositoryError on any other database error", async () => {
    const { client } = buildSupabase({
      insertError: { code: "23503", message: "foreign key violation" },
    });
    const repository = new SupabaseLearningEventRepository(client);

    await expect(repository.insertEvent(BASE_PARAMS)).rejects.toThrow(
      LearningEventRepositoryError,
    );
  });
});
