import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getSeedEnv } from "../../scripts/env";

const ORIGINAL_ENV = { ...process.env };

describe("seed script environment", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("requires both the Supabase URL and the service role key", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    expect(() => getSeedEnv()).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it("parses successfully when both values are present", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";

    expect(getSeedEnv()).toEqual({
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
    });
  });
});
