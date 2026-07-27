import { describe, expect, it } from "vitest";
import { readAiConfigFromEnv } from "@/modules/ai/shared/ai-config";

describe("readAiConfigFromEnv", () => {
  it("defaults provider to gemini and leaves model undefined when unset", () => {
    const config = readAiConfigFromEnv({});
    expect(config.provider).toBe("gemini");
    expect(config.model).toBeUndefined();
  });

  it("reads AI_PROVIDER and AI_COACH_MODEL from the environment", () => {
    const config = readAiConfigFromEnv({
      AI_PROVIDER: "gemini",
      AI_COACH_MODEL: "gemini-2.5-flash",
    });
    expect(config.provider).toBe("gemini");
    expect(config.model).toBe("gemini-2.5-flash");
  });

  it("always returns the fixed generation parameters, not environment-configurable", () => {
    const config = readAiConfigFromEnv({
      AI_TEMPERATURE: "0.9",
      AI_MAX_OUTPUT_TOKENS: "4000",
      AI_TIMEOUT_MS: "60000",
    });
    expect(config.temperature).toBe(0.2);
    expect(config.maxOutputTokens).toBe(350);
    expect(config.timeoutMs).toBe(10_000);
  });

  it("is the single source of defaults — repeated calls are stable", () => {
    expect(readAiConfigFromEnv({})).toEqual(readAiConfigFromEnv({}));
  });
});
