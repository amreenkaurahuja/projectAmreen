import "server-only";
import type { FollowUpQuestionSelector } from "@/modules/adaptive-learning/follow-up-selector";
import {
  AiProviderQuotaError,
  AiProviderTimeoutError,
  type AiGateway,
} from "@/modules/ai/gateway/ai-gateway";
import type { BudgetManager } from "@/modules/ai/shared/budget-manager";
import { estimateTokens } from "@/modules/ai/shared/budget-manager";
import { type AiFailureCategory, logAiEvent } from "@/modules/ai/shared/logger";
import { checkEligibility, type IneligibilityReason } from "./eligibility";
import {
  buildQuestionExplanationContext,
  ExplanationContextValidationError,
} from "./explanation-context-builder";
import {
  computeExplanationContextHash,
  explanationContextHashPrefix,
} from "./explanation-hash";
import { buildDeterministicExplanation } from "./explanation-fallback-builder";
import { validateExplanationGrounding } from "./explanation-grounding-validator";
import { parseQuestionExplanationResponseJson } from "./explanation-response-validator";
import { buildLearnerPrompt } from "./learner-prompt";
import { buildParentPrompt } from "./parent-prompt";
import type { QuestionExplainerRepository } from "./explainer.repository";
import type {
  ExplainerAudience,
  QuestionExplanationContext,
  QuestionExplanationResponse,
} from "./explainer.types";

const DEFAULT_LEARNER_NAME = "Learner";
/** A follow-up should be at least as easy as the original, per PRS-007's "same or slightly easier difficulty." */
const FOLLOW_UP_DIFFICULTY_STEP_DOWN = 1;
const MIN_DIFFICULTY = 1;
const NO_PROVIDER = "none";

export interface GetExplanationParams {
  learnerId: string;
  attemptId: string;
  audience: ExplainerAudience;
}

export type GetExplanationResult =
  | {
      eligible: true;
      explanation: QuestionExplanationResponse;
      source: "ai" | "fallback";
      /** Present only when explanation.nextAction.type is "linked-question" — attached here, never inside the response itself, since the id never crosses the AI boundary (TDS-007 §8). */
      followUpQuestionId?: string;
      /** Real today, unused today — Stage 3 wires this into the persistence table's cache lookup (TDS-007 §18/§19). */
      contextHash: string;
    }
  | { eligible: false; reason: IneligibilityReason };

/**
 * Stage 2 orchestrator: eligibility -> deterministic follow-up -> context
 * (now including follow-up availability) -> hash -> gateway on availability
 * and budget -> validate -> ground -> deterministic fallback at every
 * failure point, exactly mirroring
 * ai/coach/ai-coach.service.ts's AiCoachService.getCoachResponse. Only a
 * genuine ownership error (from repository.assertLearnerOwned) propagates;
 * every AI-side failure — disabled, unconfigured, over budget, timeout,
 * quota, malformed JSON, failed response/grounding validation — resolves to
 * buildDeterministicExplanation instead (Rule 9, Rule 14).
 */
export class QuestionExplainerService {
  constructor(
    private readonly repository: QuestionExplainerRepository,
    private readonly followUpSelector: FollowUpQuestionSelector,
    /** Null means AI is disabled or unconfigured (see gateway/gateway-factory.ts) — every request then goes straight to the deterministic fallback. */
    private readonly gateway: AiGateway | null,
    private readonly budgetManager: BudgetManager,
  ) {}

