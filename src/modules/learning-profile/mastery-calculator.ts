import type { AttemptEvent, MasteryState } from "./mastery.types";

// Pure, deterministic, no I/O — every value this module produces is a
// function of its explicit inputs. No AI, no system-clock reads (the
// caller always supplies `answeredAt`/`referenceTimestamp`). See
// docs/Architecture.md → "Learning profile & mastery" for the algorithm
// write-up this file implements.

export const DEFAULT_MASTERY_SCORE = 50;
export const DEFAULT_CONFIDENCE_SCORE = 50;
export const DEFAULT_DIFFICULTY = 3;
export const DEFAULT_TARGET_RESPONSE_MS = 30_000;

export function createInitialMasteryState(): MasteryState {
  return {
    masteryScore: DEFAULT_MASTERY_SCORE,
    confidenceScore: DEFAULT_CONFIDENCE_SCORE,
    totalAttempts: 0,
    correctAttempts: 0,
    incorrectAttempts: 0,
    averageResponseMs: null,
    lastResponseMs: null,
    currentStreak: 0,
    bestStreak: 0,
    currentIncorrectStreak: 0,
    lastAttemptCorrect: null,
    lastPractisedAt: null,
    nextReviewAt: null,
  };
}

/** Missing/invalid difficulty defaults to 3, per spec. */
export function resolveDifficulty(
  difficulty: number | null | undefined,
): number {
  if (difficulty == null || !Number.isFinite(difficulty))
    return DEFAULT_DIFFICULTY;
  if (difficulty < 1 || difficulty > 5) return DEFAULT_DIFFICULTY;
  return difficulty;
}

const CORRECT_MASTERY_DELTA: Record<number, number> = {
  1: 2,
  2: 3,
  3: 4,
  4: 5,
  5: 6,
};

const INCORRECT_MASTERY_DELTA: Record<number, number> = {
  1: -5,
  2: -4,
  3: -3,
  4: -2,
  5: -2,
};

export function computeMasteryDelta(
  isCorrect: boolean,
  difficulty: number | null | undefined,
): number {
  const resolved = resolveDifficulty(difficulty);
  return isCorrect
    ? CORRECT_MASTERY_DELTA[resolved]
    : INCORRECT_MASTERY_DELTA[resolved];
}

/**
 * "Third or later consecutive correct answer" is explicit in the spec
 * (streak >= 3). The incorrect side of the rule ("consecutive incorrect
 * answer: -1 additional mastery") doesn't state a minimum run length —
 * interpreted here as the 2nd-or-later consecutive incorrect answer
 * (streak >= 2), the natural complement: a single isolated mistake only
 * takes the normal difficulty-based penalty, a repeated one takes extra.
 */
export function computeConsistencyModifier(
  isCorrect: boolean,
  newCorrectStreak: number,
  newIncorrectStreak: number,
): number {
  if (isCorrect && newCorrectStreak >= 3) return 1;
  if (!isCorrect && newIncorrectStreak >= 2) return -1;
  return 0;
}

/**
 * targetResponseMs scales the fixed 15s / 30s / 60s bands proportionally
 * (target/2, target, target*2), so a future per-question target (see
 * docs/Database.md → known limitations — question_bank has no such column
 * today) can plug in without changing this function's shape. At the
 * default 30,000 ms target this produces exactly the literal thresholds
 * from the spec.
 */
export function computeConfidenceDelta(
  isCorrect: boolean,
  responseMs: number | null | undefined,
  targetResponseMs: number = DEFAULT_TARGET_RESPONSE_MS,
): number {
  if (responseMs == null) {
    return isCorrect ? 2 : -2;
  }

  const fast = targetResponseMs / 2;
  const moderate = targetResponseMs;
  const slow = targetResponseMs * 2;

  if (isCorrect) {
    if (responseMs <= fast) return 5;
    if (responseMs <= moderate) return 3;
    if (responseMs <= slow) return 1;
    return 0;
  }

  if (responseMs <= fast) return -4;
  if (responseMs <= moderate) return -3;
  if (responseMs <= slow) return -2;
  return -1;
}

export function clampScore(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function computeAverageResponseMs(
  previousAverage: number | null,
  previousTotalAttempts: number,
  responseMs: number | null,
): number | null {
  if (responseMs == null) return previousAverage;
  if (previousAverage == null || previousTotalAttempts <= 0) return responseMs;
  const total = previousAverage * previousTotalAttempts + responseMs;
  return Math.round(total / (previousTotalAttempts + 1));
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Deterministic — takes the reference "now" explicitly rather than reading
 * the system clock, so it's directly unit-testable. Uses the UPDATED
 * mastery score (computed earlier in the same attempt), not the
 * pre-attempt one, per spec.
 */
export function computeNextReviewAt(
  masteryScore: number,
  isCorrect: boolean,
  referenceTimestamp: Date,
): Date {
  let days: number;
  if (masteryScore < 40) days = 1;
  else if (masteryScore < 60) days = 3;
  else if (masteryScore < 80) days = 7;
  else if (masteryScore < 90) days = 14;
  else days = 30;

  // Override: an incorrect answer that leaves mastery below 60 always
  // schedules for the next day, regardless of which band it landed in.
  if (!isCorrect && masteryScore < 60) {
    days = 1;
  }

  return new Date(referenceTimestamp.getTime() + days * MS_PER_DAY);
}

/**
 * The single orchestrating reducer: given the mastery state going into an
 * attempt (use `createInitialMasteryState()` for a skill never attempted
 * before) and the attempt event, returns the full new state. Every field
 * is recomputed here — the caller persists the result as-is.
 */
export function applyAttemptToMastery(
  current: MasteryState,
  event: AttemptEvent,
): MasteryState {
  const { isCorrect, answeredAt } = event;
  const responseMs = event.responseMs == null ? null : event.responseMs;

  const currentStreak = isCorrect ? current.currentStreak + 1 : 0;
  const currentIncorrectStreak = isCorrect
    ? 0
    : current.currentIncorrectStreak + 1;
  const bestStreak = Math.max(current.bestStreak, currentStreak);

  const masteryDelta =
    computeMasteryDelta(isCorrect, event.difficulty) +
    computeConsistencyModifier(
      isCorrect,
      currentStreak,
      currentIncorrectStreak,
    );
  const masteryScore = clampScore(current.masteryScore + masteryDelta);

  const confidenceDelta = computeConfidenceDelta(isCorrect, responseMs);
  const confidenceScore = clampScore(current.confidenceScore + confidenceDelta);

  const averageResponseMs = computeAverageResponseMs(
    current.averageResponseMs,
    current.totalAttempts,
    responseMs,
  );

  const nextReviewAt = computeNextReviewAt(masteryScore, isCorrect, answeredAt);

  return {
    masteryScore,
    confidenceScore,
    totalAttempts: current.totalAttempts + 1,
    correctAttempts: current.correctAttempts + (isCorrect ? 1 : 0),
    incorrectAttempts: current.incorrectAttempts + (isCorrect ? 0 : 1),
    averageResponseMs,
    lastResponseMs: responseMs,
    currentStreak,
    bestStreak,
    currentIncorrectStreak,
    lastAttemptCorrect: isCorrect,
    lastPractisedAt: answeredAt.toISOString(),
    nextReviewAt: nextReviewAt.toISOString(),
  };
}
