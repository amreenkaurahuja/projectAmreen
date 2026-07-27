import { describe, expect, it } from "vitest";
import { buildFallbackCoachResponse } from "@/modules/ai/coach/fallback-coach";
import { validateCoachResponse } from "@/modules/ai/validation/response-validator";
import { validateGrounding } from "@/modules/ai/validation/grounding-validator";
import type { LearnerCoachingContext } from "@/modules/ai/coach/coach.types";

function context(
  audience: "learner" | "parent",
  overrides: Partial<LearnerCoachingContext> = {},
): LearnerCoachingContext {
  return {
    schemaVersion: "1.0",
    promptVersion: "coach-v1",
    audience,
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

describe("buildFallbackCoachResponse", () => {
  it("builds a valid response for an empty-state learner context", () => {
    const response = buildFallbackCoachResponse(context("learner"));
    expect(validateCoachResponse(response).success).toBe(true);
    expect(validateGrounding(response, context("learner"))).toEqual([]);
  });

  it("builds a valid response for an empty-state parent context", () => {
    const response = buildFallbackCoachResponse(context("parent"));
    expect(validateCoachResponse(response).success).toBe(true);
    expect(validateGrounding(response, context("parent"))).toEqual([]);
  });

  it("mentions the learner's strongest skill, focus skill, and tomorrow's focus for the learner audience", () => {
    const ctx = context("learner", {
      strongestSkills: [
        { name: "Addition", subject: "Maths", mastery: 90, confidence: 85 },
      ],
      focusSkills: [
        { name: "Fractions", subject: "Maths", mastery: 30, confidence: 25 },
      ],
      upcomingFocusSkills: ["Fractions"],
    });
    const response = buildFallbackCoachResponse(ctx);

    expect(response.message).toContain("Addition");
    expect(response.message).toContain("Fractions");
    expect(response.strengths).toEqual(["Addition"]);
    expect(response.focusAreas).toEqual(["Fractions"]);
  });

  it("reuses the deterministic recommendations verbatim as next steps for the parent audience", () => {
    const ctx = context("parent", {
      deterministicRecommendations: [
        {
          title: "Practise overdue skills",
          description: "Practice overdue skills: Fractions.",
        },
      ],
    });
    const response = buildFallbackCoachResponse(ctx);
    expect(response.nextSteps).toEqual(["Practice overdue skills: Fractions."]);
  });

  it("mentions the strongest and focus skill for a parent context with skill data", () => {
    const ctx = context("parent", {
      strongestSkills: [
        { name: "Addition", subject: "Maths", mastery: 90, confidence: 85 },
      ],
      focusSkills: [
        { name: "Fractions", subject: "Maths", mastery: 30, confidence: 25 },
      ],
    });
    const response = buildFallbackCoachResponse(ctx);

    expect(response.message).toContain("Strongest area: Addition.");
    expect(response.message).toContain("Focus area: Fractions.");
    expect(response.strengths).toEqual(["Addition"]);
    expect(response.focusAreas).toEqual(["Fractions"]);
  });

  it("never mentions percentages for the learner audience", () => {
    const response = buildFallbackCoachResponse(context("learner"));
    const combined = [
      response.headline,
      response.message,
      ...response.strengths,
      ...response.focusAreas,
      ...response.nextSteps,
    ].join(" ");
    expect(combined).not.toContain("%");
  });
});
