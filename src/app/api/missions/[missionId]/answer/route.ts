import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { getMission } from "@/lib/missions/generator";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ missionId: string }> },
) {
  const user = await requireUser();
  const { missionId } = await params;
  const { missionItemId, optionId, responseMs } = (await request.json()) as {
    missionItemId?: string;
    optionId?: string;
    responseMs?: number;
  };
  if (!missionItemId || !optionId)
    return NextResponse.json(
      { error: "Answer is incomplete" },
      { status: 400 },
    );
  const supabase = await createClient();
  const { data: item } = await supabase
    .from("mission_items")
    .select(
      "id,question_id,missions!inner(id,learner_id,learners!inner(parent_id))",
    )
    .eq("id", missionItemId)
    .eq("mission_id", missionId)
    .eq("missions.learners.parent_id", user.id)
    .maybeSingle();
  if (!item)
    return NextResponse.json(
      { error: "Mission item not found" },
      { status: 404 },
    );
  const { data: option } = await supabase
    .from("question_options")
    .select("id,is_correct")
    .eq("id", optionId)
    .eq("question_id", item.question_id)
    .maybeSingle();
  if (!option)
    return NextResponse.json({ error: "Option not found" }, { status: 400 });

  const { error } = await supabase.from("question_attempts").upsert(
    {
      mission_item_id: missionItemId,
      question_id: item.question_id,
      selected_option_id: optionId,
      is_correct: option.is_correct,
      response_ms: Math.max(0, Math.min(responseMs ?? 0, 3600000)),
      answered_at: new Date().toISOString(),
    },
    { onConflict: "mission_item_id" },
  );
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  const mission = await getMission(supabase, missionId);
  const completed = mission.answeredQuestions === mission.totalQuestions;
  await supabase
    .from("missions")
    .update({
      status: completed ? "completed" : "in_progress",
      completed_at: completed ? new Date().toISOString() : null,
    })
    .eq("id", missionId);
  return NextResponse.json({ correct: option.is_correct, completed });
}
