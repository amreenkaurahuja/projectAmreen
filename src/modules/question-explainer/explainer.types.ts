import { AUDIENCES } from "@/modules/ai/coach/audiences";

// The AI-facing DTO surface for Capability 1 of the AI Learning Companion
// (TDS-007). Mirrors src/modules/ai/coach/coach.types.ts's role for the
// Coach: everything below this module — repositories, the database — is
// invisible past ExplanationContextBuilder; a QuestionExplanationContext is
// the only thing that ever crosses that boundary (docs/AI_CONSTITUTION.md
// Rule 5). Reuses the Coach's audience concept directly rather than
// duplicating the "learner" | "parent" union a second time.

export type ExplainerAudience = (typeof AUDIENCES)[number];

export const EXPLANATION_CONTEXT_SCHEMA_VERSION =
  "question-explanation-context-v1" as const;

/**
 * Deliberately smaller than TDS-007 §7's illustrative contract: no
 * questionId/attemptId/learnerId (server-side only, never crosses the AI
 * boundary — TDS-007 §8), and no misconceptionTags/curriculumNotes/
 * deterministicWorking, since no source data for them exists yet
 * (TDS-007 Stage 1 decision 4 — reflect the actual data model, not a future
 * one). A follow-up question's id is likewise attached to the response
 * after the fact, by QuestionExplainerService, never included here.
 */
export interface QuestionExplanationContext {
  schemaVersion: typeof EXPLANATION_CONTEXT_SCHEMA_VERSION;
  audience: ExplainerAudience;
  learnerDisplayName: string;
  subject: string;
  skill: string;
  prompt: string;
  learnerAnswerLabel: string;
  correctAnswerLabel: string;
  /** question_bank.explanation — may be empty (DB default ''); the primary deterministic teaching source when present. */
  authoredExplanation: string;
}

export interface QuestionExplanationNextAction {
  type: "linked-question" | "review-skill";
  text: string;
  /** Present only when a deterministic follow-up question was found — see adaptive-learning/follow-up-selector.ts. */
  questionId?: string;
}

/**
 * The Stage 1 (deterministic-only) explanation shape: five parts per the
 * TDS-007 Stage 1 refinement (acknowledgement, what happened, key concept,
 * worked explanation, next action). Not the eventual AI response contract —
 * that's Stage 2 design work, out of scope here.
 */
export interface DeterministicExplanation {
  acknowledgement: string;
  whatHappened: string;
  keyConcept: string;
  workedExplanation: string;
  nextAction: QuestionExplanationNextAction;
  /** Whether keyConcept/workedExplanation drew on question_bank.explanation ("authored") or a generic skill-name template ("generic", used only when the authored explanation is empty). */
  source: "authored" | "generic";
}
