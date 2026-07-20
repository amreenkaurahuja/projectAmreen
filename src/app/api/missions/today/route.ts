import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  MissionAccessError,
  MissionDuplicateError,
  MissionQuestionBankError,
  SupabaseMissionRepository,
} from "@/modules/missions/mission.repository";
import { MissionService } from "@/modules/missions/mission.service";

const learnerIdSchema = z.string().uuid();

export async function GET(request: Request) {
  const url = new URL(request.url);
  const learnerParam = url.searchParams.get("learner");
  const parsed = learnerIdSchema.safeParse(learnerParam);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid learner id" }, { status: 400 });
  }

  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  try {
    const repository = new SupabaseMissionRepository(
      supabase as SupabaseClient,
    );
    const service = new MissionService(repository);
    const mission = await service.getOrCreateTodaysMission(parsed.data);
    return NextResponse.json(mission, { status: 200 });
  } catch (error) {
    if (error instanceof MissionAccessError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (error instanceof MissionQuestionBankError) {
      return NextResponse.json(
        { error: "Insufficient questions" },
        { status: 409 },
      );
    }

    if (error instanceof MissionDuplicateError) {
      return NextResponse.json({ error: "Conflict" }, { status: 409 });
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
