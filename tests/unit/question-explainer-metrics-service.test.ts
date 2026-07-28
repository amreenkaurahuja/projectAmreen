import { describe, expect, it } from "vitest";
import {
  calculateQuestionExplainerMetrics,
  countUniqueLearnersUsingExplanations,
} from "@/modules/question-explainer/question-explainer-metrics.service";
import type {
  LearnerMetricEvent,
  QuestionExplainerMetricEvent,
} from "@/modules/question-explainer/question-explainer-metrics.types";

function opened(
  sessionId: string,
  occurredAt = "2026-01-01T00:00:00.000Z",
): QuestionExplainerMetricEvent {
  return { sessionId, eventType: "explanation_opened", occurredAt };
}
function stepViewed(
  sessionId: string,
  step: NonNullable<QuestionExplainerMetricEvent["step"]>,
  occurredAt = "2026-01-01T00:00:01.000Z",
): QuestionExplainerMetricEvent {
  return { sessionId, eventType: "step_viewed", step, occurredAt };
}
function completed(
  sessionId: string,
  durationMs?: number,
  occurredAt = "2026-01-01T00:00:10.000Z",
): QuestionExplainerMetricEvent {
  return {
    sessionId,
    eventType: "explanation_completed",
    durationMs,
    occurredAt,
  };
}
function abandoned(
  sessionId: string,
  lastStep: NonNullable<QuestionExplainerMetricEvent["lastStep"]>,
  durationMs?: number,
  occurredAt = "2026-01-01T00:00:05.000Z",
): QuestionExplainerMetricEvent {
  return {
    sessionId,
    eventType: "explanation_abandoned",
    lastStep,
    durationMs,
    occurredAt,
  };
}

