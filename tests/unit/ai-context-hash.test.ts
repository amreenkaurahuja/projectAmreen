import { describe, expect, it } from "vitest";
import { canonicalJsonStringify } from "@/modules/ai/shared/canonical-json";
import {
  computeContextHash,
  contextHashPrefix,
} from "@/modules/ai/cache/context-hash";
import type { LearnerCoachingContext } from "@/modules/ai/coach/coach.types";

function context(
  overrides: Partial<LearnerCoachingContext> = {},
): LearnerCoachingContext {
  return {
    schemaVersion: "1.0",
    promptVersion: "coach-v1",
    audience: "parent",
    learnerDisplayName: "Amelia",
    generatedForDate: "2026-07-21",
    overallMastery: 60,
    overallAccuracy: 65,
    totalQuestionsAnswered: 10,
    currentStreak: 2,
    skillsDueForReview: 0,
    strongestSkills: [],
    focusSkills: [],
    subjectInsights: [],
    deterministicRecommendations: [],
    recentMission: null,
    upcomingFocusSkills: [],
    ...overrides,
  };
}

describe("canonicalJsonStringify", () => {
  it("produces the same string regardless of key insertion order", () => {
    const a = canonicalJsonStringify({ a: 1, b: 2 });
    const b = canonicalJsonStringify({ b: 2, a: 1 });
    expect(a).toBe(b);
  });

  it("sorts keys recursively inside nested objects and arrays", () => {
    const a = canonicalJsonStringify({ x: [{ b: 1, a: 2 }] });
    const b = canonicalJsonStringify({ x: [{ a: 2, b: 1 }] });
    expect(a).toBe(b);
  });
});

describe("computeContextHash", () => {
  it("is deterministic for the same context", () => {
    const ctx = context();
    expect(computeContextHash(ctx)).toBe(computeContextHash(ctx));
  });

  it("changes when the context changes", () => {
    const hashA = computeContextHash(context({ overallMastery: 60 }));
    const hashB = computeContextHash(context({ overallMastery: 61 }));
    expect(hashA).not.toBe(hashB);
  });
});

describe("contextHashPrefix", () => {
  it("returns the first N characters", () => {
    const hash = computeContextHash(context());
    expect(contextHashPrefix(hash)).toBe(hash.slice(0, 8));
    expect(contextHashPrefix(hash, 4)).toBe(hash.slice(0, 4));
  });
});
