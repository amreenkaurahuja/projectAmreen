import type { SupabaseClient } from "@supabase/supabase-js";
import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  MissionAccessError,
  MissionNotFoundError,
} from "@/modules/missions/mission.repository";
import { SupabaseMissionPlayerRepository } from "@/modules/missions/mission-player.repository";
import { MissionPlayerService } from "@/modules/missions/mission-player.service";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/observability/logger";
import { withApiObservability } from "@/lib/observability/api";

const paramsSchema = z.object({
  missionId: z.string().uuid(),
});

const querySchema = z.object({
  learner: z.string().uuid(),
});

const ROUTE_NAME = "GET /api/missions/[missionId]";

export const GET = withApiObservability<{
  params: Promise<{ missionId: string }>;
}>(ROUTE_NAME, async (request, { params }, requestId) => {
  const parsedParams = paramsSchema.safeParse(await params);
  const url = new URL(request.url);
  const parsedQuery = querySchema.safeParse({
    learner: url.searchParams.get("learner"),
  });

  if (!parsedParams.success || !parsedQuery.success) {
    return NextResponse.json(
      { error: "Invalid mission or learner id" },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  try {
    const repository = new SupabaseMissionPlayerRepository(
      supabase as SupabaseClient,
    );
    const service = new MissionPlayerService(repository);
    const mission = await service.getMissionForPlayer(
      parsedQuery.data.learner,
      parsedParams.data.missionId,
    );
    return NextResponse.json(mission, { status: 200 });
  } catch (error) {
    if (error instanceof MissionAccessError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (error instanceof MissionNotFoundError) {
      return NextResponse.json({ error: "Mission not found" }, { status: 404 });
    }

    Sentry.captureException(error, {
      tags: { request_id: requestId, route: ROUTE_NAME },
    });
    logger.error("api.missions.get.failed", {
      requestId,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
});
