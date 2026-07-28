// TDS-008 §6/§10/§11 — the canonical educational-event vocabulary. Public
// contract names (worked_example, next_step) are deliberately richer than
// question-explainer-flow.tsx's internal Screen union ("example", "next") —
// event schemas are an external contract, component state names are an
// implementation detail (TDS-008's explicit rationale for keeping both
// rather than renaming the component's internal state to match).

export type ExplanationStep =
  "acknowledge" | "explain" | "worked_example" | "next_step";

export type ExplanationExitMethod =
  "escape" | "close_button" | "backdrop" | "navigation" | "unmount" | "error";

/**
 * No `learnerId` field, deliberately — the component that emits these
 * events (question-explainer-flow.tsx) never receives one (TDS-007 Stage
 * 4's client contract intentionally excludes it; the API resolves it
 * server-side from attemptId). A Stage 6.3 delivery endpoint should resolve
 * learnerId from attemptId the same way
 * QuestionExplainerRepository.getLearnerIdForAttempt already does, not
 * receive it from the client. Adding a learnerId prop to the component
 * just to populate this field would reintroduce exactly what Stage 4
 * deliberately kept out of the client.
 *
 * No `explanationId` field either, for now — `POST
 * /api/v1/question-explanations`'s response contract (TDS-007 Stage 4) has
 * no id identifying a specific explanation instance. LDS-002 §5.1 is
 * explicit that this event contract "must not fabricate it," so every
 * event below omits it rather than send `undefined` for a field that looks
 * like it should exist. Revisit once Stage 6.2/6.3 decides whether the
 * persisted explanation record needs a client-visible id.
 */
interface LearningEventBase {
  attemptId: string;
  sessionId: string;
  occurredAt: string;
}

export interface ExplanationOpenedEvent extends LearningEventBase {
  eventType: "explanation_opened";
}

export interface StepViewedEvent extends LearningEventBase {
  eventType: "step_viewed";
  step: ExplanationStep;
}

export interface ExplanationCompletedEvent extends LearningEventBase {
  eventType: "explanation_completed";
  durationMs: number;
}

export interface ExplanationAbandonedEvent extends LearningEventBase {
  eventType: "explanation_abandoned";
  /**
   * The last educational step actually *presented* to the learner — not
   * the step the system was attempting to load. A failed attempt to enter
   * a step (exitMethod: "error") does not advance lastStep, since the
   * learner never saw that step's content; exitMethod already carries the
   * fact that loading failed, so lastStep stays analytically honest about
   * how far the learner actually got.
   */
  lastStep: ExplanationStep;
  exitMethod: ExplanationExitMethod;
  durationMs: number;
}

export type LearningEvent =
  | ExplanationOpenedEvent
  | StepViewedEvent
  | ExplanationCompletedEvent
  | ExplanationAbandonedEvent;
