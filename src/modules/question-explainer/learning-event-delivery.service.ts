import type { LearningEvent } from "./explanation-event.types";
import type {
  InsertEventOutcome,
  LearningEventRepository,
} from "./learning-event.repository";

/**
 * TDS-008 §10.5 — delivery semantics live here, not in the route (which
 * only authenticates, validates, and maps HTTP) or the repository (which
 * only knows column names and how to detect a duplicate). This is the one
 * place "deliver an educational event" is defined: assemble the complete
 * persistence record from an authenticated learnerId + a validated
 * LearningEvent, then hand it to the repository.
 *
 * `learnerId` always comes from the caller (the route, which resolves it
 * server-side from attemptId — TDS-008 §10.3/§10.5) — never from the event
 * itself. There is nothing to "ignore": `LearningEvent` has no learnerId
 * field on any variant, so a client-supplied one cannot reach this service
 * even structurally, let alone override anything.
 */
export class LearningEventDeliveryService {
  constructor(private readonly repository: LearningEventRepository) {}

  async deliver(params: {
    learnerId: string;
    event: LearningEvent;
  }): Promise<InsertEventOutcome> {
    const { event, learnerId } = params;

    return this.repository.insertEvent({
      eventId: event.eventId,
      learnerId,
      attemptId: event.attemptId,
      sessionId: event.sessionId,
      eventType: event.eventType,
      step: event.eventType === "step_viewed" ? event.step : null,
      lastStep:
        event.eventType === "explanation_abandoned" ? event.lastStep : null,
      exitMethod:
        event.eventType === "explanation_abandoned" ? event.exitMethod : null,
      durationMs:
        event.eventType === "explanation_completed" ||
        event.eventType === "explanation_abandoned"
          ? event.durationMs
          : null,
      occurredAt: event.occurredAt,
    });
  }
}
