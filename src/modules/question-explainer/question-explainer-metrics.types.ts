import type { ExplanationStep } from "./explanation-event.types";

// TDS-008 §11 — Stage 6.4B read model. Deliberately not the same shape as
// LearningEvent (Stage 6.1/6.3's publish-time union): that type exists to
// describe one educational occurrence at the moment it's created, with
// each variant's fields exact and non-overlapping (mirrored by the
// learning_events CHECK constraint). This type describes a *persisted
// row already read back*, flattened across all four event types — the
// repository's read-only projection, not a write-time contract.

export type QuestionExplainerMetricEventType =
  | "explanation_opened"
  | "step_viewed"
  | "explanation_completed"
  | "explanation_abandoned";

/**
 * The narrow set of persisted fields the calculation service needs —
 * never `attemptId`/`eventId` (unused by any frozen §14 metric), never
 * `learnerId` (this projection is already learner-scoped by the
 * repository query; see LearnerMetricEvent below for the one function
 * that needs it).
 */
export interface QuestionExplainerMetricEvent {
  sessionId: string;
  eventType: QuestionExplainerMetricEventType;
  step?: ExplanationStep;
  lastStep?: ExplanationStep;
  durationMs?: number;
  occurredAt: string;
}

/** Adds learnerId — only for calculations that must distinguish learners (countUniqueLearnersUsingExplanations), never the single-learner report. */
export interface LearnerMetricEvent extends QuestionExplainerMetricEvent {
  learnerId: string;
}

/**
 * `from <= occurred_at < to`. Both bounds optional and independent —
 * omitting one leaves that side unbounded. ISO timestamps only (never
 * date-only values): TDS-008 §11.7 uses `occurred_at` (client-observed
 * time) as the reporting clock, and `occurred_at` is itself a full
 * timestamp, not a calendar date.
 */
export interface ReportingWindow {
  from?: string;
  to?: string;
}

/** TDS-008 §11.5 — the frozen Release 0.7 metric set. Every field here has a settled numerator/denominator/grouping rule; nothing speculative. */
export interface QuestionExplainerMetrics {
  explanationsOpened: number;
  explanationsCompleted: number;
  explanationsAbandoned: number;
  /** 0 when explanationsOpened is 0. Not clamped — may exceed 1 if best-effort delivery produced more terminal events than opened events. */
  completionRate: number;
  /** Same rules as completionRate. */
  abandonmentRate: number;
  /** Keyed by ExplanationStep. No "unknown" bucket — lastStep is a required field on every persisted explanation_abandoned row (TS union + DB CHECK constraint both guarantee it). */
  abandonmentByStep: Record<string, number>;
  /** Keyed by ExplanationStep — count of *unique sessionIds* that viewed each step at least once, not raw step_viewed row counts, and not a furthest-step funnel inference. */
  stepProgression: Record<string, number>;
  medianElapsedFlowTimeMs: number | null;
  p90ElapsedFlowTimeMs: number | null;
}
