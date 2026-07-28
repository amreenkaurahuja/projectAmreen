import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ExplanationExitMethod,
  ExplanationStep,
} from "./explanation-event.types";

export class LearningEventRepositoryError extends Error {}

export type InsertEventOutcome = "inserted" | "alreadyExists";

/** The complete, already-assembled record to persist — learnerId has been resolved server-side and merged in by the caller (LearningEventDeliveryService); this repository only translates it to columns and inserts. */
export interface SaveLearningEventParams {
  eventId: string;
  learnerId: string;
  attemptId: string;
  sessionId: string;
  eventType:
    | "explanation_opened"
    | "step_viewed"
    | "explanation_completed"
    | "explanation_abandoned";
  step: ExplanationStep | null;
  lastStep: ExplanationStep | null;
  exitMethod: ExplanationExitMethod | null;
  durationMs: number | null;
  occurredAt: string;
}

export interface LearningEventRepository {
  /**
   * Append-only insert into learning_events (0012/0013). A unique-
   * constraint conflict on event_id is not an error — TDS-008 §10.9 is
   * explicit that a duplicate eventId means this exact educational
   * occurrence was already durably recorded, so redelivery resolves to
   * "alreadyExists" rather than throwing. Never an upsert: the append-only
   * model has no update path, so a conflict is detected and reported, not
   * resolved by overwriting.
   */
  insertEvent(params: SaveLearningEventParams): Promise<InsertEventOutcome>;
}

export class SupabaseLearningEventRepository implements LearningEventRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async insertEvent(
    params: SaveLearningEventParams,
  ): Promise<InsertEventOutcome> {
    const { error } = await this.supabase.from("learning_events").insert({
      event_id: params.eventId,
      learner_id: params.learnerId,
      attempt_id: params.attemptId,
      session_id: params.sessionId,
      event_type: params.eventType,
      step: params.step,
      last_step: params.lastStep,
      exit_method: params.exitMethod,
      duration_ms: params.durationMs,
      occurred_at: params.occurredAt,
    });

    if (error) {
      if (error.code === "23505") {
        return "alreadyExists";
      }
      throw new LearningEventRepositoryError(
        `Unable to insert learning event: ${error.message}`,
      );
    }

    return "inserted";
  }
}
