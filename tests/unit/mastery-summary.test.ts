import { describe, expect, it } from "vitest";
import { buildLearnerProfileSummary } from "@/modules/learning-profile/mastery-summary";
import type { EnrichedMasteryRecord } from "@/modules/learning-profile/mastery.types";

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
    totalAttempts: 1,
    correctAttempts: 1,
    incorrectAttempts: 0,
    averageResponseMs: 20_000,
    lastResponseMs: 20_000,
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

describe("buildLearnerProfileSummary — empty state", () => {
  it("returns a graceful empty summary for a learner with no mastery data", () => {
    const summary = buildLearnerProfileSummary([], REF);

    expect(summary.hasData).toBe(false);
    expect(summary.overallMasteryScore).toBeNull();
    expect(summary.overallAccuracy).toBeNull();
    expect(summary.totalQuestionsAnswered).toBe(0);
    expect(summary.strongestSubject).toBeNull();
    expect(summary.weakestSubject).toBeNull();
    expect(summary.strongestSkills).toEqual([]);
    expect(summary.weakestSkills).toEqual([]);
    expect(summary.skillsDueForReview).toEqual([]);
    expect(summary.lastPractisedAt).toBeNull();
  });
});

describe("buildLearnerProfileSummary — subject weighting", () => {
  it("weights a subject's mastery/confidence by each skill's total attempts", () => {
    const records = [
      record({
        skillId: "skill-a",
        skillName: "Addition",
        masteryScore: 80,
        confidenceScore: 70,
        totalAttempts: 10,
        correctAttempts: 8,
      }),
      record({
        skillId: "skill-b",
        skillName: "Subtraction",
        masteryScore: 40,
        confidenceScore: 30,
        totalAttempts: 2,
        correctAttempts: 1,
      }),
    ];

    const summary = buildLearnerProfileSummary(records, REF);

    // (80*10 + 40*2) / 12 = 73.33 -> 73
    expect(summary.subjectSummaries).toHaveLength(1);
    expect(summary.subjectSummaries[0]!.masteryScore).toBe(73);
    // (70*10 + 30*2) / 12 = 63.33 -> 63
    expect(summary.subjectSummaries[0]!.confidenceScore).toBe(63);
    expect(summary.subjectSummaries[0]!.totalAttempts).toBe(12);
    // (8+1)/12 = 75%
    expect(summary.subjectSummaries[0]!.accuracy).toBe(75);
  });

  it("computes the overall mastery/confidence/response-time as attempt-weighted averages across all subjects", () => {
    const records = [
      record({
        skillId: "skill-a",
        subjectId: "subject-a",
        subjectName: "Maths",
        masteryScore: 90,
        totalAttempts: 8,
        averageResponseMs: 10_000,
      }),
      record({
        skillId: "skill-b",
        subjectId: "subject-b",
        subjectName: "English",
        masteryScore: 30,
        totalAttempts: 2,
        averageResponseMs: 50_000,
      }),
    ];

    const summary = buildLearnerProfileSummary(records, REF);

    // (90*8 + 30*2) / 10 = 78
    expect(summary.overallMasteryScore).toBe(78);
    // (10000*8 + 50000*2) / 10 = 18000
    expect(summary.averageResponseMs).toBe(18_000);
  });

  it("excludes skills with no recorded response time from the response-time average", () => {
    const records = [
      record({
        skillId: "skill-a",
        totalAttempts: 5,
        averageResponseMs: 12_000,
      }),
      record({ skillId: "skill-b", totalAttempts: 5, averageResponseMs: null }),
    ];

    const summary = buildLearnerProfileSummary(records, REF);

    expect(summary.averageResponseMs).toBe(12_000);
  });
});

