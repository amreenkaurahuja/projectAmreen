import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  MissionAccessError,
  MissionNotFoundError,
} from "@/modules/missions/mission.repository";
import {
  MissionOptionInvalidError,
  MissionPlayerService,
} from "@/modules/missions/mission-player.service";
import { SupabaseMissionPlayerRepository } from "@/modules/missions/mission-player.repository";
import { createClient } from "@/lib/supabase/server";

const paramsSchema = z.object({
  missionId: z.string().uuid(),
});

const bodySchema = z.object({
  learnerId: z.string().uuid(),
  missionItemId: z.string().uuid(),
  optionId: z.string().uuid(),
  responseMs: z.number().int().min(0).max(3_600_000).optional().default(0),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ missionId: string }> },
) {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid mission id" }, { status: 400 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }

  const parsedBody = bodySchema.safeParse(json);
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: "Invalid request body" },
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
    const result = await service.submitAnswer({
      learnerId: parsedBody.data.learnerId,
      missionId: parsedParams.data.missionId,
      missionItemId: parsedBody.data.missionItemId,
      optionId: parsedBody.data.optionId,
      responseMs: parsedBody.data.responseMs,
    });
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof MissionAccessError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (error instanceof MissionNotFoundError) {
      return NextResponse.json(
        { error: "Mission or question not found" },
        { status: 404 },
      );
    }

    if (error instanceof MissionOptionInvalidError) {
      return NextResponse.json({ error: "Invalid option" }, { status: 400 });
    }

    console.error("Failed to record mission attempt", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
