import { describe, expect, it } from "vitest";
import { isSentryEnabled } from "@/lib/observability/sentry-enablement";

describe("isSentryEnabled", () => {
  it("is disabled when the flag is unset", () => {
    expect(isSentryEnabled({}, "SENTRY_ENABLED")).toBe(false);
  });

  it("is disabled for any value other than the literal string 'true'", () => {
    expect(isSentryEnabled({ SENTRY_ENABLED: "1" }, "SENTRY_ENABLED")).toBe(
      false,
    );
    expect(isSentryEnabled({ SENTRY_ENABLED: "TRUE" }, "SENTRY_ENABLED")).toBe(
      false,
    );
  });

  it("is enabled only when explicitly set to 'true'", () => {
    expect(isSentryEnabled({ SENTRY_ENABLED: "true" }, "SENTRY_ENABLED")).toBe(
      true,
    );
  });

  it("checks the client flag independently of the server flag", () => {
    expect(
      isSentryEnabled({ SENTRY_ENABLED: "true" }, "NEXT_PUBLIC_SENTRY_ENABLED"),
    ).toBe(false);
    expect(
      isSentryEnabled(
        { NEXT_PUBLIC_SENTRY_ENABLED: "true" },
        "NEXT_PUBLIC_SENTRY_ENABLED",
      ),
    ).toBe(true);
  });
});
