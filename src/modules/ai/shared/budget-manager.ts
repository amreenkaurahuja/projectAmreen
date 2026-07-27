export interface BudgetManagerConfig {
  monthlyBudgetGbp: number;
  /** Placeholder — replace with the provider's actual per-1k-token price before relying on this for real budget protection. */
  estimatedGbpPer1kTokens: number;
}

export interface BudgetCheckResult {
  allowed: boolean;
  reason?: string;
}

export interface BudgetSnapshot {
  dailyRequestCount: number;
  dailyEstimatedTokens: number;
  monthlyEstimatedTokens: number;
  monthlyEstimatedCostGbp: number;
}

/** ~4 characters per token — a common rough heuristic for English text. Good enough for an approximate budget guard, not for exact billing. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Tracks estimated AI usage and acts as a circuit breaker once the
 * estimated monthly cost reaches the configured budget — at that point
 * every request is treated as "AI unavailable" and goes to the
 * deterministic fallback, the same as a disabled flag or a provider
 * outage.
 *
 * In-memory, per-process only: counters reset on a cold start, and on a
 * serverless platform (Vercel) this tracks usage per warm instance, not a
 * single global total across every instance. That's a real limitation —
 * a production deployment that actually needs to enforce a hard billing
 * cap should back this with a shared store (e.g. a Supabase table
 * incremented per request) instead. This is still worth having as-is: an
 * approximate, fail-safe guard against a single runaway warm instance is
 * meaningfully better than no guard at all, and it costs nothing extra to
 * wire in. It is not a substitute for the provider's own billing alerts.
 */
export class BudgetManager {
  private dailyKey = "";
  private dailyRequestCount = 0;
  private dailyEstimatedTokens = 0;
  private monthlyKey = "";
  private monthlyEstimatedTokens = 0;

  constructor(private readonly config: BudgetManagerConfig) {}

  async checkBudget(): Promise<BudgetCheckResult> {
    const snapshot = this.getSnapshot();
    if (snapshot.monthlyEstimatedCostGbp >= this.config.monthlyBudgetGbp) {
      return {
        allowed: false,
        reason: `Estimated monthly AI cost (£${snapshot.monthlyEstimatedCostGbp.toFixed(4)}) has reached the £${this.config.monthlyBudgetGbp.toFixed(2)} budget`,
      };
    }
    return { allowed: true };
  }

  async recordUsage(estimatedTokens: number): Promise<void> {
    this.rollPeriodsIfNeeded();
    this.dailyRequestCount += 1;
    this.dailyEstimatedTokens += estimatedTokens;
    this.monthlyEstimatedTokens += estimatedTokens;
  }

  getSnapshot(): BudgetSnapshot {
    this.rollPeriodsIfNeeded();
    return {
      dailyRequestCount: this.dailyRequestCount,
      dailyEstimatedTokens: this.dailyEstimatedTokens,
      monthlyEstimatedTokens: this.monthlyEstimatedTokens,
      monthlyEstimatedCostGbp:
        (this.monthlyEstimatedTokens / 1000) *
        this.config.estimatedGbpPer1kTokens,
    };
  }

  private rollPeriodsIfNeeded(): void {
    const now = new Date();
    const dayKey = now.toISOString().slice(0, 10);
    const monthKey = now.toISOString().slice(0, 7);

    if (dayKey !== this.dailyKey) {
      this.dailyKey = dayKey;
      this.dailyRequestCount = 0;
      this.dailyEstimatedTokens = 0;
    }
    if (monthKey !== this.monthlyKey) {
      this.monthlyKey = monthKey;
      this.monthlyEstimatedTokens = 0;
    }
  }
}

const DEFAULT_MONTHLY_BUDGET_GBP = 10;
const DEFAULT_ESTIMATED_GBP_PER_1K_TOKENS = 0.0002;

export function readBudgetConfigFromEnv(
  env: Record<string, string | undefined>,
): BudgetManagerConfig {
  const monthlyBudgetGbp = Number(env.AI_MONTHLY_BUDGET_GBP);
  const estimatedGbpPer1kTokens = Number(env.AI_ESTIMATED_GBP_PER_1K_TOKENS);
  return {
    monthlyBudgetGbp:
      Number.isFinite(monthlyBudgetGbp) && monthlyBudgetGbp > 0
        ? monthlyBudgetGbp
        : DEFAULT_MONTHLY_BUDGET_GBP,
    estimatedGbpPer1kTokens:
      Number.isFinite(estimatedGbpPer1kTokens) && estimatedGbpPer1kTokens > 0
        ? estimatedGbpPer1kTokens
        : DEFAULT_ESTIMATED_GBP_PER_1K_TOKENS,
  };
}

/**
 * One shared instance for the lifetime of this module. Node caches modules
 * per process, so every import of this file within the same warm
 * serverless instance gets the same BudgetManager, and its counters
 * accumulate across requests — which is the entire point of tracking a
 * monthly total. Configuration is read once, from the environment at
 * first import; changing AI_MONTHLY_BUDGET_GBP takes effect on the next
 * cold start, not immediately.
 */
export const sharedBudgetManager = new BudgetManager(
  readBudgetConfigFromEnv(process.env),
);
