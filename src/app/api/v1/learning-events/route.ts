import type { SupabaseClient } from "@supabase/supabase-js";
import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/observability/logger";
import { withApiObservability } from "@/lib/observability/api";
import { SupabaseQuestionExplainerRepository } from "@/modules/question-explainer/explainer.repository";
import { SupabaseLearningEventRepository } from "@/modules/question-explainer/learning-event.repository";
import { LearningEventDeliveryService } from "@/modules/question-explainer/learning-event-delivery.service";
import { learningEventSchema } from "@/modules/question-explainer/learning-event.schema";

const ROUTE_NAME = "POST /api/v1/learning-events";

/**
 * TDS-008 Stage 6.3B: a thin transport adapter, mirroring
 * POST /api/v1/question-explanations's shape exactly — no persistence
 * mechanics or delivery-semantics decisions live here (LearningEventRepository
 * and LearningEventDeliveryService own those respectively). The one piece of
 * orchestration this layer owns is resolving which learner an attemptId
 * belongs to, reusing SupabaseQuestionExplainerRepository.getLearnerIdForAttempt
 * — the same RLS-backed lookup TDS-007 Stage 4 established for exactly this
 * purpose. learnerId never comes from the client: learningEventSchema has no
 * field for one on any event variant, so an attempt to include one is
 * rejected as an unknown property before this handler even reaches auth
 * resolution logic below.
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
        { status: 400 },
      );
    }

    const parsedEvent = learningEventSchema.safeParse(json);
    if (!parsedEvent.success) {
      return NextResponse.json(
        { error: "Invalid request payload" },
        { status: 400 },
      );
    }

    try {
      const typedSupabase = supabase as SupabaseClient;
      const explainerRepository = new SupabaseQuestionExplainerRepository(
        typedSupabase,
      );

      const learnerId = await explainerRepository.getLearnerIdForAttempt(
        parsedEvent.data.attemptId,
      );
      if (!learnerId) {
        return NextResponse.json(
          { error: "Attempt not found" },
          { status: 404 },
        );
      }

      const repository = new SupabaseLearningEventRepository(typedSupabase);
      const service = new LearningEventDeliveryService(repository);

      const outcome = await service.deliver({
        learnerId,
        event: parsedEvent.data,
      });

      // Both outcomes are success (TDS-008 §10.9) — the status code differs
      // for observability/REST accuracy only. The publisher must not (and
      // does not) depend on distinguishing them; no response body is
      // returned beyond acknowledgement (the publisher only needs to know
      // delivery succeeded, never the stored row).
      return NextResponse.json(
        {},
        { status: outcome === "inserted" ? 201 : 200 },
      );
    } catch (error) {
      // getLearnerIdForAttempt only ever throws ExplainerRepositoryError
      // (a database failure), never an access/ownership error — RLS
      // already makes a mismatched attempt invisible (resolves to null,
      // handled above as 404), so there's no distinct "forbidden" case to
      // special-case here, unlike POST /api/v1/question-explanations
      // (whose service layer can independently reject an unowned learner).
      Sentry.captureException(error, {
        tags: { request_id: requestId, route: ROUTE_NAME },
      });
      logger.error("api.learning-events.failed", {
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
