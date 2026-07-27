import type { SupabaseClient } from "@supabase/supabase-js";
import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/observability/logger";
import { withApiObservability } from "@/lib/observability/api";
import {
  ParentDashboardAccessError,
  SupabaseParentDashboardRepository,
} from "@/modules/parent-dashboard/dashboard.repository";
import { ParentDashboardService } from "@/modules/parent-dashboard/dashboard.service";
import { SupabaseMasteryRepository } from "@/modules/learning-profile/mastery.repository";
import { SupabaseAdaptiveDataRepository } from "@/modules/adaptive-learning/adaptive-mission.repository";
import { SupabaseMissionCompletionRepository } from "@/modules/missions/mission-completion.repository";
import { SupabaseMissionPlayerRepository } from "@/modules/missions/mission-player.repository";
import { MissionPlayerService } from "@/modules/missions/mission-player.service";
import { MissionCompletionService } from "@/modules/missions/mission-completion.service";
import { ContextBuilder } from "@/modules/ai/coach/context-builder";
import { AiCoachService } from "@/modules/ai/coach/ai-coach.service";
import { SupabaseAiCacheRepository } from "@/modules/ai/cache/ai-cache.repository";
import {
  createAiGatewayFromEnv,
  isCoachEnabledForAudience,
} from "@/modules/ai/gateway/gateway-factory";
import { sharedBudgetManager } from "@/modules/ai/shared/budget-manager";

const paramsSchema = z.object({
  learnerId: z.string().uuid(),
});
const audienceSchema = z.enum(["learner", "parent"]);

const ROUTE_NAME = "GET /api/learners/[learnerId]/coach";

export const GET = withApiObservability<{
  params: Promise<{ learnerId: string }>;
}>(ROUTE_NAME, async (request, { params }, requestId) => {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid learner id" }, { status: 400 });
  }

  const parsedAudience = audienceSchema.safeParse(
    new URL(request.url).searchParams.get("audience"),
  );
  if (!parsedAudience.success) {
    return NextResponse.json(
      { error: "Invalid or missing audience (expected 'learner' or 'parent')" },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  try {
    const typedSupabase = supabase as SupabaseClient;
    const dashboardService = new ParentDashboardService(
      new SupabaseParentDashboardRepository(typedSupabase),
      new SupabaseMasteryRepository(typedSupabase),
      new SupabaseAdaptiveDataRepository(typedSupabase),
      new SupabaseMissionCompletionRepository(typedSupabase),
    );
    const missionCompletionService = new MissionCompletionService(
      new MissionPlayerService(
        new SupabaseMissionPlayerRepository(typedSupabase),
      ),
      new SupabaseMissionCompletionRepository(typedSupabase),
    );
    const contextBuilder = new ContextBuilder(
      dashboardService,
      missionCompletionService,
    );
    const cacheRepository = new SupabaseAiCacheRepository(typedSupabase);
    // A gateway only exists at all if the platform-level switch (AI_ENABLED)
    // and credentials are configured; it's only actually used below if the
    // coach feature is also turned on for this specific audience
    // (AI_COACH_ENABLED + AI_LEARNER_ENABLED/AI_PARENT_ENABLED) — either one
    // being off routes to the deterministic fallback the same way.
    const gateway = isCoachEnabledForAudience(parsedAudience.data)
      ? createAiGatewayFromEnv()
      : null;
    const coachService = new AiCoachService(
      contextBuilder,
      cacheRepository,
      gateway,
      sharedBudgetManager,
    );

    const result = await coachService.getCoachResponse({
      learnerId: parsedParams.data.learnerId,
      audience: parsedAudience.data,
      forceRefresh:
        new URL(request.url).searchParams.get("forceRefresh") === "true",
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof ParentDashboardAccessError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    Sentry.captureException(error, {
      tags: { request_id: requestId, route: ROUTE_NAME },
    });
    logger.error("api.learners.coach.failed", {
      requestId,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
});
