import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  MissionAccessError,
  MissionNotFoundError,
} from "@/modules/missions/mission.repository";
import { SupabaseMissionPlayerRepository } from "@/modules/missions/mission-player.repository";
import { MissionPlayerService } from "@/modules/missions/mission-player.service";
import { createClient } from "@/lib/supabase/server";

const paramsSchema = z.object({
  missionId: z.string().uuid(),
});

const querySchema = z.object({
  learner: z.string().uuid(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ missionId: string }> },
) {
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

    console.error("Failed to load mission for player", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
