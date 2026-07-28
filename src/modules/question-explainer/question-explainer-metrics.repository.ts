import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  QuestionExplainerMetricEvent,
  ReportingWindow,
} from "./question-explainer-metrics.types";

export class QuestionExplainerMetricsRepositoryError extends Error {}

export interface QuestionExplainerMetricsRepository {
  /**
   * Raw, ordered facts only — no aggregation (TDS-008 §11.2: reporting
   * follows the platform's existing repository → pure-calculation-service
   * convention, never SQL-side GROUP BY/views/RPCs). No join to
   * question_attempts/question_bank/mission_items/missions — none of the
   * frozen §11.5 metrics needs one.
   */
  getEventsForLearner(
    learnerId: string,
    window?: ReportingWindow,
  ): Promise<QuestionExplainerMetricEvent[]>;
}

const SELECT_COLUMNS =
  "session_id,event_type,step,last_step,duration_ms,occurred_at";

interface RawLearningEventRow {
  session_id: string;
  event_type: QuestionExplainerMetricEvent["eventType"];
  step: string | null;
  last_step: string | null;
  duration_ms: number | null;
  occurred_at: string;
}

function toEvent(row: RawLearningEventRow): QuestionExplainerMetricEvent {
  return {
    sessionId: row.session_id,
    eventType: row.event_type,
    step: (row.step ?? undefined) as QuestionExplainerMetricEvent["step"],
    lastStep: (row.last_step ??
      undefined) as QuestionExplainerMetricEvent["lastStep"],
    durationMs: row.duration_ms ?? undefined,
    occurredAt: row.occurred_at,
  };
}

export class SupabaseQuestionExplainerMetricsRepository implements QuestionExplainerMetricsRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async getEventsForLearner(
    learnerId: string,
    window?: ReportingWindow,
  ): Promise<QuestionExplainerMetricEvent[]> {
    let query = this.supabase
      .from("learning_events")
      .select(SELECT_COLUMNS)
      .eq("learner_id", learnerId)
      // occurred_at first (the reporting clock, TDS-008 §11.7), created_at
      // as a deterministic tiebreaker for events with an identical
      // client-observed timestamp — never the sole sort key.
      .order("occurred_at", { ascending: true })
      .order("created_at", { ascending: true });

    // from <= occurred_at < to (TDS-008 §11 window semantics) — each bound
    // independent, applied only when supplied.
    if (window?.from) {
      query = query.gte("occurred_at", window.from);
    }
    if (window?.to) {
      query = query.lt("occurred_at", window.to);
    }

    const { data, error } = await query;

    if (error) {
      throw new QuestionExplainerMetricsRepositoryError(
        `Unable to load learning events: ${error.message}`,
      );
    }

    return ((data ?? []) as unknown as RawLearningEventRow[]).map(toEvent);
  }
}