describe("calculateQuestionExplainerMetrics", () => {
  it("returns all-zero/empty/null metrics for an empty input", () => {
    const result = calculateQuestionExplainerMetrics([]);

    expect(result).toEqual({
      explanationsOpened: 0,
      explanationsCompleted: 0,
      explanationsAbandoned: 0,
      completionRate: 0,
      abandonmentRate: 0,
      abandonmentByStep: {},
      stepProgression: {},
      medianElapsedFlowTimeMs: null,
      p90ElapsedFlowTimeMs: null,
    });
  });

  it("computes a normal completed flow", () => {
    const events = [
      opened("s1"),
      stepViewed("s1", "acknowledge"),
      stepViewed("s1", "explain"),
      stepViewed("s1", "worked_example"),
      stepViewed("s1", "next_step"),
      completed("s1", 5000),
    ];

    const result = calculateQuestionExplainerMetrics(events);

    expect(result.explanationsOpened).toBe(1);
    expect(result.explanationsCompleted).toBe(1);
    expect(result.explanationsAbandoned).toBe(0);
    expect(result.completionRate).toBe(1);
    expect(result.abandonmentRate).toBe(0);
    expect(result.stepProgression).toEqual({
      acknowledge: 1,
      explain: 1,
      worked_example: 1,
      next_step: 1,
    });
    expect(result.medianElapsedFlowTimeMs).toBe(5000);
  });

  it("computes a normal abandoned flow", () => {
    const events = [
      opened("s1"),
      stepViewed("s1", "acknowledge"),
      stepViewed("s1", "explain"),
      abandoned("s1", "explain", 1200),
    ];

    const result = calculateQuestionExplainerMetrics(events);

    expect(result.explanationsOpened).toBe(1);
    expect(result.explanationsCompleted).toBe(0);
    expect(result.explanationsAbandoned).toBe(1);
    expect(result.completionRate).toBe(0);
    expect(result.abandonmentRate).toBe(1);
    expect(result.abandonmentByStep).toEqual({ explain: 1 });
  });

  it("computes mixed completed and abandoned flows across sessions", () => {
    const events = [
      opened("s1"),
      completed("s1", 4000),
      opened("s2"),
      abandoned("s2", "acknowledge", 500),
      opened("s3"),
      abandoned("s3", "worked_example", 3000),
    ];

    const result = calculateQuestionExplainerMetrics(events);

    expect(result.explanationsOpened).toBe(3);
    expect(result.explanationsCompleted).toBe(1);
    expect(result.explanationsAbandoned).toBe(2);
    expect(result.completionRate).toBeCloseTo(1 / 3);
    expect(result.abandonmentRate).toBeCloseTo(2 / 3);
    expect(result.abandonmentByStep).toEqual({
      acknowledge: 1,
      worked_example: 1,
    });
  });

  it("keeps completionRate/abandonmentRate at 0 (not NaN/Infinity) for orphaned terminal events with zero opened", () => {
    const events = [completed("s1", 1000), abandoned("s2", "explain", 500)];

    const result = calculateQuestionExplainerMetrics(events);

    expect(result.explanationsOpened).toBe(0);
    expect(result.explanationsCompleted).toBe(1);
    expect(result.explanationsAbandoned).toBe(1);
    expect(result.completionRate).toBe(0);
    expect(result.abandonmentRate).toBe(0);
    expect(Number.isNaN(result.completionRate)).toBe(false);
    expect(Number.isFinite(result.completionRate)).toBe(true);
  });

  it("does not clamp rates above 1 when best-effort delivery produces more terminal events than opened events in the window", () => {
    // Two abandoned deliveries observed, only one opened delivery observed
    // (the other opened request presumably failed) — the window must not
    // hide that incompleteness by capping the rate at 1.
    const events = [
      opened("s1"),
      abandoned("s1", "explain", 500),
      abandoned("s2", "acknowledge", 200),
    ];

    const result = calculateQuestionExplainerMetrics(events);

    expect(result.explanationsOpened).toBe(1);
    expect(result.explanationsAbandoned).toBe(2);
    expect(result.abandonmentRate).toBe(2);
  });

  it("does not affect completed/abandoned counts for an opened session with no terminal event (incomplete session)", () => {
    const events = [opened("s1"), stepViewed("s1", "acknowledge")];

    const result = calculateQuestionExplainerMetrics(events);

    expect(result.explanationsOpened).toBe(1);
    expect(result.explanationsCompleted).toBe(0);
    expect(result.explanationsAbandoned).toBe(0);
  });

  it("counts a step reached more than once in the same session only once", () => {
    const events = [
      opened("s1"),
      stepViewed("s1", "acknowledge"),
      stepViewed("s1", "acknowledge"),
      stepViewed("s1", "acknowledge"),
    ];

    const result = calculateQuestionExplainerMetrics(events);

    expect(result.stepProgression).toEqual({ acknowledge: 1 });
  });

  it("counts the same step across separate sessions separately", () => {
    const events = [
      opened("s1"),
      stepViewed("s1", "acknowledge"),
      opened("s2"),
      stepViewed("s2", "acknowledge"),
    ];

    const result = calculateQuestionExplainerMetrics(events);

    expect(result.stepProgression).toEqual({ acknowledge: 2 });
  });

  it("does not infer a missing intermediate step from a later one being observed", () => {
    // "explain" was never recorded (e.g. its delivery failed) even though
    // "worked_example" was — the progression must not backfill "explain".
    const events = [
      opened("s1"),
      stepViewed("s1", "acknowledge"),
      stepViewed("s1", "worked_example"),
    ];

    const result = calculateQuestionExplainerMetrics(events);

    expect(result.stepProgression).toEqual({
      acknowledge: 1,
      worked_example: 1,
    });
    expect(result.stepProgression.explain).toBeUndefined();
  });

  it("computes the median for an odd number of durations (middle value)", () => {
    const events = [
      completed("s1", 1000),
      completed("s2", 5000),
      completed("s3", 3000),
    ];

    const result = calculateQuestionExplainerMetrics(events);

    expect(result.medianElapsedFlowTimeMs).toBe(3000);
  });

  it("computes the median for an even number of durations (mean of the two middle values)", () => {
    const events = [
      completed("s1", 1000),
      completed("s2", 2000),
      completed("s3", 3000),
      completed("s4", 4000),
    ];

    const result = calculateQuestionExplainerMetrics(events);

    expect(result.medianElapsedFlowTimeMs).toBe(2500);
  });

  it("computes p90 (nearest-rank) for one, two and several samples", () => {
    expect(
      calculateQuestionExplainerMetrics([completed("s1", 1000)])
        .p90ElapsedFlowTimeMs,
    ).toBe(1000);

    expect(
      calculateQuestionExplainerMetrics([
        completed("s1", 1000),
        completed("s2", 2000),
      ]).p90ElapsedFlowTimeMs,
    ).toBe(2000); // rank = ceil(0.9*2) = 2 -> sorted[1]

    const ten = Array.from({ length: 10 }, (_, i) =>
      completed(`s${i}`, (i + 1) * 100),
    ); // durations 100..1000
    expect(calculateQuestionExplainerMetrics(ten).p90ElapsedFlowTimeMs).toBe(
      900,
    ); // rank = ceil(9) = 9 -> sorted[8] = 900
  });

  it("excludes terminal events with an absent duration from median/p90", () => {
    const events = [completed("s1", undefined), completed("s2", 2000)];

    const result = calculateQuestionExplainerMetrics(events);

    expect(result.medianElapsedFlowTimeMs).toBe(2000);
    expect(result.p90ElapsedFlowTimeMs).toBe(2000);
  });

  it("includes a zero duration (not falsy-excluded)", () => {
    const events = [completed("s1", 0), completed("s2", 100)];

    const result = calculateQuestionExplainerMetrics(events);

    expect(result.medianElapsedFlowTimeMs).toBe(50);
  });

  it("includes a very large duration with no cap", () => {
    const hugeDuration = 999_999_999;
    const events = [completed("s1", hugeDuration)];

    const result = calculateQuestionExplainerMetrics(events);

    expect(result.medianElapsedFlowTimeMs).toBe(hugeDuration);
    expect(result.p90ElapsedFlowTimeMs).toBe(hugeDuration);
  });

  it("does not mutate the input collection", () => {
    const events = [
      opened("s1"),
      completed("s1", 3000),
      abandoned("s2", "explain", 1000),
    ];
    const originalOrder = [...events];
    Object.freeze(events);

    expect(() => calculateQuestionExplainerMetrics(events)).not.toThrow();
    expect(events).toEqual(originalOrder);
  });
});

