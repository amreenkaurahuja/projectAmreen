import { AUDIENCES } from "@/modules/ai/coach/audiences";

// The AI-facing DTO surface for Capability 1 of the AI Learning Companion
// (TDS-007 / PS-007). Mirrors src/modules/ai/coach/coach.types.ts's role for
// the Coach: everything below this module — repositories, the database — is
// invisible past ExplanationContextBuilder; a QuestionExplanationContext is
// the only thing that ever crosses that boundary (docs/AI_CONSTITUTION.md
// Rule 5). Reuses the Coach's audience concept directly rather than
// duplicating the "learner" | "parent" union a second time.

export type ExplainerAudience = (typeof AUDIENCES)[number];

/**
 * v2 (Stage 2): adds promptVersion, followUpAvailable, and
 * followUpQuestionPrompt to v1's shape — a genuine DTO shape change (the
 * schemaVersion PS-007 §11 says should participate in cache invalidation
 * alongside promptVersion and the context hash), not a patch to v1.
 */
export const EXPLANATION_CONTEXT_SCHEMA_VERSION =
  "question-explanation-context-v2" as const;

/**
 * Deliberately smaller than TDS-007 §7's illustrative contract: no
 * questionId/attemptId/learnerId (server-side only, never crosses the AI
 * boundary — TDS-007 §8), and no misconceptionTags/curriculumNotes/
 * deterministicWorking, since no source data for them exists yet
 * (TDS-007 Stage 1 decision 4 — reflect the actual data model, not a future
 * one). A follow-up question's id is likewise attached to the result after
 * the fact, by QuestionExplainerService — only its prompt text (needed so
 * the model can refer to it naturally, per PS-007 §4's example) crosses the
 * boundary, never its id.
 */
export interface QuestionExplanationContext {
  schemaVersion: typeof EXPLANATION_CONTEXT_SCHEMA_VERSION;
  /** See explanation-context-builder.ts's PROMPT_VERSION for the single source of truth. */
  promptVersion: string;
  audience: ExplainerAudience;
  learnerDisplayName: string;
  subject: string;
  skill: string;
  prompt: string;
  learnerAnswerLabel: string;
  correctAnswerLabel: string;
  /** question_bank.explanation — may be empty (DB default ''); the primary deterministic teaching source when present. */
  authoredExplanation: string;
  followUpAvailable: boolean;
  /** Present only when followUpAvailable is true. */
  followUpQuestionPrompt?: string;
}

export interface QuestionExplanationNextAction {
  type: "linked-question" | "review-skill";
  text: string;
}

export interface QuestionExplanationWorkedExample {
  problem: string;
  steps: string[];
  answer: string;
}

/**
 * The canonical response shape (PS-007 §5) — what a validated AI response
 * must parse into, and what the deterministic fallback (Stage 1's
 * buildDeterministicExplanation, still the mandatory fallback per Rule 14)
 * now produces directly, so a caller never needs to know which path
 * produced it. No source-provenance field on this type itself — that lives
 * one level up, in QuestionExplainerService's result (mirrors
 * CoachMessageContent's source field living in the cache/service layer, not
 * on CoachResponse itself).
 */
export interface QuestionExplanationResponse {
  acknowledgement: string;
  mistakeExplanation: string;
  keyConcept: string;
  workedExample: QuestionExplanationWorkedExample;
  nextAction: QuestionExplanationNextAction;
}
