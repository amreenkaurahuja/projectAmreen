import { describe, expect, it } from "vitest";
import { isQuestionExplainerMetricsEnabled } from "@/modules/question-explainer/metrics-feature-flag";

describe("isQuestionExplainerMetricsEnabled", () => {
  it("returns true only for the literal string 'true'", () => {
    expect(
      isQuestionExplainerMetricsEnabled({
        NEXT_PUBLIC_QUESTION_EXPLAINER_METRICS_ENABLED: "true",
      }),
    ).toBe(true);
  });

  it("defaults to disabled when the variable is absent", () => {
    expect(isQuestionExplainerMetricsEnabled({})).toBe(false);
  });

  it.each(["1", "yes", "TRUE", "True", " true", "true ", "false", ""])(
    "treats %j as disabled, not just anything falsy",
    (value) => {
      expect(
        isQuestionExplainerMetricsEnabled({
          NEXT_PUBLIC_QUESTION_EXPLAINER_METRICS_ENABLED: value,
        }),
      ).toBe(false);
    },
  );

  it("never throws regardless of input", () => {
    expect(() =>
      isQuestionExplainerMetricsEnabled({
        NEXT_PUBLIC_QUESTION_EXPLAINER_METRICS_ENABLED: undefined,
      }),
    ).not.toThrow();
  });

  it("reads from process.env by default when no env is supplied", () => {
    // Doesn't assert a particular value (CI/local env may vary) — only
    // that calling it with the real default argument never throws and
    // always returns a boolean.
    expect(typeof isQuestionExplainerMetricsEnabled()).toBe("boolean");
  });
});
