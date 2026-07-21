import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const captureException = vi.fn();

vi.mock("@sentry/nextjs", () => ({
  captureException: (...args: unknown[]) => captureException(...args),
}));

describe("withApiObservability", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    captureException.mockClear();
    logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("generates a request id and returns it on the response header", async () => {
    const { withApiObservability } = await import("@/lib/observability/api");
    const handler = withApiObservability("GET /test", async () =>
      Response.json({ ok: true }),
    );

    const response = await handler(new Request("http://localhost/test"), {
      params: Promise.resolve({}),
    });

    const requestId = response.headers.get("x-request-id");
    expect(requestId).toBeTruthy();
    expect(requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("reuses an incoming x-request-id header instead of generating a new one", async () => {
    const { withApiObservability } = await import("@/lib/observability/api");
    const handler = withApiObservability("GET /test", async () =>
      Response.json({ ok: true }),
    );

    const response = await handler(
      new Request("http://localhost/test", {
        headers: { "x-request-id": "caller-supplied-id" },
      }),
      { params: Promise.resolve({}) },
    );

    expect(response.headers.get("x-request-id")).toBe("caller-supplied-id");
  });

  it("passes the request id through to the handler", async () => {
    const { withApiObservability } = await import("@/lib/observability/api");
    let seenRequestId: string | undefined;
    const handler = withApiObservability(
      "GET /test",
      async (_request, _context, requestId) => {
        seenRequestId = requestId;
        return Response.json({ ok: true });
      },
    );

    await handler(
      new Request("http://localhost/test", {
        headers: { "x-request-id": "abc-123" },
      }),
      { params: Promise.resolve({}) },
    );

    expect(seenRequestId).toBe("abc-123");
  });

  it("logs structured start and completion entries", async () => {
    const { withApiObservability } = await import("@/lib/observability/api");
    const handler = withApiObservability("GET /test", async () =>
      Response.json({ ok: true }, { status: 201 }),
    );

    await handler(new Request("http://localhost/test"), {
      params: Promise.resolve({}),
    });

    expect(logSpy).toHaveBeenCalledTimes(2);
    const started = JSON.parse(logSpy.mock.calls[0]?.[0] as string);
    const completed = JSON.parse(logSpy.mock.calls[1]?.[0] as string);
    expect(started.message).toBe("api.request.started");
    expect(started.route).toBe("GET /test");
    expect(completed.message).toBe("api.request.completed");
    expect(completed.status).toBe(201);
    expect(typeof completed.durationMs).toBe("number");
  });

  it("reports unhandled errors to Sentry, logs them, and returns a safe 500", async () => {
    const { withApiObservability } = await import("@/lib/observability/api");
    const boom = new Error("boom");
    const handler = withApiObservability("GET /test", async () => {
      throw boom;
    });

    const response = await handler(new Request("http://localhost/test"), {
      params: Promise.resolve({}),
    });
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("Internal server error");
    expect(body.requestId).toBeTruthy();
    expect(response.headers.get("x-request-id")).toBe(body.requestId);

    expect(captureException).toHaveBeenCalledWith(
      boom,
      expect.objectContaining({
        tags: expect.objectContaining({ route: "GET /test" }),
      }),
    );

    const failedLog = JSON.parse(errorSpy.mock.calls[0]?.[0] as string);
    expect(failedLog.message).toBe("api.request.failed");
    expect(failedLog.error).toBe("boom");
  });

  it("never reports a normal error-status response (e.g. 404) to Sentry", async () => {
    const { withApiObservability } = await import("@/lib/observability/api");
    const handler = withApiObservability("GET /test", async () =>
      Response.json({ error: "not found" }, { status: 404 }),
    );

    await handler(new Request("http://localhost/test"), {
      params: Promise.resolve({}),
    });

    expect(captureException).not.toHaveBeenCalled();
  });
});
