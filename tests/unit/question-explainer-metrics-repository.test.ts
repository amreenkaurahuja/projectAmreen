import { describe, expect, it, vi } from "vitest";
import {
  QuestionExplainerMetricsRepositoryError,
  SupabaseQuestionExplainerMetricsRepository,
} from "@/modules/question-explainer/question-explainer-metrics.repository";

interface RecordedCall {
  method: string;
  args: unknown[];
}

/**
 * A minimal fake of supabase-js's chainable, thenable PostgrestFilterBuilder:
 * every filter method records the call and returns the same builder object;
 * `await`ing the builder resolves to `{ data, error }` directly (matching
 * `await query` in the repository, not `await query.select()...then()`).
 */
function buildSupabase(overrides: { rows?: unknown[]; error?: unknown } = {}) {
  const calls: RecordedCall[] = [];

  function record(method: string, args: unknown[]) {
    calls.push({ method, args });
  }

  const builder = {
    select: (...args: unknown[]) => {
      record("select", args);
      return builder;
    },
    eq: (...args: unknown[]) => {
      record("eq", args);
      return builder;
    },
    order: (...args: unknown[]) => {
      record("order", args);
      return builder;
    },
    gte: (...args: unknown[]) => {
      record("gte", args);
      return builder;
    },
    lt: (...args: unknown[]) => {
      record("lt", args);
      return builder;
    },
    then: (
      onFulfilled: (value: { data: unknown; error: unknown }) => unknown,
    ) =>
      Promise.resolve({
        data: overrides.rows ?? [],
        error: overrides.error ?? null,
      }).then(onFulfilled),
  };

  const from = vi.fn((table: string) => {
    if (table !== "learning_events") {
      throw new Error(`Unexpected table: ${table}`);
    }
    return builder;
  });

  return { client: { from } as never, calls };
}

function findCalls(calls: RecordedCall[], method: string) {
  return calls.filter((call) => call.method === method);
}

describe("SupabaseQuestionExplainerMetricsRepository.getEventsForLearner", () => {
  it("filters by learner_id", async () => {
    const { client, calls } = buildSupabase({ rows: [] });
    const repository = new SupabaseQuestionExplainerMetricsRepository(client);

    await repository.getEventsForLearner("learner-1");

    expect(findCalls(calls, "eq")).toEqual([
      { method: "eq", args: ["learner_id", "learner-1"] },
    ]);
  });

  it("applies only the inclusive lower bound when only 'from' is supplied", async () => {
    const { client, calls } = buildSupabase({ rows: [] });
    const repository = new SupabaseQuestionExplainerMetricsRepository(client);

    await repository.getEventsForLearner("learner-1", {
      from: "2026-01-01T00:00:00.000Z",
    });

    expect(findCalls(calls, "gte")).toEqual([
      { method: "gte", args: ["occurred_at", "2026-01-01T00:00:00.000Z"] },
    ]);
    expect(findCalls(calls, "lt")).toHaveLength(0);
  });

  it("applies only the exclusive upper bound when only 'to' is supplied", async () => {
    const { client, calls } = buildSupabase({ rows: [] });
    const repository = new SupabaseQuestionExplainerMetricsRepository(client);

    await repository.getEventsForLearner("learner-1", {
      to: "2026-02-01T00:00:00.000Z",
    });

    expect(findCalls(calls, "lt")).toEqual([
      { method: "lt", args: ["occurred_at", "2026-02-01T00:00:00.000Z"] },
    ]);
    expect(findCalls(calls, "gte")).toHaveLength(0);
  });

  it("applies both bounds together", async () => {
    const { client, calls } = buildSupabase({ rows: [] });
    const repository = new SupabaseQuestionExplainerMetricsRepository(client);

    await repository.getEventsForLearner("learner-1", {
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-02-01T00:00:00.000Z",
    });

    expect(findCalls(calls, "gte")).toHaveLength(1);
    expect(findCalls(calls, "lt")).toHaveLength(1);
  });

  it("applies neither bound when no window is supplied", async () => {
    const { client, calls } = buildSupabase({ rows: [] });
    const repository = new SupabaseQuestionExplainerMetricsRepository(client);

    await repository.getEventsForLearner("learner-1");

    expect(findCalls(calls, "gte")).toHaveLength(0);
    expect(findCalls(calls, "lt")).toHaveLength(0);
  });

  it("selects only the columns the calculation service needs", async () => {
    const { client, calls } = buildSupabase({ rows: [] });
    const repository = new SupabaseQuestionExplainerMetricsRepository(client);

    await repository.getEventsForLearner("learner-1");

    expect(findCalls(calls, "select")).toEqual([
      {
        method: "select",
        args: ["session_id,event_type,step,last_step,duration_ms,occurred_at"],
      },
    ]);
  });

  it("orders deterministically by occurred_at then created_at, both ascending", async () => {
    const { client, calls } = buildSupabase({ rows: [] });
    const repository = new SupabaseQuestionExplainerMetricsRepository(client);

    await repository.getEventsForLearner("learner-1");

    expect(findCalls(calls, "order")).toEqual([
      { method: "order", args: ["occurred_at", { ascending: true }] },
      { method: "order", args: ["created_at", { ascending: true }] },
    ]);
  });

  it("maps snake_case rows to the camelCase QuestionExplainerMetricEvent shape", async () => {
    const { client } = buildSupabase({
      rows: [
        {
          session_id: "session-1",
          event_type: "step_viewed",
          step: "worked_example",
          last_step: null,
          duration_ms: null,
          occurred_at: "2026-01-15T10:00:00.000Z",
        },
        {
          session_id: "session-1",
          event_type: "explanation_completed",
          step: null,
          last_step: null,
          duration_ms: 4200,
          occurred_at: "2026-01-15T10:00:05.000Z",
        },
      ],
    });
    const repository = new SupabaseQuestionExplainerMetricsRepository(client);

    const events = await repository.getEventsForLearner("learner-1");

    expect(events).toEqual([
      {
        sessionId: "session-1",
        eventType: "step_viewed",
        step: "worked_example",
        lastStep: undefined,
        durationMs: undefined,
        occurredAt: "2026-01-15T10:00:00.000Z",
      },
      {
        sessionId: "session-1",
        eventType: "explanation_completed",
        step: undefined,
        lastStep: undefined,
        durationMs: 4200,
        occurredAt: "2026-01-15T10:00:05.000Z",
      },
    ]);
  });

  it("throws QuestionExplainerMetricsRepositoryError on a database error", async () => {
    const { client } = buildSupabase({ error: { message: "boom" } });
    const repository = new SupabaseQuestionExplainerMetricsRepository(client);

    await expect(repository.getEventsForLearner("learner-1")).rejects.toThrow(
      QuestionExplainerMetricsRepositoryError,
    );
  });
});
