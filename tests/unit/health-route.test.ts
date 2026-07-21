import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/health/route";

describe("health route", () => {
  it("returns an operational response", async () => {
    const response = await GET(new Request("http://localhost/api/health"), {
      params: Promise.resolve({}),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.service).toBe("project-amreen-web");
  });
});
