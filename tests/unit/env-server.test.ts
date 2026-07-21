import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getServerEnv } from "@/lib/env/server";

const ORIGINAL_ENV = { ...process.env };

describe("runtime server environment", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("does not require SUPABASE_SERVICE_ROLE_KEY", () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.APP_ENV = "production";

    expect(() => getServerEnv()).not.toThrow();
    expect(getServerEnv()).not.toHaveProperty("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("defaults APP_ENV to development when unset", () => {
    delete process.env.APP_ENV;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    expect(getServerEnv()).toEqual({ APP_ENV: "development" });
  });
});
