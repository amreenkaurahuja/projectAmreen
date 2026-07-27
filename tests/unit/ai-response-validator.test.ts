import { describe, expect, it } from "vitest";
import {
  parseCoachResponseJson,
  validateCoachResponse,
} from "@/modules/ai/validation/response-validator";
import type { CoachResponse } from "@/modules/ai/coach/coach.types";

function validResponse(overrides: Partial<CoachResponse> = {}): CoachResponse {
  return {
    headline: "Great progress this week!",
    message: "You are doing really well with fractions.",
    strengths: ["Addition"],
    focusAreas: ["Fractions"],
    nextSteps: ["Practise fractions tomorrow."],
    disclaimer: null,
    ...overrides,
  };
}

describe("validateCoachResponse", () => {
  it("accepts a well-formed response", () => {
    expect(validateCoachResponse(validResponse()).success).toBe(true);
  });

  it("rejects an unknown field (schema is strict)", () => {
    const result = validateCoachResponse({
      ...validResponse(),
      extraField: "nope",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a missing required field", () => {
    const full = validResponse() as unknown as Record<string, unknown>;
    delete full.headline;
    const result = validateCoachResponse(full);
    expect(result.success).toBe(false);
  });

  it("rejects a headline that is too long", () => {
    const result = validateCoachResponse(
      validResponse({ headline: "a".repeat(200) }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects too many strengths", () => {
    const result = validateCoachResponse(
      validResponse({ strengths: ["a", "b", "c", "d"] }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects markdown bold syntax in the message", () => {
    const result = validateCoachResponse(
      validResponse({ message: "You are **amazing** at this." }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects a markdown heading", () => {
    const result = validateCoachResponse(
      validResponse({ message: "# Great job" }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects a markdown link", () => {
    const result = validateCoachResponse(
      validResponse({ message: "See [this link](https://example.com)." }),
    );
    expect(result.success).toBe(false);
  });

  it("accepts a null disclaimer and rejects a too-long one", () => {
    expect(
      validateCoachResponse(validResponse({ disclaimer: null })).success,
    ).toBe(true);
    expect(
      validateCoachResponse(validResponse({ disclaimer: "x".repeat(300) }))
        .success,
    ).toBe(false);
  });
});

describe("parseCoachResponseJson", () => {
  it("parses and validates a valid JSON string", () => {
    const result = parseCoachResponseJson(JSON.stringify(validResponse()));
    expect(result.success).toBe(true);
  });

  it("rejects invalid JSON", () => {
    const result = parseCoachResponseJson("not json {");
    expect(result.success).toBe(false);
  });

  it("rejects prose that happens to not be JSON at all", () => {
    const result = parseCoachResponseJson(
      "Great job today! Keep up the good work.",
    );
    expect(result.success).toBe(false);
  });
});
