import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logger } from "@/lib/observability/logger";

describe("logger", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("writes info as structured JSON via console.log", () => {
    logger.info("something happened", { requestId: "req-1", foo: "bar" });

    expect(logSpy).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(logSpy.mock.calls[0]?.[0] as string);
    expect(parsed).toMatchObject({
      level: "info",
      message: "something happened",
      requestId: "req-1",
      foo: "bar",
    });
    expect(typeof parsed.timestamp).toBe("string");
    expect(() => new Date(parsed.timestamp).toISOString()).not.toThrow();
  });

  it("writes debug via console.log", () => {
    logger.debug("debugging");
    expect(logSpy).toHaveBeenCalledTimes(1);
  });

  it("writes warn via console.warn", () => {
    logger.warn("careful");
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(warnSpy.mock.calls[0]?.[0] as string);
    expect(parsed.level).toBe("warn");
  });

  it("writes error via console.error", () => {
    logger.error("broken", { requestId: "req-2" });
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(errorSpy.mock.calls[0]?.[0] as string);
    expect(parsed.level).toBe("error");
    expect(parsed.requestId).toBe("req-2");
  });

  it("omits context fields entirely when none are given", () => {
    logger.info("no context");
    const parsed = JSON.parse(logSpy.mock.calls[0]?.[0] as string);
    expect(Object.keys(parsed).sort()).toEqual(
      ["level", "message", "timestamp"].sort(),
    );
  });
});
