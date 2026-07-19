import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { getCurriculumSubjects } from "@/lib/curriculum/catalogue";

export async function GET() {
  try {
    await requireUser();
    const subjects = await getCurriculumSubjects();
    return NextResponse.json({ subjects });
  } catch {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
}
