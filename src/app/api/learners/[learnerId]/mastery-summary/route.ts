import type { SupabaseClient } from "@supabase/supabase-js";
import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  MasteryAccessError,
  SupabaseMasteryRepository,
} from "@/modules/learning-profile/mastery.repository";
import { MasteryService } from "@/modules/learning-profile/mastery.service";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/observability/logger";
import { withApiObservability } from "@/lib/observability/api";

const paramsSchema = z.object({
  learnerId: z.string().uuid(),
});

const ROUTE_NAME = "GET /api/learners/[learnerId]/mastery-summary";

export const GET = withApiObservability<{
  params: Promise<{ learnerId: string }>;
}>(ROUTE_NAME, async (_request, { params }, requestId) => {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid learner id" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  try {
    const service = new MasteryService(
      new SupabaseMasteryRepository(supabase as SupabaseClient),
    );
    const summary = await service.getLearnerProfileSummary(
      parsedParams.data.learnerId,
    );
    return NextResponse.json(summary, { status: 200 });
  } catch (error) {
    if (error instanceof MasteryAccessError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    Sentry.captureException(error, {
      tags: { request_id: requestId, route: ROUTE_NAME },
    });
    logger.error("api.learners.mastery-summary.failed", {
      requestId,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
});
