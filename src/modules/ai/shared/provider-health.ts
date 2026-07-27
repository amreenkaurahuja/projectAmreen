const HISTORY_LIMIT = 50;

interface ProviderAttempt {
  success: boolean;
  timedOut: boolean;
  durationMs: number;
}

export type ProviderStatus = "healthy" | "degraded" | "down";

export interface ProviderHealthSnapshot {
  lastSuccessAt: string | null;
  status: ProviderStatus;
  averageLatencyMs: number;
  timeoutRatePercent: number;
  /** How many of the last (up to HISTORY_LIMIT) calls this snapshot is computed from — 0 means no data yet. */
  sampleSize: number;
}

/**
 * A rolling window of the provider's last HISTORY_LIMIT calls, for a quick
 * in-process "is Gemini currently healthy" signal — e.g. for a future
 * ops/status surface. In-memory and per-process: it resets on a cold
 * start, and on a serverless platform this reflects one warm instance's
 * recent history, not a true cross-instance aggregate. Every individual
 * call is already logged via shared/logger.ts regardless, which is what an
 * external aggregator should use for the durable, cross-instance picture —
 * this tracker is a cheap supplement, not a replacement for that.
 */
export class ProviderHealthTracker {
  private history: ProviderAttempt[] = [];
  private lastSuccessAt: number | null = null;

  recordSuccess(durationMs: number): void {
    this.record({ success: true, timedOut: false, durationMs });
    this.lastSuccessAt = Date.now();
  }

  recordFailure(durationMs: number, timedOut: boolean): void {
    this.record({ success: false, timedOut, durationMs });
  }

  getSnapshot(): ProviderHealthSnapshot {
    const sampleSize = this.history.length;

    if (sampleSize === 0) {
      return {
        lastSuccessAt: null,
        status: "healthy",
        averageLatencyMs: 0,
        timeoutRatePercent: 0,
        sampleSize: 0,
      };
    }

    const averageLatencyMs = Math.round(
      this.history.reduce((sum, a) => sum + a.durationMs, 0) / sampleSize,
    );
    const timeoutCount = this.history.filter((a) => a.timedOut).length;
    const timeoutRatePercent = Math.round((timeoutCount / sampleSize) * 100);
    const failureRate =
      this.history.filter((a) => !a.success).length / sampleSize;

    let status: ProviderStatus = "healthy";
    if (failureRate >= 0.8) status = "down";
    else if (failureRate >= 0.3) status = "degraded";

    return {
      lastSuccessAt: this.lastSuccessAt
        ? new Date(this.lastSuccessAt).toISOString()
        : null,
      status,
      averageLatencyMs,
      timeoutRatePercent,
      sampleSize,
    };
  }

  private record(attempt: ProviderAttempt): void {
    this.history.push(attempt);
    if (this.history.length > HISTORY_LIMIT) {
      this.history.shift();
    }
  }
}

/** The instance every request shares within a warm process — see the class doc comment. */
export const sharedProviderHealth = new ProviderHealthTracker();
