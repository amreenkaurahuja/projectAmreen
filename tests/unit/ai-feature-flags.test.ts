import { describe, expect, it } from "vitest";
import {
  isAiEnabled,
  isCoachEnabledForAudience,
} from "@/modules/ai/shared/feature-flags";

describe("isAiEnabled", () => {
  it("is false unless AI_ENABLED is exactly 'true'", () => {
    expect(isAiEnabled({})).toBe(false);
    expect(isAiEnabled({ AI_ENABLED: "false" })).toBe(false);
    expect(isAiEnabled({ AI_ENABLED: "1" })).toBe(false);
  });

  it("is true when AI_ENABLED is 'true'", () => {
    expect(isAiEnabled({ AI_ENABLED: "true" })).toBe(true);
  });
});

describe("isCoachEnabledForAudience", () => {
  it("is false when AI_COACH_ENABLED is not 'true'", () => {
    expect(
      isCoachEnabledForAudience("learner", { AI_LEARNER_ENABLED: "true" }),
    ).toBe(false);
  });

  it("is false when the matching audience flag is off", () => {
    expect(
      isCoachEnabledForAudience("parent", {
        AI_COACH_ENABLED: "true",
        AI_PARENT_ENABLED: "false",
      }),
    ).toBe(false);
  });

  it("is true only when the coach flag and the matching audience flag are both on", () => {
    expect(
      isCoachEnabledForAudience("learner", {
        AI_COACH_ENABLED: "true",
        AI_LEARNER_ENABLED: "true",
      }),
    ).toBe(true);
  });

  it("checks learner and parent flags independently", () => {
    const env = {
      AI_COACH_ENABLED: "true",
      AI_LEARNER_ENABLED: "true",
      AI_PARENT_ENABLED: "false",
    };
    expect(isCoachEnabledForAudience("learner", env)).toBe(true);
    expect(isCoachEnabledForAudience("parent", env)).toBe(false);
  });
});
