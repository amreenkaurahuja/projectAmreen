import { describe, expect, it } from "vitest";
import { buildRecommendations } from "@/modules/parent-dashboard/recommendation-engine";
import type {
  EnrichedMasteryRecord,
  LearnerProfileSummary,
} from "@/modules/learning-profile/mastery.types";

const REF = new Date("2026-07-21T00:00:00.000Z");

function record(
  overrides: Partial<EnrichedMasteryRecord> = {},
): EnrichedMasteryRecord {
  return {
    id: `mastery-${Math.random()}`,
    learnerId: "learner-1",
    skillId: "skill-1",
    subjectId: "subject-1",
    topicId: "topic-1",
    skillName: "Addition",
    subjectName: "Maths",
    masteryScore: 50,
    confidenceScore: 50,
    totalAttempts: 4,
    correctAttempts: 3,
    incorrectAttempts: 1,
    averageResponseMs: 10_000,
    lastResponseMs: 10_000,
    currentStreak: 1,
    bestStreak: 1,
    currentIncorrectStreak: 0,
    lastAttemptCorrect: true,
    lastPractisedAt: REF.toISOString(),
    nextReviewAt: null,
    updatedAt: REF.toISOString(),
    ...overrides,
  };
}

function profile(
  overrides: Partial<LearnerProfileSummary> = {},
): LearnerProfileSummary {
  return {
    hasData: true,
    overallMasteryScore: 60,
    overallConfidenceScore: 55,
    totalQuestionsAnswered: 20,
    correctAnswers: 14,
    overallAccuracy: 70,
    averageResponseMs: 15_000,
    strongestSubject: null,
    weakestSubject: null,
    subjectSummaries: [],
    strongestSkills: [],
    weakestSkills: [],
    skillsDueForReview: [],
    lastPractisedAt: null,
    ...overrides,
  };
}

describe("buildRecommendations", () => {
  it("recommends focusing on the weakest skill when mastery is below 40", () => {
    const records = [
      record({ skillId: "s1", skillName: "Fractions", masteryScore: 25 }),
      record({ skillId: "s2", skillName: "Decimals", masteryScore: 35 }),
    ];

    const recommendations = buildRecommendations(records, profile());

    expect(recommendations[0]).toEqual({
      type: "focus_weak_skill",
      message: "Focus on Fractions tomorrow.",
    });
  });

  it("recommends practising overdue skills when any are due for review", () => {
    const recommendations = buildRecommendations(
      [record({ masteryScore: 70 })],
      profile({
        skillsDueForReview: [
          {
            skillId: "s1",
            skillName: "Inference",
            subjectId: "sub-1",
            subjectName: "English",
            nextReviewAt: REF.toISOString(),
          },
        ],
      }),
    );

    expect(recommendations.some((r) => r.type === "practice_overdue")).toBe(
      true,
    );
    expect(
      recommendations.find((r) => r.type === "practice_overdue")?.message,
    ).toContain("Inference");
  });

  it("recommends slowing down when confidence trails mastery by a meaningful margin", () => {
    const recommendations = buildRecommendations(
      [record({ masteryScore: 70, confidenceScore: 50, skillName: "Grammar" })],
      profile(),
    );

    expect(recommendations.some((r) => r.type === "slow_down")).toBe(true);
    expect(
      recommendations.find((r) => r.type === "slow_down")?.message,
    ).toContain("Grammar");
  });

  it("does not recommend slowing down for a small confidence gap", () => {
    const recommendations = buildRecommendations(
      [record({ masteryScore: 70, confidenceScore: 65 })],
      profile(),
    );
    expect(recommendations.some((r) => r.type === "slow_down")).toBe(false);
  });

  it("recommends timed practice when average response time is high", () => {
    const recommendations = buildRecommendations(
      [record({ masteryScore: 70, confidenceScore: 70 })],
      profile({ averageResponseMs: 50_000 }),
    );
    expect(recommendations.some((r) => r.type === "timed_practice")).toBe(true);
  });

  it("does not recommend timed practice when response time is null (no data)", () => {
    const recommendations = buildRecommendations(
      [record({ masteryScore: 70, confidenceScore: 70 })],
      profile({ averageResponseMs: null }),
    );
    expect(recommendations.some((r) => r.type === "timed_practice")).toBe(
      false,
    );
  });

  it("recommends adding challenge questions when every skill has mastery 80+", () => {
    const recommendations = buildRecommendations(
      [
        record({ skillId: "s1", masteryScore: 85, confidenceScore: 85 }),
        record({ skillId: "s2", masteryScore: 90, confidenceScore: 90 }),
      ],
      profile({ averageResponseMs: 10_000 }),
    );
    expect(recommendations.some((r) => r.type === "add_challenge")).toBe(true);
  });

  it("does not recommend adding challenge questions when any skill is below 80", () => {
    const recommendations = buildRecommendations(
      [
        record({ skillId: "s1", masteryScore: 85, confidenceScore: 85 }),
        record({ skillId: "s2", masteryScore: 79, confidenceScore: 79 }),
      ],
      profile({ averageResponseMs: 10_000 }),
    );
    expect(recommendations.some((r) => r.type === "add_challenge")).toBe(false);
  });

  it("returns no recommendations for an empty learner with no records and neutral profile", () => {
    const recommendations = buildRecommendations(
      [],
      profile({ averageResponseMs: null }),
    );
    expect(recommendations).toEqual([]);
  });

  it("returns at most 3 recommendations, in fixed priority order, when everything applies", () => {
    const records = [
      record({
        skillId: "s1",
        skillName: "Fractions",
        masteryScore: 20,
        confidenceScore: 20,
      }),
    ];
    const recommendations = buildRecommendations(
      records,
      profile({
        averageResponseMs: 60_000,
        skillsDueForReview: [
          {
            skillId: "s2",
            skillName: "Inference",
            subjectId: "sub-1",
            subjectName: "English",
            nextReviewAt: REF.toISOString(),
          },
        ],
      }),
    );

    expect(recommendations).toHaveLength(3);
    expect(recommendations.map((r) => r.type)).toEqual([
      "focus_weak_skill",
      "practice_overdue",
      "timed_practice",
    ]);
  });

  it("is deterministic for the same input", () => {
    const records = [record({ masteryScore: 30 })];
    const a = buildRecommendations(records, profile());
    const b = buildRecommendations(records, profile());
    expect(a).toEqual(b);
  });
});
