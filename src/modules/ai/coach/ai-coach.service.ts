import "server-only";
import type {
  AiCacheRepository,
  CoachMessageContent,
} from "../cache/ai-cache.repository";
import { AiCacheDuplicateError } from "../cache/ai-cache.repository";
import { computeContextHash, contextHashPrefix } from "../cache/context-hash";
import {
  AiProviderQuotaError,
  AiProviderTimeoutError,
  type AiGateway,
} from "../gateway/ai-gateway";
import { buildLearnerPrompt } from "../prompts/learner-prompt";
import { buildParentPrompt } from "../prompts/parent-prompt";
import type { BudgetManager } from "../shared/budget-manager";
import { estimateTokens } from "../shared/budget-manager";
import { type AiFailureCategory, logAiEvent } from "../shared/logger";
import { parseCoachResponseJson } from "../validation/response-validator";
import { validateGrounding } from "../validation/grounding-validator";
import {
  ContextBuilder,
  ContextBuilderValidationError,
} from "./context-builder";
import { buildFallbackCoachResponse } from "./fallback-coach";
import type {
  Audience,
  CoachResponse,
  LearnerCoachingContext,
} from "./coach.types";

const NO_PROVIDER = "none";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export interface CoachResult {
  headline: string;
  message: string;
  strengths: string[];
  focusAreas: string[];
  nextSteps: string[];
  source: "ai" | "fallback";
  cached: boolean;
}

export interface GetCoachParams {
  learnerId: string;
  audience: Audience;
  referenceTimestamp?: Date;
  /** Skips the cache read (not the write) — "Generate New Coaching". If the learner's data hasn't actually changed, the context hash is identical and this still resolves to the existing cached row via the same conflict-reuse path save() already uses; a genuinely new message only comes out when the underlying data has changed. */
  forceRefresh?: boolean;
}

/**
 * The single orchestrator every caller (an API route, a page) is expected
 * to go through — the "Service Flow" from the Phase 5.4 spec: build +
 * validate the DTO, hash it, check the cache, call the gateway on a miss,
 * validate + ground the response, persist a hit, and fall back to the
 * deterministic coach at every failure point. `getCoachResponse` never
 * throws for an AI-side failure — ownership/access errors from
 * ContextBuilder (via ParentDashboardService.assertLearnerOwned) are the
 * one thing that still propagates, since those are the caller's problem to
 * turn into a 403/404, not something a fallback should paper over.
 */
export class AiCoachService {
  constructor(
    private readonly contextBuilder: ContextBuilder,
    private readonly cacheRepository: AiCacheRepository,
    /** Null means AI is disabled or unconfigured (see gateway/gateway-factory.ts) — every request then goes straight to the deterministic fallback. */
    private readonly gateway: AiGateway | null,
    private readonly budgetManager: BudgetManager,
  ) {}

