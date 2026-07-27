import { describe, expect, it } from "vitest";
import { validateGrounding } from "@/modules/ai/validation/grounding-validator";
import type {
  CoachResponse,
  LearnerCoachingContext,
} from "@/modules/ai/coach/coach.types";

function context(
  overrides: Partial<LearnerCoachingContext> = {},
): LearnerCoachingContext {
  return {
    schemaVersion: "1.0",
    promptVersion: "coach-v1",
    audience: "learner",
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

function response(overrides: Partial<CoachResponse> = {}): CoachResponse {
  return {
    headline: "Great effort today!",
    message: "You're doing really well.",
    strengths: [],
    focusAreas: [],
    nextSteps: [],
    disclaimer: null,
    ...overrides,
  };
}

describe("validateGrounding: banned phrases", () => {
  it("passes a clean response", () => {
    expect(validateGrounding(response(), context())).toEqual([]);
  });

  it("flags diagnostic language", () => {
    const violations = validateGrounding(
      response({ message: "This may indicate a learning disability." }),
      context(),
    );
    expect(violations.length).toBeGreaterThan(0);
  });

  it("flags comparative language", () => {
    const violations = validateGrounding(
      response({ message: "They are doing better than other children." }),
      context(),
    );
    expect(violations.length).toBeGreaterThan(0);
  });

  it("flags predictive language", () => {
    const violations = validateGrounding(
      response({ message: "At this rate they will definitely pass." }),
      context(),
    );
    expect(violations.length).toBeGreaterThan(0);
  });

  it("flags ranking language", () => {
    const violations = validateGrounding(
      response({ message: "This learner is a gifted, top student." }),
      context(),
    );
    expect(violations.length).toBeGreaterThan(0);
  });

  it("flags excessive study-time advice", () => {
    const violations = validateGrounding(
      response({ message: "Spend 2 hours every evening on times tables." }),
      context({ audience: "parent" }),
    );
    expect(
      violations.some((v) => v.reason.includes("excessive study-time")),
    ).toBe(true);
  });
});

describe("validateGrounding: percentages", () => {
  it("flags a percentage for a learner audience", () => {
    const violations = validateGrounding(
      response({ message: "You scored well percent-wise this week." }),
      context({ audience: "learner" }),
    );
    expect(violations).toEqual([
      { reason: "Learner-facing message must not mention percentages" },
    ]);
  });

  it("does not flag a percentage-free number for a parent audience", () => {
    const violations = validateGrounding(
      response({ message: "They answered 10 questions this week." }),
      context({ audience: "parent", totalQuestionsAnswered: 10 }),
    );
    expect(violations).toEqual([]);
  });
});

describe("validateGrounding: skill/recommendation grounding", () => {
  it("rejects a strength that names a skill not in strongestSkills", () => {
    const ctx = context({
      strongestSkills: [
        { name: "Vocabulary", subject: "English", mastery: 90, confidence: 85 },
      ],
    });
    const violations = validateGrounding(
      response({ strengths: ["Excellent work with Algebra"] }),
      ctx,
    );
    expect(
      violations.some((v) =>
        v.reason.includes('Strength "Excellent work with Algebra"'),
      ),
    ).toBe(true);
  });

  it("accepts a strength that matches a known strongest skill", () => {
    const ctx = context({
      strongestSkills: [
        { name: "Vocabulary", subject: "English", mastery: 90, confidence: 85 },
      ],
    });
    const violations = validateGrounding(
      response({ strengths: ["Vocabulary"] }),
      ctx,
    );
    expect(violations).toEqual([]);
  });

  it("skips strength grounding entirely when strongestSkills is empty", () => {
    const violations = validateGrounding(
      response({ strengths: ["Anything at all"] }),
      context({ strongestSkills: [] }),
    );
    expect(violations).toEqual([]);
  });

  it("rejects a focus area not in focusSkills or recommendations", () => {
    const ctx = context({
      focusSkills: [
        { name: "Fractions", subject: "Maths", mastery: 30, confidence: 25 },
      ],
    });
    const violations = validateGrounding(
      response({ focusAreas: ["Improve Geometry"] }),
      ctx,
    );
    expect(
      violations.some((v) =>
        v.reason.includes('Focus area "Improve Geometry"'),
      ),
    ).toBe(true);
  });

  it("accepts a focus area grounded in a recommendation instead of focusSkills", () => {
    const ctx = context({
      focusSkills: [],
      deterministicRecommendations: [
        {
          title: "Practise overdue skills",
          description: "Practice overdue skills: Fractions.",
        },
      ],
    });
    const violations = validateGrounding(
      response({ focusAreas: ["Practise overdue skills"] }),
      ctx,
    );
    expect(violations).toEqual([]);
  });

  it("rejects a next step that doesn't originate from a recommendation or upcoming focus skill", () => {
    const ctx = context({
      deterministicRecommendations: [],
      upcomingFocusSkills: ["Fractions"],
    });
    const violations = validateGrounding(
      response({ nextSteps: ["Do some algebra revision"] }),
      ctx,
    );
    expect(
      violations.some((v) =>
        v.reason.includes('Next step "Do some algebra revision"'),
      ),
    ).toBe(true);
  });

  it("accepts a next step grounded in upcomingFocusSkills", () => {
    const ctx = context({ upcomingFocusSkills: ["Fractions"] });
    const violations = validateGrounding(
      response({ nextSteps: ["Practise Fractions tomorrow."] }),
      ctx,
    );
    expect(violations).toEqual([]);
  });
});

describe("validateGrounding: number validation", () => {
  it("rejects a number not present anywhere in the DTO", () => {
    const violations = validateGrounding(
      response({ message: "You've studied for 8 days in a row." }),
      context({ currentStreak: 5 }),
    );
    expect(violations.some((v) => v.reason.includes('number ("8")'))).toBe(
      true,
    );
  });

  it("accepts a number that matches the current streak", () => {
    const violations = validateGrounding(
      response({ message: "You've studied for 5 days in a row." }),
      context({ currentStreak: 5 }),
    );
    expect(violations).toEqual([]);
  });

  it("accepts numbers from the recent mission summary", () => {
    const violations = validateGrounding(
      response({
        message: "You answered 14 out of 16 questions.",
      }),
      context({
        recentMission: {
          score: 14,
          totalQuestions: 16,
          durationMinutes: 20,
          completedAt: "2026-07-20T12:00:00.000Z",
        },
      }),
    );
    expect(violations).toEqual([]);
  });
});

describe("validateGrounding: word count", () => {
  it("rejects a learner response over 80 words", () => {
    const longMessage = Array.from({ length: 85 }, () => "word").join(" ");
    const violations = validateGrounding(
      response({ message: longMessage }),
      context({ audience: "learner" }),
    );
    expect(violations.some((v) => v.reason.includes("word limit"))).toBe(true);
  });

  it("accepts a parent response of 150 words (under the 160-word limit)", () => {
    const message = Array.from({ length: 148 }, () => "word").join(" ");
    const violations = validateGrounding(
      response({ message, headline: "Update" }),
      context({ audience: "parent" }),
    );
    expect(violations.some((v) => v.reason.includes("word limit"))).toBe(false);
  });
});
