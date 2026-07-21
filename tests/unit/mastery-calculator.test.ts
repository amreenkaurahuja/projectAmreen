import { describe, expect, it } from "vitest";
import {
  applyAttemptToMastery,
  clampScore,
  computeAverageResponseMs,
  computeConfidenceDelta,
  computeConsistencyModifier,
  computeMasteryDelta,
  computeNextReviewAt,
  createInitialMasteryState,
  resolveDifficulty,
} from "@/modules/learning-profile/mastery-calculator";
import type {
  AttemptEvent,
  MasteryState,
} from "@/modules/learning-profile/mastery.types";

const REF = new Date("2026-07-21T00:00:00.000Z");

function event(overrides: Partial<AttemptEvent> = {}): AttemptEvent {
  return {
    isCorrect: true,
    difficulty: 3,
    responseMs: 20_000,
    answeredAt: REF,
    ...overrides,
  };
}

describe("createInitialMasteryState", () => {
  it("starts a new skill at mastery 50 / confidence 50 with zeroed counters", () => {
    const state = createInitialMasteryState();

    expect(state.masteryScore).toBe(50);
    expect(state.confidenceScore).toBe(50);
    expect(state.totalAttempts).toBe(0);
    expect(state.correctAttempts).toBe(0);
    expect(state.incorrectAttempts).toBe(0);
    expect(state.currentStreak).toBe(0);
    expect(state.bestStreak).toBe(0);
    expect(state.currentIncorrectStreak).toBe(0);
    expect(state.lastAttemptCorrect).toBeNull();
    expect(state.lastPractisedAt).toBeNull();
    expect(state.nextReviewAt).toBeNull();
    expect(state.averageResponseMs).toBeNull();
    expect(state.lastResponseMs).toBeNull();
  });
});

describe("resolveDifficulty", () => {
  it.each([null, undefined, NaN, 0, 6, -1])("defaults %s to 3", (input) => {
    expect(resolveDifficulty(input as number | null | undefined)).toBe(3);
  });

  it.each([1, 2, 3, 4, 5])("passes through a valid difficulty %i", (input) => {
    expect(resolveDifficulty(input)).toBe(input);
  });
});

describe("computeMasteryDelta — correct answers", () => {
  it.each([
    [1, 2],
    [2, 3],
    [3, 4],
    [4, 5],
    [5, 6],
  ])("difficulty %i awards +%i", (difficulty, expected) => {
    expect(computeMasteryDelta(true, difficulty)).toBe(expected);
  });

  it("missing difficulty is treated as 3 (+4)", () => {
    expect(computeMasteryDelta(true, null)).toBe(4);
    expect(computeMasteryDelta(true, undefined)).toBe(4);
  });
});

describe("computeMasteryDelta — incorrect answers", () => {
  it.each([
    [1, -5],
    [2, -4],
    [3, -3],
    [4, -2],
    [5, -2],
  ])("difficulty %i penalises %i", (difficulty, expected) => {
    expect(computeMasteryDelta(false, difficulty)).toBe(expected);
  });

  it("missing difficulty is treated as 3 (-3)", () => {
    expect(computeMasteryDelta(false, null)).toBe(-3);
  });
});

describe("computeConsistencyModifier", () => {
  it("gives no bonus for the first two consecutive correct answers", () => {
    expect(computeConsistencyModifier(true, 1, 0)).toBe(0);
    expect(computeConsistencyModifier(true, 2, 0)).toBe(0);
  });

  it("gives +1 from the third consecutive correct answer onward", () => {
    expect(computeConsistencyModifier(true, 3, 0)).toBe(1);
    expect(computeConsistencyModifier(true, 4, 0)).toBe(1);
  });

  it("gives no extra penalty for a single isolated incorrect answer", () => {
    expect(computeConsistencyModifier(false, 0, 1)).toBe(0);
  });

  it("gives -1 from the second consecutive incorrect answer onward", () => {
    expect(computeConsistencyModifier(false, 0, 2)).toBe(-1);
    expect(computeConsistencyModifier(false, 0, 3)).toBe(-1);
  });
});