  async getCoachResponse(params: GetCoachParams): Promise<CoachResult> {
    const startedAt = Date.now();
    let context: LearnerCoachingContext;

    try {
      context = await this.contextBuilder.build(params);
    } catch (error) {
      if (error instanceof ContextBuilderValidationError) {
        this.log(
          error.candidate,
          "none",
          startedAt,
          "fallback",
          "validation_failed",
        );
        return toCoachResult(
          fallbackContent(buildFallbackCoachResponse(error.candidate)),
          false,
        );
      }
      throw error;
    }

    if (!this.gateway) {
      this.log(context, "none", startedAt, "fallback", "disabled");
      return toCoachResult(
        fallbackContent(buildFallbackCoachResponse(context)),
        false,
      );
    }
    const gateway = this.gateway;

    const contextHash = computeContextHash(context);

    const cached = params.forceRefresh
      ? null
      : await this.cacheRepository.find({
          learnerId: params.learnerId,
          audience: context.audience,
          contextHash,
        });
    if (cached) {
      this.log(context, contextHash, startedAt, "cache");
      return toCoachResult(cached, true);
    }

    const budgetCheck = await this.budgetManager.checkBudget();
    if (!budgetCheck.allowed) {
      this.log(context, contextHash, startedAt, "fallback", "budget_exceeded");
      return toCoachResult(
        fallbackContent(buildFallbackCoachResponse(context)),
        false,
      );
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

      const parsed = parseCoachResponseJson(generation.raw);
      if (!parsed.success) {
        this.log(context, contextHash, startedAt, "fallback", "malformed_json");
        return toCoachResult(
          fallbackContent(buildFallbackCoachResponse(context)),
          false,
        );
      }

      const violations = validateGrounding(parsed.data, context);
      if (violations.length > 0) {
        this.log(
          context,
          contextHash,
          startedAt,
          "fallback",
          "grounding_failed",
        );
        return toCoachResult(
          fallbackContent(buildFallbackCoachResponse(context)),
          false,
        );
      }

      const content: CoachMessageContent = {
        headline: parsed.data.headline,
        message: parsed.data.message,
        strengths: parsed.data.strengths,
        focusAreas: parsed.data.focusAreas,
        nextSteps: parsed.data.nextSteps,
        source: "ai",
      };

      const saved = await this.persist({
        learnerId: params.learnerId,
        context,
        contextHash,
        provider: generation.provider,
        model: generation.model,
        content,
      });

      this.log(context, contextHash, startedAt, "ai");
      return toCoachResult(saved, false);
    } catch (error) {
      const category = categorizeFailure(error);
      this.log(context, contextHash, startedAt, "fallback", category);
      return toCoachResult(
        fallbackContent(buildFallbackCoachResponse(context)),
        false,
      );
    }
  }

  /** On a concurrent duplicate insert, re-`find`s the winning row instead of treating it as a failure — see cache/ai-cache.repository.ts. */
  private async persist(params: {
    learnerId: string;
    context: LearnerCoachingContext;
    contextHash: string;
    provider: string;
    model: string;
    content: CoachMessageContent;
  }) {
    try {
      return await this.cacheRepository.save({
        learnerId: params.learnerId,
        audience: params.context.audience,
        contextHash: params.contextHash,
        schemaVersion: params.context.schemaVersion,
        promptVersion: params.context.promptVersion,
        provider: params.provider,
        model: params.model,
        content: params.content,
        expiresAt: new Date(Date.now() + CACHE_TTL_MS).toISOString(),
      });
    } catch (error) {
      if (error instanceof AiCacheDuplicateError) {
        const existing = await this.cacheRepository.find({
          learnerId: params.learnerId,
          audience: params.context.audience,
          contextHash: params.contextHash,
        });
        if (existing) return existing;
      }
      throw error;
    }
  }

  private log(
    context: LearnerCoachingContext,
    contextHash: string,
    startedAt: number,
    resultSource: "ai" | "fallback" | "cache",
    failureCategory?: AiFailureCategory,
  ): void {
    logAiEvent("ai_coach_get_response", {
      provider: NO_PROVIDER,
      model: NO_PROVIDER,
      durationMs: Date.now() - startedAt,
      cacheHit: resultSource === "cache",
      contextHashPrefix:
        contextHash === "none" ? "none" : contextHashPrefix(contextHash),
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

/** The fallback's CoachResponse has a disclaimer field (part of the AI-shaped JSON schema) but no `source` — this adapts it into the cache/API-shaped CoachMessageContent, dropping the disclaimer (never persisted or returned — see docs/Architecture.md). */
function fallbackContent(response: CoachResponse): CoachMessageContent {
  return {
    headline: response.headline,
    message: response.message,
    strengths: response.strengths,
    focusAreas: response.focusAreas,
    nextSteps: response.nextSteps,
    source: "fallback",
  };
}

function toCoachResult(
  content: CoachMessageContent,
  cached: boolean,
): CoachResult {
  return {
    headline: content.headline,
    message: content.message,
    strengths: content.strengths,
    focusAreas: content.focusAreas,
    nextSteps: content.nextSteps,
    source: content.source,
    cached,
  };
}
