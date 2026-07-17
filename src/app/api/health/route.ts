import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json(
    {
      status: "ok",
      service: "project-amreen-web",
      timestamp: new Date().toISOString(),
    },
    { status: 200 },
  );
}