describe("countUniqueLearnersUsingExplanations", () => {
  function learnerOpened(
    learnerId: string,
    sessionId: string,
  ): LearnerMetricEvent {
    return {
      learnerId,
      sessionId,
      eventType: "explanation_opened",
      occurredAt: "2026-01-01T00:00:00.000Z",
    };
  }
  function learnerStepViewed(
    learnerId: string,
    sessionId: string,
  ): LearnerMetricEvent {
    return {
      learnerId,
      sessionId,
      eventType: "step_viewed",
      step: "acknowledge",
      occurredAt: "2026-01-01T00:00:01.000Z",
    };
  }

  it("returns 0 for an empty input", () => {
    expect(countUniqueLearnersUsingExplanations([])).toBe(0);
  });

  it("counts distinct learners with at least one explanation_opened event", () => {
    const events = [
      learnerOpened("learner-1", "s1"),
      learnerOpened("learner-2", "s2"),
    ];

    expect(countUniqueLearnersUsingExplanations(events)).toBe(2);
  });

  it("deduplicates repeated opened events from the same learner", () => {
    const events = [
      learnerOpened("learner-1", "s1"),
      learnerOpened("learner-1", "s2"),
    ];

    expect(countUniqueLearnersUsingExplanations(events)).toBe(1);
  });

  it("does not count a learner whose only events are non-opened (e.g. an orphaned step_viewed)", () => {
    const events = [learnerStepViewed("learner-1", "s1")];

    expect(countUniqueLearnersUsingExplanations(events)).toBe(0);
  });

  it("does not mutate the input collection", () => {
    const events = [learnerOpened("learner-1", "s1")];
    Object.freeze(events);

    expect(() => countUniqueLearnersUsingExplanations(events)).not.toThrow();
  });
});
