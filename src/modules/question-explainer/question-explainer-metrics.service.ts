import type {
  LearnerMetricEvent,
  QuestionExplainerMetricEvent,
  QuestionExplainerMetrics,
} from "./question-explainer-metrics.types";

// TDS-008 §11.2 — pure calculation layer: plain data in, plain data out.
// No Supabase, no clock, no environment access, no mutation of the input.

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Nearest-rank percentile: rank = ceil(0.9 * n), value = sorted[rank - 1]. No interpolation — no existing convention in this codebase establishes one. */
function p90(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil(0.9 * sorted.length);
  return sorted[rank - 1]!;
}

function isFiniteDuration(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** TDS-008 §11.5 — computes the frozen Release 0.7 metric set from one learner's raw, ordered event rows. */
export function calculateQuestionExplainerMetrics(
  events: readonly QuestionExplainerMetricEvent[],
): QuestionExplainerMetrics {
  const opened = events.filter((e) => e.eventType === "explanation_opened");
  const completed = events.filter(
    (e) => e.eventType === "explanation_completed",
  );
  const abandoned = events.filter(
    (e) => e.eventType === "explanation_abandoned",
  );

  const explanationsOpened = opened.length;
  const explanationsCompleted = completed.length;
  const explanationsAbandoned = abandoned.length;

  // Raw decimal rates, never clamped — best-effort delivery (TDS-008 §10)
  // can produce more observed terminal events than opened events for a
  // window; clamping would conceal that incomplete-delivery evidence. A
  // rate above 1.0 is not an impossible educational state — it's a
  // truthful signal that some opened deliveries were lost. Do not "fix"
  // this by capping at 1.0.
  const completionRate =
    explanationsOpened === 0 ? 0 : explanationsCompleted / explanationsOpened;
  const abandonmentRate =
    explanationsOpened === 0 ? 0 : explanationsAbandoned / explanationsOpened;

  const abandonmentByStep: Record<string, number> = {};
  for (const event of abandoned) {
    // lastStep is a required field on every persisted explanation_abandoned
    // row (ExplanationAbandonedEvent + the learning_events CHECK
    // constraint both guarantee it) — no "unknown" bucket to fabricate.
    const step = event.lastStep!;
    abandonmentByStep[step] = (abandonmentByStep[step] ?? 0) + 1;
  }

  // Unique sessionIds reaching each step, not raw step_viewed counts and
  // not a furthest-step funnel inference — a session that views the same
  // step twice (e.g. reopening) counts once for that step; missing steps
  // stay missing rather than being inferred as reached.
  const stepProgression: Record<string, number> = {};
  const sessionsSeenPerStep = new Map<string, Set<string>>();
  for (const event of events) {
    if (event.eventType !== "step_viewed") continue;
    const step = event.step!; // required field on StepViewedEvent, schema-guaranteed
    const seen = sessionsSeenPerStep.get(step) ?? new Set<string>();
    if (!seen.has(event.sessionId)) {
      seen.add(event.sessionId);
      stepProgression[step] = (stepProgression[step] ?? 0) + 1;
    }
    sessionsSeenPerStep.set(step, seen);
  }

  // durationMs from completed and abandoned terminal events only — never
  // reconstructed from timestamps, never capped (LDS-002 §6 asked for a
  // cap; TDS-008 §11.6 explicitly declined to set one for Release 0.7).
  const durations = [...completed, ...abandoned]
    .map((event) => event.durationMs)
    .filter(isFiniteDuration);

  return {
    explanationsOpened,
    explanationsCompleted,
    explanationsAbandoned,
    completionRate,
    abandonmentRate,
    abandonmentByStep,
    stepProgression,
    medianElapsedFlowTimeMs: median(durations),
    p90ElapsedFlowTimeMs: p90(durations),
  };
}

/** Distinct learnerIds with at least one explanation_opened event — an orphaned terminal event (opened row never delivered) must not independently establish usage. Intended for a future multi-learner aggregate input, not the single-learner report. */
export function countUniqueLearnersUsingExplanations(
  events: readonly LearnerMetricEvent[],
): number {
  const learners = new Set<string>();
  for (const event of events) {
    if (event.eventType === "explanation_opened") {
      learners.add(event.learnerId);
    }
  }
  return learners.size;
}
