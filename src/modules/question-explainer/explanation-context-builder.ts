import { validateQuestionExplanationContext } from "./explanation-context-validator";
import {
  EXPLANATION_CONTEXT_SCHEMA_VERSION,
  type ExplainerAudience,
  type QuestionExplanationContext,
} from "./explainer.types";
import type { ExplanationSourceData } from "./explainer.repository";

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
}

/**
 * Pure — unlike ai/coach/context-builder.ts's ContextBuilder, this takes
 * already-fetched ExplanationSourceData rather than calling a repository
 * itself, since QuestionExplainerService already has that data from its own
 * eligibility check by the time it builds a context. Throws
 * ExplanationContextValidationError if the assembled DTO fails validation.
 */
export function buildQuestionExplanationContext(
  params: BuildExplanationContextParams,
): QuestionExplanationContext {
  const candidate: QuestionExplanationContext = {
    schemaVersion: EXPLANATION_CONTEXT_SCHEMA_VERSION,
    audience: params.audience,
    learnerDisplayName: params.learnerDisplayName,
    subject: params.source.subjectName,
    skill: params.source.skillName,
    prompt: params.source.prompt,
    learnerAnswerLabel: params.source.learnerAnswerLabel,
    correctAnswerLabel: params.source.correctAnswerLabel,
    authoredExplanation: params.source.authoredExplanation,
  };

  const result = validateQuestionExplanationContext(candidate);
  if (!result.success) {
    throw new ExplanationContextValidationError(result.error, candidate);
  }
  return result.data;
}
