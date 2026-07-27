import { describe, expect, it } from "vitest";
import {
  createAiGatewayFromEnv,
  isCoachEnabledForAudience,
} from "@/modules/ai/gateway/gateway-factory";
import { GeminiProvider } from "@/modules/ai/providers/gemini-provider";

describe("createAiGatewayFromEnv", () => {
  it("returns null when AI_ENABLED is not 'true'", () => {
    expect(
      createAiGatewayFromEnv({
        AI_ENABLED: "false",
        GEMINI_API_KEY: "key",
        AI_COACH_MODEL: "gemini-2.5-flash",
      }),
    ).toBeNull();
    expect(
      createAiGatewayFromEnv({
        GEMINI_API_KEY: "key",
        AI_COACH_MODEL: "gemini-2.5-flash",
      }),
    ).toBeNull();
  });

  it("returns null for an unsupported AI_PROVIDER", () => {
    expect(
      createAiGatewayFromEnv({
        AI_ENABLED: "true",
        AI_PROVIDER: "openai",
        GEMINI_API_KEY: "key",
        AI_COACH_MODEL: "gemini-2.5-flash",
      }),
    ).toBeNull();
  });

  it("returns null (not a throw) when GEMINI_API_KEY is missing", () => {
    expect(
      createAiGatewayFromEnv({
        AI_ENABLED: "true",
        AI_COACH_MODEL: "gemini-2.5-flash",
      }),
    ).toBeNull();
  });

  it("returns null (not a throw) when AI_COACH_MODEL is missing", () => {
    expect(
      createAiGatewayFromEnv({
        AI_ENABLED: "true",
        GEMINI_API_KEY: "key",
      }),
    ).toBeNull();
  });

  it("builds a GeminiProvider when enabled and fully configured", () => {
    const gateway = createAiGatewayFromEnv({
      AI_ENABLED: "true",
      AI_PROVIDER: "gemini",
      GEMINI_API_KEY: "key",
      AI_COACH_MODEL: "gemini-2.5-flash",
    });
    expect(gateway).toBeInstanceOf(GeminiProvider);
  });

  it("defaults to gemini when AI_PROVIDER is unset", () => {
    const gateway = createAiGatewayFromEnv({
      AI_ENABLED: "true",
      GEMINI_API_KEY: "key",
      AI_COACH_MODEL: "gemini-2.5-flash",
    });
    expect(gateway).toBeInstanceOf(GeminiProvider);
  });
});

describe("isCoachEnabledForAudience", () => {
  it("is false when AI_COACH_ENABLED is not 'true'", () => {
    expect(
      isCoachEnabledForAudience("learner", {
        AI_COACH_ENABLED: "false",
        AI_LEARNER_ENABLED: "true",
      }),
    ).toBe(false);
  });

  it("is false when the specific audience flag is off, even if AI_COACH_ENABLED is on", () => {
    expect(
      isCoachEnabledForAudience("parent", {
        AI_COACH_ENABLED: "true",
        AI_PARENT_ENABLED: "false",
        AI_LEARNER_ENABLED: "true",
      }),
    ).toBe(false);
  });

  it("is true only when both the coach flag and the matching audience flag are on", () => {
    expect(
      isCoachEnabledForAudience("learner", {
        AI_COACH_ENABLED: "true",
        AI_LEARNER_ENABLED: "true",
      }),
    ).toBe(true);
    expect(
      isCoachEnabledForAudience("parent", {
        AI_COACH_ENABLED: "true",
        AI_PARENT_ENABLED: "true",
      }),
    ).toBe(true);
  });

  it("checks the audience-specific flag independently for learner vs parent", () => {
    const env = {
      AI_COACH_ENABLED: "true",
      AI_LEARNER_ENABLED: "true",
      AI_PARENT_ENABLED: "false",
    };
    expect(isCoachEnabledForAudience("learner", env)).toBe(true);
    expect(isCoachEnabledForAudience("parent", env)).toBe(false);
  });
});
