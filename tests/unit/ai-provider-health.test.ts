import { describe, expect, it } from "vitest";
import { ProviderHealthTracker } from "@/modules/ai/shared/provider-health";

describe("ProviderHealthTracker", () => {
  it("reports a neutral healthy snapshot with no data yet", () => {
    const tracker = new ProviderHealthTracker();
    const snapshot = tracker.getSnapshot();

    expect(snapshot).toEqual({
      lastSuccessAt: null,
      status: "healthy",
      averageLatencyMs: 0,
      timeoutRatePercent: 0,
      sampleSize: 0,
    });
  });

  it("reports healthy after all-successful calls", () => {
    const tracker = new ProviderHealthTracker();
    tracker.recordSuccess(100);
    tracker.recordSuccess(200);

    const snapshot = tracker.getSnapshot();
    expect(snapshot.status).toBe("healthy");
    expect(snapshot.averageLatencyMs).toBe(150);
    expect(snapshot.sampleSize).toBe(2);
    expect(snapshot.lastSuccessAt).not.toBeNull();
  });

  it("reports degraded once failures make up a meaningful share of recent calls", () => {
    const tracker = new ProviderHealthTracker();
    tracker.recordSuccess(100);
    tracker.recordSuccess(100);
    tracker.recordFailure(500, false);
    tracker.recordFailure(500, true);

    const snapshot = tracker.getSnapshot();
    expect(snapshot.status).toBe("degraded");
    expect(snapshot.timeoutRatePercent).toBe(25);
  });

  it("reports down once nearly all recent calls have failed", () => {
    const tracker = new ProviderHealthTracker();
    for (let i = 0; i < 9; i += 1) {
      tracker.recordFailure(1000, true);
    }
    tracker.recordSuccess(100);

    const snapshot = tracker.getSnapshot();
    expect(snapshot.status).toBe("down");
    expect(snapshot.timeoutRatePercent).toBe(90);
  });

  it("keeps only the most recent calls within the rolling window", () => {
    const tracker = new ProviderHealthTracker();
    for (let i = 0; i < 60; i += 1) {
      tracker.recordSuccess(10);
    }
    tracker.recordFailure(10, true);

    const snapshot = tracker.getSnapshot();
    expect(snapshot.sampleSize).toBe(50);
  });

  it("does not update lastSuccessAt on a failure", () => {
    const tracker = new ProviderHealthTracker();
    tracker.recordSuccess(50);
    const afterSuccess = tracker.getSnapshot().lastSuccessAt;
    tracker.recordFailure(50, false);

    expect(tracker.getSnapshot().lastSuccessAt).toBe(afterSuccess);
  });
});