  async getExplanation(
    params: GetExplanationParams,
  ): Promise<GetExplanationResult> {
    const startedAt = Date.now();
    await this.repository.assertLearnerOwned(params.learnerId);

    const source = await this.repository.getExplanationSource({
      learnerId: params.learnerId,
      attemptId: params.attemptId,
    });

    const eligibility = checkEligibility(source);
    if (!eligibility.eligible || !source) {
      return { eligible: false, reason: eligibility.reason! };
    }

    const [learnerDisplayName, followUp] = await Promise.all([
      this.repository
        .getLearnerDisplayName(params.learnerId)
        .then((name) => name ?? DEFAULT_LEARNER_NAME),
      this.followUpSelector.selectFollowUpQuestion({
        learnerId: params.learnerId,
        skillId: source.skillId,
        excludeQuestionIds: [source.questionId],
        targetDifficulty: Math.max(
          MIN_DIFFICULTY,
          source.difficulty - FOLLOW_UP_DIFFICULTY_STEP_DOWN,
        ),
      }),
    ]);

    const followUpQuestionPrompt = followUp
      ? await this.repository.getQuestionPromptById(followUp.questionId)
      : null;
    // Only attached once a prompt for it was actually resolved — if the
    // follow-up question vanished between selection and this lookup, treat
    // it the same as "no follow-up" rather than link to unexplained content.
    const followUpQuestionId = followUpQuestionPrompt
      ? followUp?.questionId
      : undefined;

    let context: QuestionExplanationContext;
    try {
      context = buildQuestionExplanationContext({
        audience: params.audience,
        learnerDisplayName,
        source,
        followUpQuestionPrompt,
      });
    } catch (error) {
      if (!(error instanceof ExplanationContextValidationError)) throw error;
      this.log(
        error.candidate,
        "none",
        startedAt,
        "fallback",
        "validation_failed",
      );
      return this.toFallbackResult(error.candidate, "none", followUpQuestionId);
    }

    const contextHash = computeExplanationContextHash(context);

    if (!this.gateway) {
      this.log(context, "none", startedAt, "fallback", "disabled");
      return this.toFallbackResult(context, contextHash, followUpQuestionId);
    }
    const gateway = this.gateway;

    const budgetCheck = await this.budgetManager.checkBudget();
    if (!budgetCheck.allowed) {
      this.log(context, contextHash, startedAt, "fallback", "budget_exceeded");
      return this.toFallbackResult(context, contextHash, followUpQuestionId);
    }

    try {
      const promptBuild =
        context.audience === "learner"
          ? buildLearnerPrompt(context)
          : buildParentPrompt(context);

      const generation = await gateway.generate({
        systemPrompt: promptBuild.systemPrompt,
        userPrompt: promptBuild.userPrompt,
        responseSchema: promptBuild.responseSchema,
        audience: context.audience,
        promptVersion: context.promptVersion,
        contextHash,
      });

      // Gemini was already called and billed for this request regardless
      // of what validation/grounding decide next, so usage is recorded
      // against the actual prompt+response text as soon as it's available.
      await this.budgetManager.recordUsage(
        estimateTokens(
          promptBuild.systemPrompt + promptBuild.userPrompt + generation.raw,
        ),
      );

      const parsed = parseQuestionExplanationResponseJson(generation.raw);
      if (!parsed.success) {
        this.log(context, contextHash, startedAt, "fallback", "malformed_json");
        return this.toFallbackResult(context, contextHash, followUpQuestionId);
      }

      const violations = validateExplanationGrounding(parsed.data, context);
      if (violations.length > 0) {
        this.log(
          context,
          contextHash,
          startedAt,
          "fallback",
          "grounding_failed",
        );
        return this.toFallbackResult(context, contextHash, followUpQuestionId);
      }

      this.log(context, contextHash, startedAt, "ai");
      return {
        eligible: true,
        explanation: parsed.data,
        source: "ai",
        contextHash,
        ...(parsed.data.nextAction.type === "linked-question" &&
        followUpQuestionId
          ? { followUpQuestionId }
          : {}),
      };
    } catch (error) {
      const category = categorizeFailure(error);
      this.log(context, contextHash, startedAt, "fallback", category);
      return this.toFallbackResult(context, contextHash, followUpQuestionId);
    }
  }

  private toFallbackResult(
    context: QuestionExplanationContext,
    contextHash: string,
    followUpQuestionId: string | undefined,
  ): GetExplanationResult {
    const explanation = buildDeterministicExplanation(context);
    return {
      eligible: true,
      explanation,
      source: "fallback",
      contextHash,
      ...(explanation.nextAction.type === "linked-question" &&
      followUpQuestionId
        ? { followUpQuestionId }
        : {}),
    };
  }

  private log(
    context: QuestionExplanationContext,
    contextHash: string,
    startedAt: number,
    resultSource: "ai" | "fallback" | "cache",
    failureCategory?: AiFailureCategory,
  ): void {
    logAiEvent("question_explainer_get_explanation", {
      provider: NO_PROVIDER,
      model: NO_PROVIDER,
      durationMs: Date.now() - startedAt,
      cacheHit: resultSource === "cache",
      contextHashPrefix:
        contextHash === "none"
          ? "none"
          : explanationContextHashPrefix(contextHash),
      audience: context.audience,
      resultSource,
      status: resultSource === "fallback" ? "error" : "success",
      failureCategory,
    });
  }
}

function categorizeFailure(error: unknown): AiFailureCategory {
  if (error instanceof AiProviderTimeoutError) return "timeout";
  if (error instanceof AiProviderQuotaError) return "quota_exceeded";
  return "network_error";
}
