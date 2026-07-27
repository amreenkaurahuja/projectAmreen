import { describe, expect, it, vi } from "vitest";
import {
  BudgetManager,
  estimateTokens,
  readBudgetConfigFromEnv,
} from "@/modules/ai/shared/budget-manager";

describe("readBudgetConfigFromEnv", () => {
  it("uses valid, positive env values as-is", () => {
    const config = readBudgetConfigFromEnv({
      AI_MONTHLY_BUDGET_GBP: "25",
      AI_ESTIMATED_GBP_PER_1K_TOKENS: "0.001",
    });
    expect(config).toEqual({
      monthlyBudgetGbp: 25,
      estimatedGbpPer1kTokens: 0.001,
    });
  });

  it("falls back to defaults for missing, non-numeric, or non-positive values", () => {
    expect(readBudgetConfigFromEnv({})).toEqual({
      monthlyBudgetGbp: 10,
      estimatedGbpPer1kTokens: 0.0002,
    });
    expect(
      readBudgetConfigFromEnv({
        AI_MONTHLY_BUDGET_GBP: "not-a-number",
        AI_ESTIMATED_GBP_PER_1K_TOKENS: "-5",
      }),
    ).toEqual({ monthlyBudgetGbp: 10, estimatedGbpPer1kTokens: 0.0002 });
  });
});

describe("estimateTokens", () => {
  it("estimates roughly 4 characters per token", () => {
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("a".repeat(40))).toBe(10);
  });
});

describe("BudgetManager", () => {
  it("allows requests while under budget", async () => {
    const manager = new BudgetManager({
      monthlyBudgetGbp: 10,
      estimatedGbpPer1kTokens: 0.0002,
    });

    const result = await manager.checkBudget();
    expect(result.allowed).toBe(true);
  });

  it("tracks daily and monthly usage after recording", async () => {
    const manager = new BudgetManager({
      monthlyBudgetGbp: 10,
      estimatedGbpPer1kTokens: 0.0002,
    });

    await manager.recordUsage(1000);
    await manager.recordUsage(500);

    const snapshot = manager.getSnapshot();
    expect(snapshot.dailyRequestCount).toBe(2);
    expect(snapshot.dailyEstimatedTokens).toBe(1500);
    expect(snapshot.monthlyEstimatedTokens).toBe(1500);
    expect(snapshot.monthlyEstimatedCostGbp).toBeCloseTo(0.0003, 6);
  });

  it("blocks once the estimated monthly cost reaches the budget (circuit breaker)", async () => {
    const manager = new BudgetManager({
      monthlyBudgetGbp: 0.001,
      estimatedGbpPer1kTokens: 1,
    });

    await manager.recordUsage(1000); // 1000 tokens * £1/1k = £1, already over £0.001
    const result = await manager.checkBudget();

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("£1.0000");
  });

  it("resets daily counters on a new day without resetting the monthly total", async () => {
    const manager = new BudgetManager({
      monthlyBudgetGbp: 10,
      estimatedGbpPer1kTokens: 0.0002,
    });

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-24T23:00:00.000Z"));
    await manager.recordUsage(1000);

    vi.setSystemTime(new Date("2026-07-25T01:00:00.000Z"));
    const snapshotNextDay = manager.getSnapshot();

    expect(snapshotNextDay.dailyRequestCount).toBe(0);
    expect(snapshotNextDay.dailyEstimatedTokens).toBe(0);
    expect(snapshotNextDay.monthlyEstimatedTokens).toBe(1000);

    vi.useRealTimers();
  });

  it("resets the monthly total on a new calendar month", async () => {
    const manager = new BudgetManager({
      monthlyBudgetGbp: 10,
      estimatedGbpPer1kTokens: 0.0002,
    });

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-31T23:00:00.000Z"));
    await manager.recordUsage(1000);

    vi.setSystemTime(new Date("2026-08-01T01:00:00.000Z"));
    const snapshotNextMonth = manager.getSnapshot();

    expect(snapshotNextMonth.monthlyEstimatedTokens).toBe(0);

    vi.useRealTimers();
  });
});
