import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/missions/today/route";

describe("missions today route", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns 400 for an invalid learner id", async () => {
    const request = new Request(
      "http://localhost/api/missions/today?learner=invalid",
    );
    const response = await GET(request);

    expect(response.status).toBe(400);
  });

  it("returns 401 when the user is unauthenticated", async () => {
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: vi.fn(async () => ({
        auth: {
          getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
        },
      })),
    }));

    const request = new Request(
      "http://localhost/api/missions/today?learner=123e4567-e89b-12d3-a456-426614174000",
    );
    const { GET: mockedGet } = await import("@/app/api/missions/today/route");
    const response = await mockedGet(request);

    expect(response.status).toBe(401);
  });
});
