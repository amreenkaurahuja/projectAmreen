import type { LearningEvent } from "./explanation-event.types";

/**
 * TDS-008 §7's publisher boundary. question-explainer-flow.tsx depends only
 * on this interface — it never knows whether events are dropped, logged, or
 * delivered over HTTP to a persisted store. That delivery mechanism is
 * explicitly Stage 6.3, not this stage.
 */
export interface LearningEventPublisher {
  publish(event: LearningEvent): void;
}

/**
 * The only implementation Stage 6.1 ships. Doing nothing is what makes
 * AP-1 ("metrics must never influence behaviour") true by construction
 * rather than by convention — a component wired to this publisher behaves
 * identically to one with no instrumentation at all, which is exactly the
 * safe default until Stage 6.3 has a real delivery path and TDS-008 §12's
 * feature flag has something to gate.
 */
export const noOpLearningEventPublisher: LearningEventPublisher = {
  publish() {},
};
