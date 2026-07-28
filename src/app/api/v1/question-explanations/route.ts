import type { SupabaseClient } from "@supabase/supabase-js";
import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/observability/logger";
import { withApiObservability } from "@/lib/observability/api";
import { AUDIENCES } from "@/modules/ai/coach/audiences";
import { createAiGatewayFromEnv } from "@/modules/ai/gateway/gateway-factory";
import { isQuestionExplainerEnabledForAudience } from "@/modules/ai/shared/feature-flags";
import { sharedBudgetManager } from "@/modules/ai/shared/budget-manager";
import {
  ExplainerAccessError,
  SupabaseQuestionExplainerRepository,
} from "@/modules/question-explainer/explainer.repository";
import { SupabaseExplanationCacheRepository } from "@/modules/question-explainer/explanation-cache.repository";
import {
  FollowUpQuestionSelector,
  SupabaseFollowUpQuestionRepository,
} from "@/modules/adaptive-learning/follow-up-selector";
import { QuestionExplainerService } from "@/modules/question-explainer/question-explainer.service";

// TDS-007 Stage 4: intentionally small — attemptId and audience only. The
// client never sends a learner id, prompt/schema version, context hash,
// correct answer, or follow-up id; every one of those is resolved or
// decided server-side.
const requestSchema = z.object({
  attemptId: z.string().uuid(),
  audience: z.enum(AUDIENCES),
});

const ROUTE_NAME = "POST /api/v1/question-explanations";

/**
 * A thin transport adapter over QuestionExplainerService — no prompts, no
 * grounding, no hashing, no persistence, no follow-up selection happen
 * here (TDS-007 Stage 4's explicit list of what the route must not do).
 * The one piece of orchestration this layer owns is resolving which
 * learner an attemptId belongs to (repository.getLearnerIdForAttempt) —
 * a pure, RLS-backed lookup, not a business decision — since the service's
 * existing getExplanation(learnerId, attemptId, audience) signature
 * (Stage 1-3, unchanged) still needs one.
 */
export const POST = withApiObservability(
  ROUTE_NAME,
  async (request, _context, requestId) => {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }

    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid request payload" },
        { status: 422 },
      );
    }

    const parsedBody = requestSchema.safeParse(json);
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "Invalid request payload" },
        { status: 422 },
      );
    }

    try {
      const typedSupabase = supabase as SupabaseClient;
      const repository = new SupabaseQuestionExplainerRepository(typedSupabase);

      const learnerId = await repository.getLearnerIdForAttempt(
        parsedBody.data.attemptId,
      );
      if (!learnerId) {
        return NextResponse.json(
          { error: "Attempt not found" },
          { status: 404 },
        );
      }

      const followUpSelector = new FollowUpQuestionSelector(
        new SupabaseFollowUpQuestionRepository(typedSupabase),
      );
      const cacheRepository = new SupabaseExplanationCacheRepository(
        typedSupabase,
      );
      // Feature-flag resolution stays at this composition boundary,
      // matching GET /api/learners/[learnerId]/coach's exact pattern — the
      // service only ever sees a resolved AiGateway | null, never reads
      // env itself.
      const gateway = isQuestionExplainerEnabledForAudience(
        parsedBody.data.audience,
      )
        ? createAiGatewayFromEnv()
        : null;
      const service = new QuestionExplainerService(
        repository,
        followUpSelector,
        cacheRepository,
        gateway,
        sharedBudgetManager,
      );

      const result = await service.getExplanation({
        learnerId,
        attemptId: parsedBody.data.attemptId,
        audience: parsedBody.data.audience,
      });

      if (!result.eligible) {
        // AI failures never reach here — the service already resolved
        // them to a deterministic fallback (source: "fallback") returned
        // as a normal 200 below. An ineligible result means the attempt
        // itself isn't a valid explanation target, not that generation
        // failed.
        const status = result.reason === "answer_correct" ? 409 : 404;
        return NextResponse.json({ error: result.reason }, { status });
      }

      return NextResponse.json(
        {
          source: result.source,
          cached: result.cached,
          response: result.explanation,
          followUpQuestionId: result.followUpQuestionId ?? null,
          generatedAt: new Date().toISOString(),
        },
        { status: 200 },
      );
    } catch (error) {
      if (error instanceof ExplainerAccessError) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      Sentry.captureException(error, {
        tags: { request_id: requestId, route: ROUTE_NAME },
      });
      logger.error("api.question-explanations.failed", {
        requestId,
        error: error instanceof Error ? error.message : String(error),
      });
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 },
      );
    }
  },
);
