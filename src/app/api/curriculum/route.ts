import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { getCurriculumSubjects } from "@/lib/curriculum/catalogue";
import { withApiObservability } from "@/lib/observability/api";

export const GET = withApiObservability("GET /api/curriculum", async () => {
  try {
    await requireUser();
    const subjects = await getCurriculumSubjects();
    return NextResponse.json({ subjects });
  } catch {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
});
