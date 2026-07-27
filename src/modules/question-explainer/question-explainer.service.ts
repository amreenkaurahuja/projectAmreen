import "server-only";
import type { FollowUpQuestionSelector } from "@/modules/adaptive-learning/follow-up-selector";
import { checkEligibility, type IneligibilityReason } from "./eligibility";
import {
  buildQuestionExplanationContext,
  ExplanationContextValidationError,
} from "./explanation-context-builder";
import { computeExplanationContextHash } from "./explanation-hash";
import { buildDeterministicExplanation } from "./explanation-fallback-builder";
import type { QuestionExplainerRepository } from "./explainer.repository";
import type {
  DeterministicExplanation,
  ExplainerAudience,
} from "./explainer.types";

const DEFAULT_LEARNER_NAME = "Learner";
/** A follow-up should be at least as easy as the original, per PRS-007's "same or slightly easier difficulty." */
const FOLLOW_UP_DIFFICULTY_STEP_DOWN = 1;
const MIN_DIFFICULTY = 1;

export interface GetExplanationParams {
  learnerId: string;
  attemptId: string;
  audience: ExplainerAudience;
}

export type GetExplanationResult =
  | {
      eligible: true;
      explanation: DeterministicExplanation;
      /** Real today, unused today — Stage 3 wires this into the persistence table's cache lookup (TDS-007 §18/§19). */
      contextHash: string;
    }
  | { eligible: false; reason: IneligibilityReason };

/**
 * Stage 1 orchestrator: eligibility -> context -> hash -> deterministic
 * follow-up -> deterministic explanation. No gateway, no prompts, no
 * grounding — every request resolves to buildDeterministicExplanation,
 * matching the Coach's fallback path with zero AI involvement (Rule 9).
 * Stage 2 adds a gateway call ahead of the final buildDeterministicExplanation
 * call, exactly where AiCoachService.getCoachResponse calls it today.
 */
export class QuestionExplainerService {
  constructor(
    private readonly repository: QuestionExplainerRepository,
    private readonly followUpSelector: FollowUpQuestionSelector,
  ) {}

  async getExplanation(
    params: GetExplanationParams,
  ): Promise<GetExplanationResult> {
    await this.repository.assertLearnerOwned(params.learnerId);

    const source = await this.repository.getExplanationSource({
      learnerId: params.learnerId,
      attemptId: params.attemptId,
    });

    const eligibility = checkEligibility(source);
    if (!eligibility.eligible || !source) {
      return { eligible: false, reason: eligibility.reason! };
    }

    const learnerDisplayName =
      (await this.repository.getLearnerDisplayName(params.learnerId)) ??
      DEFAULT_LEARNER_NAME;

    // Should never actually fail given the DB constraints the source data
    // is built from — caught defensively rather than left to crash the
    // request, mirroring ai/coach/ai-coach.service.ts's handling of
    // ContextBuilderValidationError: build content from the rejected
    // candidate anyway rather than surfacing an internal validation error
    // to the caller.
    let context;
    try {
      context = buildQuestionExplanationContext({
        audience: params.audience,
        learnerDisplayName,
        source,
      });
    } catch (error) {
      if (!(error instanceof ExplanationContextValidationError)) throw error;
      context = error.candidate;
    }

    const contextHash = computeExplanationContextHash(context);

    const followUp = await this.followUpSelector.selectFollowUpQuestion({
      learnerId: params.learnerId,
      skillId: source.skillId,
      excludeQuestionIds: [source.questionId],
      targetDifficulty: Math.max(
        MIN_DIFFICULTY,
        source.difficulty - FOLLOW_UP_DIFFICULTY_STEP_DOWN,
      ),
    });

    const explanation = buildDeterministicExplanation(context, followUp);

    return { eligible: true, explanation, contextHash };
  }
}