describe("computeConfidenceDelta — timing bands", () => {
  it.each([
    [15_000, 5],
    [30_000, 3],
    [60_000, 1],
    [60_001, 0],
  ])("correct answer in %i ms awards %i", (ms, expected) => {
    expect(computeConfidenceDelta(true, ms)).toBe(expected);
  });

  it.each([
    [15_000, -4],
    [30_000, -3],
    [60_000, -2],
    [60_001, -1],
  ])("incorrect answer in %i ms penalises %i", (ms, expected) => {
    expect(computeConfidenceDelta(false, ms)).toBe(expected);
  });

  it("boundary just above the fast band uses the moderate band", () => {
    expect(computeConfidenceDelta(true, 15_001)).toBe(3);
    expect(computeConfidenceDelta(false, 15_001)).toBe(-3);
  });
});

describe("computeConfidenceDelta — null response time", () => {
  it("awards +2 confidence for a correct answer with no timing data", () => {
    expect(computeConfidenceDelta(true, null)).toBe(2);
  });

  it("penalises -2 confidence for an incorrect answer with no timing data", () => {
    expect(computeConfidenceDelta(false, null)).toBe(-2);
  });
});

describe("clampScore", () => {
  it("clamps above 100 down to 100", () => {
    expect(clampScore(150)).toBe(100);
  });

  it("clamps below 0 up to 0", () => {
    expect(clampScore(-20)).toBe(0);
  });

  it("leaves in-range values untouched (rounded)", () => {
    expect(clampScore(63.4)).toBe(63);
    expect(clampScore(63.6)).toBe(64);
  });
});

describe("computeAverageResponseMs", () => {
  it("seeds the average from the first recorded response time", () => {
    expect(computeAverageResponseMs(null, 0, 10_000)).toBe(10_000);
  });

  it("computes a running weighted average", () => {
    // previous average 10,000 over 3 attempts -> total 30,000; +20,000 -> 50,000 / 4 = 12,500
    expect(computeAverageResponseMs(10_000, 3, 20_000)).toBe(12_500);
  });

  it("leaves the average unchanged when this attempt has no response time", () => {
    expect(computeAverageResponseMs(10_000, 3, null)).toBe(10_000);
  });

  it("stays null when there is still no data at all", () => {
    expect(computeAverageResponseMs(null, 0, null)).toBeNull();
  });
});

describe("computeNextReviewAt", () => {
  it.each([
    [0, 1],
    [39, 1],
    [40, 3],
    [59, 3],
    [60, 7],
    [79, 7],
    [80, 14],
    [89, 14],
    [90, 30],
    [100, 30],
  ])(
    "mastery %i schedules %i day(s) out on a correct answer",
    (mastery, days) => {
      const result = computeNextReviewAt(mastery, true, REF);
      expect(result.getTime()).toBe(REF.getTime() + days * 24 * 60 * 60 * 1000);
    },
  );

  it("overrides to next-day for an incorrect answer when mastery is below 60", () => {
    const result = computeNextReviewAt(55, false, REF);
    expect(result.getTime()).toBe(REF.getTime() + 24 * 60 * 60 * 1000);
  });

  it("does not override an incorrect answer once mastery is 60 or above", () => {
    const result = computeNextReviewAt(65, false, REF);
    expect(result.getTime()).toBe(REF.getTime() + 7 * 24 * 60 * 60 * 1000);
  });

  it("is deterministic: the same inputs always produce the same output", () => {
    const a = computeNextReviewAt(72, true, REF);
    const b = computeNextReviewAt(72, true, REF);
    expect(a.getTime()).toBe(b.getTime());
  });

  it("scheduling shifts with a different reference timestamp", () => {
    const other = new Date("2020-01-01T00:00:00.000Z");
    const result = computeNextReviewAt(72, true, other);
    expect(result.toISOString()).toBe("2020-01-08T00:00:00.000Z");
  });
});