describe("buildLearnerProfileSummary — strongest/weakest selection", () => {
  it("picks the strongest and weakest subject by mastery score", () => {
    const records = [
      record({
        skillId: "s1",
        subjectId: "sub-1",
        subjectName: "Maths",
        masteryScore: 90,
      }),
      record({
        skillId: "s2",
        subjectId: "sub-2",
        subjectName: "English",
        masteryScore: 20,
      }),
      record({
        skillId: "s3",
        subjectId: "sub-3",
        subjectName: "Science",
        masteryScore: 55,
      }),
    ];

    const summary = buildLearnerProfileSummary(records, REF);

    expect(summary.strongestSubject?.subjectName).toBe("Maths");
    expect(summary.weakestSubject?.subjectName).toBe("English");
  });

  it("returns at most 3 strongest and weakest skills, ranked by mastery score", () => {
    const records = [10, 90, 50, 70, 30].map((score, i) =>
      record({
        skillId: `skill-${i}`,
        skillName: `Skill ${i}`,
        masteryScore: score,
      }),
    );

    const summary = buildLearnerProfileSummary(records, REF);

    expect(summary.strongestSkills).toHaveLength(3);
    expect(summary.strongestSkills.map((s) => s.masteryScore)).toEqual([
      90, 70, 50,
    ]);
    expect(summary.weakestSkills).toHaveLength(3);
    expect(summary.weakestSkills.map((s) => s.masteryScore)).toEqual([
      10, 30, 50,
    ]);
  });

  it("breaks mastery-score ties deterministically by skill name", () => {
    const records = [
      record({ skillId: "skill-b", skillName: "Bravo", masteryScore: 60 }),
      record({ skillId: "skill-a", skillName: "Alpha", masteryScore: 60 }),
    ];

    const summary = buildLearnerProfileSummary(records, REF);

    expect(summary.strongestSkills.map((s) => s.skillName)).toEqual([
      "Alpha",
      "Bravo",
    ]);
  });
});

describe("buildLearnerProfileSummary — skills due for review", () => {
  it("includes only skills whose next_review_at has already passed, earliest first", () => {
    const records = [
      record({
        skillId: "due-later",
        skillName: "Due later",
        nextReviewAt: new Date(REF.getTime() - 1_000).toISOString(),
      }),
      record({
        skillId: "due-earlier",
        skillName: "Due earlier",
        nextReviewAt: new Date(REF.getTime() - 10_000).toISOString(),
      }),
      record({
        skillId: "not-due",
        skillName: "Not due",
        nextReviewAt: new Date(REF.getTime() + 100_000).toISOString(),
      }),
      record({
        skillId: "never-scheduled",
        skillName: "Never scheduled",
        nextReviewAt: null,
      }),
    ];

    const summary = buildLearnerProfileSummary(records, REF);

    expect(summary.skillsDueForReview.map((s) => s.skillName)).toEqual([
      "Due earlier",
      "Due later",
    ]);
  });
});

describe("buildLearnerProfileSummary — last practised", () => {
  it("reports the most recent lastPractisedAt across all skills", () => {
    const records = [
      record({ skillId: "s1", lastPractisedAt: "2026-07-19T00:00:00.000Z" }),
      record({ skillId: "s2", lastPractisedAt: "2026-07-20T12:00:00.000Z" }),
    ];

    const summary = buildLearnerProfileSummary(records, REF);

    expect(summary.lastPractisedAt).toBe("2026-07-20T12:00:00.000Z");
  });
});

describe("buildLearnerProfileSummary — overall accuracy", () => {
  it("computes overall accuracy as total correct over total attempts across all skills", () => {
    const records = [
      record({ skillId: "s1", totalAttempts: 8, correctAttempts: 6 }),
      record({ skillId: "s2", totalAttempts: 2, correctAttempts: 2 }),
    ];

    const summary = buildLearnerProfileSummary(records, REF);

    expect(summary.totalQuestionsAnswered).toBe(10);
    expect(summary.correctAnswers).toBe(8);
    expect(summary.overallAccuracy).toBe(80);
  });
});
