import { logger } from "@/lib/observability/logger";
import type { LearningEvent } from "./explanation-event.types";
import type { LearningEventPublisher } from "./explanation-event-publisher";

const ENDPOINT = "/api/v1/learning-events";

/**
 * TDS-008 Stage 6.3B — the first non-no-op LearningEventPublisher. One
 * `fetch` per event, fire-and-forget: `publish()` itself is synchronous
 * (returns nothing for the caller to await or catch), and the request's
 * outcome — success, a non-2xx response, or a network error — is only
 * ever reported through the existing `logger` path, never surfaced to the
 * caller. No retry, no batching, no queue: exactly one delivery attempt
 * per invocation (§10.10/§10.11). This preserves AP-1 by construction —
 * there is no code path by which a metrics failure can reach the
 * Question Explainer flow, because `publish()` never returns anything
 * that flow could inspect or await.
 */
export const httpLearningEventPublisher: LearningEventPublisher = {
  publish(event: LearningEvent) {
    fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(event),
    })
      .then((response) => {
        if (!response.ok) {
          logger.warn("learning-event.delivery-rejected", {
            eventId: event.eventId,
            eventType: event.eventType,
            status: response.status,
          });
        }
      })
      .catch((error: unknown) => {
        logger.warn("learning-event.delivery-error", {
          eventId: event.eventId,
          eventType: event.eventType,
          error: error instanceof Error ? error.message : String(error),
        });
      });
  },
};