describe("applyAttemptToMastery", () => {
  it("applies a correct first attempt to a brand-new skill", () => {
    const state = applyAttemptToMastery(
      createInitialMasteryState(),
      event({ isCorrect: true, difficulty: 3, responseMs: 10_000 }),
    );

    expect(state.masteryScore).toBe(54); // 50 + 4 (difficulty 3 correct)
    expect(state.confidenceScore).toBe(55); // 50 + 5 (<=15,000ms)
    expect(state.totalAttempts).toBe(1);
    expect(state.correctAttempts).toBe(1);
    expect(state.incorrectAttempts).toBe(0);
    expect(state.currentStreak).toBe(1);
    expect(state.bestStreak).toBe(1);
    expect(state.currentIncorrectStreak).toBe(0);
    expect(state.lastAttemptCorrect).toBe(true);
    expect(state.lastResponseMs).toBe(10_000);
    expect(state.averageResponseMs).toBe(10_000);
    expect(state.lastPractisedAt).toBe(REF.toISOString());
  });

  it("builds a correct streak bonus from the third consecutive correct answer", () => {
    let state: MasteryState = createInitialMasteryState();
    for (let i = 0; i < 3; i += 1) {
      state = applyAttemptToMastery(
        state,
        event({ isCorrect: true, difficulty: 3, responseMs: 20_000 }),
      );
    }

    // attempt 1: 50 + 4 = 54 (streak 1, no bonus)
    // attempt 2: 54 + 4 = 58 (streak 2, no bonus)
    // attempt 3: 58 + 4 + 1 = 63 (streak 3, +1 bonus)
    expect(state.currentStreak).toBe(3);
    expect(state.masteryScore).toBe(63);
  });

  it("resets the correct streak and applies the incorrect streak penalty", () => {
    let state: MasteryState = createInitialMasteryState();
    state = applyAttemptToMastery(state, event({ isCorrect: true }));
    state = applyAttemptToMastery(state, event({ isCorrect: true }));
    expect(state.currentStreak).toBe(2);

    state = applyAttemptToMastery(
      state,
      event({ isCorrect: false, difficulty: 3 }),
    );
    expect(state.currentStreak).toBe(0); // streak reset
    expect(state.currentIncorrectStreak).toBe(1); // first miss, no extra penalty yet

    state = applyAttemptToMastery(
      state,
      event({ isCorrect: false, difficulty: 3 }),
    );
    expect(state.currentIncorrectStreak).toBe(2); // second miss in a row -> extra -1 applied
  });

  it("tracks the best streak independently of the current one", () => {
    let state: MasteryState = createInitialMasteryState();
    for (let i = 0; i < 4; i += 1) {
      state = applyAttemptToMastery(state, event({ isCorrect: true }));
    }
    expect(state.bestStreak).toBe(4);

    state = applyAttemptToMastery(state, event({ isCorrect: false }));
    expect(state.currentStreak).toBe(0);
    expect(state.bestStreak).toBe(4); // best streak is not reduced by a later miss

    state = applyAttemptToMastery(state, event({ isCorrect: true }));
    expect(state.currentStreak).toBe(1);
    expect(state.bestStreak).toBe(4); // not yet beaten
  });

  it("clamps mastery at 100 for a learner who is already maxed out", () => {
    const maxed: MasteryState = {
      ...createInitialMasteryState(),
      masteryScore: 99,
    };
    const state = applyAttemptToMastery(
      maxed,
      event({ isCorrect: true, difficulty: 5 }),
    );
    expect(state.masteryScore).toBe(100);
  });

  it("clamps mastery at 0 for a learner already at the floor", () => {
    const floored: MasteryState = {
      ...createInitialMasteryState(),
      masteryScore: 1,
    };
    const state = applyAttemptToMastery(
      floored,
      event({ isCorrect: false, difficulty: 1 }),
    );
    expect(state.masteryScore).toBe(0);
  });

  it("computes next_review_at from the updated mastery score, not the pre-attempt one", () => {
    const nearBand: MasteryState = {
      ...createInitialMasteryState(),
      masteryScore: 36,
    };
    const state = applyAttemptToMastery(
      nearBand,
      event({
        isCorrect: true,
        difficulty: 5,
        responseMs: 5_000,
        answeredAt: REF,
      }),
    );
    // 36 + 6 (difficulty 5 correct) = 42 -> lands in the 40-59 band (3 days),
    // not the <40 band (1 day) the pre-attempt score of 36 would have used.
    expect(state.masteryScore).toBe(42);
    expect(state.nextReviewAt).toBe(
      new Date(REF.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString(),
    );
  });
});
