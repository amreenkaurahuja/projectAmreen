import { NextResponse } from "next/server";
import { withApiObservability } from "@/lib/observability/api";

export const GET = withApiObservability("GET /api/health", async () => {
  return NextResponse.json(
    {
      status: "ok",
      service: "project-amreen-web",
      timestamp: new Date().toISOString(),
    },
    { status: 200 },
  );
});
