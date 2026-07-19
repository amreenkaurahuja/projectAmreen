import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { learnerSchema } from "@/lib/validation/learner";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user)
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const parsed = learnerSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid learner" },
      { status: 400 },
    );
  const { data, error } = await supabase
    .from("learners")
    .insert({
      parent_id: auth.user.id,
      display_name: parsed.data.displayName,
      school_year: parsed.data.schoolYear,
      exam_target: parsed.data.examTarget || null,
    })
    .select("id")
    .single();
  if (error)
    return NextResponse.json(
      { error: "Unable to create learner" },
      { status: 500 },
    );
  return NextResponse.json({ learnerId: data.id }, { status: 201 });
}
