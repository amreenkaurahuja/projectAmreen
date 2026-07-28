import { validateQuestionExplanationContext } from "./explanation-context-validator";
import {
  EXPLANATION_CONTEXT_SCHEMA_VERSION,
  type ExplainerAudience,
  type QuestionExplanationContext,
} from "./explainer.types";
import type { ExplanationSourceData } from "./explainer.repository";

/**
 * The single source of truth for the Question Explainer's prompt contract
 * version — the only place it's defined, mirroring
 * ai/coach/context-builder.ts's PROMPT_VERSION exactly. It's embedded in
 * every QuestionExplanationContext, which means it's included in
 * explanation-hash.ts's hash: bumping this value (e.g. to "v2") is what
 * actually invalidates previously-cached responses once Stage 3 adds
 * persistence, since a changed hash is a guaranteed cache miss. The
 * audience prompt builders (learner-prompt.ts, parent-prompt.ts)
 * deliberately do not define their own version constants — both audiences
 * share one prompt-contract version, versioned together here, per PS-007
 * §11's QUESTION_EXPLAINER_PROMPT_VERSION.
 */
const PROMPT_VERSION = "v1";

export class ExplanationContextValidationError extends Error {
  constructor(
    message: string,
    /** The rejected candidate — kept so a caller could still build a fallback from it, mirroring ai/coach/context-builder.ts's ContextBuilderValidationError. Never sent to a prompt or the gateway. */
    readonly candidate: QuestionExplanationContext,
  ) {
    super(message);
    this.name = "ExplanationContextValidationError";
  }
}

export interface BuildExplanationContextParams {
  audience: ExplainerAudience;
  learnerDisplayName: string;
  source: ExplanationSourceData;
  /** The deterministically selected follow-up question's prompt text, or null if none was found — see adaptive-learning/follow-up-selector.ts. Only the text crosses the boundary; the id never does. */
  followUpQuestionPrompt: string | null;
}

/**
 * Pure — unlike ai/coach/context-builder.ts's ContextBuilder, this takes
 * already-fetched data rather than calling a repository itself, since
 * QuestionExplainerService already has it by the time it builds a context.
 * Throws ExplanationContextValidationError if the assembled DTO fails
 * validation.
 */
export function buildQuestionExplanationContext(
  params: BuildExplanationContextParams,
): QuestionExplanationContext {
  const candidate: QuestionExplanationContext = {
    schemaVersion: EXPLANATION_CONTEXT_SCHEMA_VERSION,
    promptVersion: PROMPT_VERSION,
    audience: params.audience,
    learnerDisplayName: params.learnerDisplayName,
    subject: params.source.subjectName,
    skill: params.source.skillName,
    prompt: params.source.prompt,
    learnerAnswerLabel: params.source.learnerAnswerLabel,
    correctAnswerLabel: params.source.correctAnswerLabel,
    authoredExplanation: params.source.authoredExplanation,
    followUpAvailable: params.followUpQuestionPrompt !== null,
    ...(params.followUpQuestionPrompt !== null
      ? { followUpQuestionPrompt: params.followUpQuestionPrompt }
      : {}),
  };

  const result = validateQuestionExplanationContext(candidate);
  if (!result.success) {
    throw new ExplanationContextValidationError(result.error, candidate);
  }
  return result.data;
}
