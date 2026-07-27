import { describe, expect, it } from "vitest";
import { validateLearnerCoachingContext } from "@/modules/ai/validation/dto-validator";
import type { LearnerCoachingContext } from "@/modules/ai/coach/coach.types";

function validContext(
  overrides: Partial<LearnerCoachingContext> = {},
): LearnerCoachingContext {
  return {
    schemaVersion: "1.0",
    promptVersion: "coach-v1",
    audience: "parent",
    learnerDisplayName: "Amelia",
    generatedForDate: "2026-07-21",
    overallMastery: 62,
    overallAccuracy: 71,
    totalQuestionsAnswered: 40,
    currentStreak: 3,
    skillsDueForReview: 1,
    strongestSkills: [
      { name: "Addition", subject: "Maths", mastery: 90, confidence: 88 },
    ],
    focusSkills: [
      { name: "Fractions", subject: "Maths", mastery: 30, confidence: 25 },
    ],
    subjectInsights: [
      { subject: "Maths", mastery: 60, confidence: 55, accuracy: 65 },
    ],
    deterministicRecommendations: [
      {
        title: "Focus on a weak skill",
        description: "Focus on Fractions tomorrow.",
      },
    ],
    recentMission: {
      score: 12,
      totalQuestions: 16,
      durationMinutes: 18,
      completedAt: "2026-07-20T12:00:00.000Z",
    },
    upcomingFocusSkills: ["Fractions"],
    ...overrides,
  };
}

describe("validateLearnerCoachingContext", () => {
  it("accepts a fully-populated, well-formed context", () => {
    const result = validateLearnerCoachingContext(validContext());
    expect(result.success).toBe(true);
  });

  it("accepts an empty-state context (new learner, hasData: false equivalent)", () => {
    const result = validateLearnerCoachingContext(
      validContext({
        overallMastery: 0,
        overallAccuracy: 0,
        totalQuestionsAnswered: 0,
        currentStreak: 0,
        skillsDueForReview: 0,
        strongestSkills: [],
        focusSkills: [],
        subjectInsights: [],
        deterministicRecommendations: [],
        recentMission: null,
        upcomingFocusSkills: [],
      }),
    );
    expect(result.success).toBe(true);
  });

  it("rejects an empty learnerDisplayName", () => {
    const result = validateLearnerCoachingContext(
      validContext({ learnerDisplayName: "" }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects a mastery score outside 0-100", () => {
    const result = validateLearnerCoachingContext(
      validContext({ overallMastery: 150 }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects an unknown top-level field (schema is strict)", () => {
    const candidate = { ...validContext(), extraField: "not allowed" };
    const result = validateLearnerCoachingContext(candidate);
    expect(result.success).toBe(false);
  });

  it("rejects a wrong schemaVersion", () => {
    const result = validateLearnerCoachingContext({
      ...validContext(),
      schemaVersion: "2.0",
    });
    expect(result.success).toBe(false);
  });

  it("rejects more strongestSkills than the highlight limit", () => {
    const tooMany = Array.from({ length: 6 }, (_, i) => ({
      name: `Skill ${i}`,
      subject: "Maths",
      mastery: 50,
      confidence: 50,
    }));
    const result = validateLearnerCoachingContext(
      validContext({ strongestSkills: tooMany }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects a malformed generatedForDate", () => {
    const result = validateLearnerCoachingContext(
      validContext({ generatedForDate: "21-07-2026" }),
    );
    expect(result.success).toBe(false);
  });
});
