import { describe, expect, it } from "vitest";
import { SupabaseLearningEventRepository } from "@/modules/question-explainer/learning-event.repository";
import { SupabaseQuestionExplainerMetricsRepository } from "@/modules/question-explainer/question-explainer-metrics.repository";
import { calculateQuestionExplainerMetrics } from "@/modules/question-explainer/question-explainer-metrics.service";
import type { QuestionExplainerMetricEvent } from "@/modules/question-explainer/question-explainer-metrics.types";
import {
  createFakeLearningEventsTable,
  createFakeSupabaseClient,
} from "./helpers/fake-learning-events-supabase";

// TDS-008 Stage 6.5 §3/§4 — invariants that must hold independently of any
// one narrative, verified against the real write/read repositories (not
// mocked away) plus the real calculation service. Where the audit already
// established that an *intuitive-looking* invariant does NOT actually
// hold under best-effort delivery, this file tests that explicitly rather
// than silently agreeing with the intuition.

const LEARNER_ID = "323e4567-e89b-12d3-a456-426614174000";

const BASE_PARAMS = {
  learnerId: LEARNER_ID,
  attemptId: "223e4567-e89b-12d3-a456-426614174000",
  sessionId: "423e4567-e89b-12d3-a456-426614174000",
  occurredAt: "2026-01-15T10:00:00.000Z",
} as const;

describe("Persistence: append-only", () => {
  it("does not create a second row or alter the first row's content on a duplicate eventId", async () => {
    const table = createFakeLearningEventsTable();
    const repository = new SupabaseLearningEventRepository(
      createFakeSupabaseClient(table) as never,
    );

    const first = await repository.insertEvent({
      ...BASE_PARAMS,
      eventId: "eid-1",
      eventType: "explanation_opened",
      step: null,
      lastStep: null,
      exitMethod: null,
      durationMs: null,
    });
    // A second delivery of the *same* occurrence — same eventId, and (per
    // TDS-008 §10.8) redelivery reuses it rather than minting a new one —
    // arriving with a different occurredAt, to prove the row's original
    // fields are preserved rather than overwritten by the conflicting
    // insert attempt.
    const second = await repository.insertEvent({
      ...BASE_PARAMS,
      eventId: "eid-1",
      eventType: "explanation_opened",
      step: null,
      lastStep: null,
      exitMethod: null,
      durationMs: null,
      occurredAt: "2026-01-15T10:05:00.000Z",
    });

    expect(first).toBe("inserted");
    expect(second).toBe("alreadyExists");
    expect(table.rows).toHaveLength(1);
    expect(table.rows[0]!.occurred_at).toBe("2026-01-15T10:00:00.000Z");
  });

  it("a distinct eventId always produces a new row, never overwrites an existing one", async () => {
    const table = createFakeLearningEventsTable();
    const repository = new SupabaseLearningEventRepository(
      createFakeSupabaseClient(table) as never,
    );

    await repository.insertEvent({
      ...BASE_PARAMS,
      eventId: "eid-1",
      eventType: "explanation_opened",
      step: null,
      lastStep: null,
      exitMethod: null,
      durationMs: null,
    });
    await repository.insertEvent({
      ...BASE_PARAMS,
      eventId: "eid-2",
      eventType: "explanation_completed",
      step: null,
      lastStep: null,
      exitMethod: null,
      durationMs: 3000,
    });

    expect(table.rows).toHaveLength(2);
  });
});

describe("Reporting: never modifies persistence", () => {
  it("reading events through the reporting repository leaves the table unchanged", async () => {
    const table = createFakeLearningEventsTable();
    const writeRepository = new SupabaseLearningEventRepository(
      createFakeSupabaseClient(table) as never,
    );
    await writeRepository.insertEvent({
      ...BASE_PARAMS,
      eventId: "eid-1",
      eventType: "explanation_opened",
      step: null,
      lastStep: null,
      exitMethod: null,
      durationMs: null,
    });
    const rowsBefore = JSON.stringify(table.rows);

    const readRepository = new SupabaseQuestionExplainerMetricsRepository(
      createFakeSupabaseClient(table) as never,
    );
    await readRepository.getEventsForLearner(LEARNER_ID);
    await readRepository.getEventsForLearner(LEARNER_ID); // read twice for good measure

    expect(JSON.stringify(table.rows)).toBe(rowsBefore);
    expect(table.rows).toHaveLength(1);
  });
});

describe("Reporting: calculation determinism", () => {
  it("returns identical output for identical input across repeated calls", () => {
    const events: QuestionExplainerMetricEvent[] = [
      {
        sessionId: "s1",
        eventType: "explanation_opened",
        occurredAt: "2026-01-15T10:00:00.000Z",
      },
      {
        sessionId: "s1",
        eventType: "step_viewed",
        step: "acknowledge",
        occurredAt: "2026-01-15T10:00:01.000Z",
      },
      {
        sessionId: "s1",
        eventType: "explanation_completed",
        durationMs: 4000,
        occurredAt: "2026-01-15T10:00:05.000Z",
      },
      {
        sessionId: "s2",
        eventType: "explanation_opened",
        occurredAt: "2026-01-15T10:01:00.000Z",
      },
      {
        sessionId: "s2",
        eventType: "explanation_abandoned",
        lastStep: "explain",
        durationMs: 900,
        occurredAt: "2026-01-15T10:01:05.000Z",
      },
    ];

    const first = calculateQuestionExplainerMetrics(events);
    const second = calculateQuestionExplainerMetrics(events);
    const third = calculateQuestionExplainerMetrics([...events]); // a fresh array, same content

    expect(first).toEqual(second);
    expect(first).toEqual(third);
  });
});

describe("Property: abandonmentByStep totals equal explanationsAbandoned", () => {
  const STEPS = [
    "acknowledge",
    "explain",
    "worked_example",
    "next_step",
  ] as const;

  it.each([1, 2, 5, 12])(
    "holds for %i abandoned events across varied lastStep values",
    (count) => {
      const events: QuestionExplainerMetricEvent[] = Array.from(
        { length: count },
        (_, i) => ({
          sessionId: `s${i}`,
          eventType: "explanation_abandoned",
          lastStep: STEPS[i % STEPS.length]!,
          durationMs: i * 100,
          occurredAt: "2026-01-15T10:00:00.000Z",
        }),
      );

      const metrics = calculateQuestionExplainerMetrics(events);
      const stepTotal = Object.values(metrics.abandonmentByStep).reduce(
        (sum, n) => sum + n,
        0,
      );

      expect(stepTotal).toBe(metrics.explanationsAbandoned);
      expect(metrics.explanationsAbandoned).toBe(count);
    },
  );
});

describe("Property: stepProgression does NOT bound itself to opened-session count (best-effort delivery)", () => {
  it("counts a step_viewed session even when its explanation_opened row was never persisted", () => {
    // The Stage 6.4A audit is explicit: an opened delivery can fail
    // independently of a later step_viewed delivery succeeding. This test
    // exists specifically to keep that finding true in code, not just in
    // the audit document — asserting the opposite ("stepProgression <=
    // explanationsOpened") would be asserting something the frozen
    // contracts do not actually guarantee.
    const events: QuestionExplainerMetricEvent[] = [
      {
        sessionId: "s1",
        eventType: "step_viewed",
        step: "acknowledge",
        occurredAt: "2026-01-15T10:00:00.000Z",
      },
    ];

    const metrics = calculateQuestionExplainerMetrics(events);

    expect(metrics.explanationsOpened).toBe(0);
    expect(metrics.stepProgression.acknowledge).toBe(1);
    expect(metrics.stepProgression.acknowledge).toBeGreaterThan(
      metrics.explanationsOpened,
    );
  });
});
