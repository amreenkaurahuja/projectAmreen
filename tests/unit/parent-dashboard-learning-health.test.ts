import { describe, expect, it } from "vitest";
import {
  buildLearningHealth,
  buildSessionHistory,
  buildSkillHighlights,
  buildSubjectInsights,
  buildWeeklyProgress,
  computeLearningStreak,
  computeMasteryLabel,
  computeTotalStudyTimeMs,
  extractUpcomingFocusSkillIds,
  type MissionAttemptRow,
  type MissionMeta,
} from "@/modules/parent-dashboard/learning-health";
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

describe("computeMasteryLabel", () => {
  it.each([
    [95, "Excellent"],
    [80, "Excellent"],
    [79, "Developing"],
    [60, "Developing"],
    [59, "Needs Practice"],
    [0, "Needs Practice"],
  ])("labels mastery %i as %s", (score, label) => {
    expect(computeMasteryLabel(score)).toBe(label);
  });
});

describe("buildSubjectInsights", () => {
  it("sorts weakest subject first and attaches the qualitative label", () => {
    const records = [
      record({
        subjectId: "s-strong",
        subjectName: "Science",
        masteryScore: 90,
      }),
      record({ subjectId: "s-weak", subjectName: "English", masteryScore: 30 }),
      record({ subjectId: "s-mid", subjectName: "Maths", masteryScore: 65 }),
    ];

    const insights = buildSubjectInsights(records);

    expect(insights.map((i) => i.subjectName)).toEqual([
      "English",
      "Maths",
      "Science",
    ]);
    expect(insights[0]!.masteryLabel).toBe("Needs Practice");
    expect(insights[1]!.masteryLabel).toBe("Developing");
    expect(insights[2]!.masteryLabel).toBe("Excellent");
  });

  it("includes average response time per subject", () => {
    const records = [record({ averageResponseMs: 12_000, totalAttempts: 5 })];
    const insights = buildSubjectInsights(records);
    expect(insights[0]!.averageResponseMs).toBe(12_000);
  });
});

describe("buildSkillHighlights", () => {
  it("returns up to `limit` skills with a reviewDue flag", () => {
    const records = [10, 20, 30, 40, 50, 60].map((score, i) =>
      record({
        skillId: `skill-${i}`,
        skillName: `Skill ${i}`,
        masteryScore: score,
        nextReviewAt:
          i === 0 ? new Date(REF.getTime() - 1000).toISOString() : null,
      }),
    );

    const weakest = buildSkillHighlights(records, "weakest", 5, REF);

    expect(weakest).toHaveLength(5);
    expect(weakest[0]!.skillName).toBe("Skill 0");
    expect(weakest[0]!.reviewDue).toBe(true);
    expect(weakest[1]!.reviewDue).toBe(false);
  });
});

describe("computeTotalStudyTimeMs", () => {
  it("approximates total time as averageResponseMs * totalAttempts summed", () => {
    const records = [
      record({ averageResponseMs: 10_000, totalAttempts: 4 }),
      record({
        skillId: "skill-2",
        averageResponseMs: 5_000,
        totalAttempts: 2,
      }),
      record({ skillId: "skill-3", averageResponseMs: null, totalAttempts: 3 }),
    ];

    expect(computeTotalStudyTimeMs(records)).toBe(10_000 * 4 + 5_000 * 2 + 0);
  });
});

describe("computeLearningStreak", () => {
  it("returns zeroes for no completed missions", () => {
    expect(computeLearningStreak([], REF)).toEqual({
      currentStreakDays: 0,
      longestStreakDays: 0,
      daysLearnedThisMonth: 0,
    });
  });

  it("counts a run of consecutive days ending today as the current streak", () => {
    const streak = computeLearningStreak(
      ["2026-07-19", "2026-07-20", "2026-07-21"],
      REF,
    );
    expect(streak.currentStreakDays).toBe(3);
    expect(streak.longestStreakDays).toBe(3);
  });

  it("still counts the streak as current when the last session was yesterday", () => {
    const streak = computeLearningStreak(["2026-07-19", "2026-07-20"], REF);
    expect(streak.currentStreakDays).toBe(2);
  });

  it("resets the current streak to 0 when more than a day has passed", () => {
    const streak = computeLearningStreak(["2026-07-10", "2026-07-11"], REF);
    expect(streak.currentStreakDays).toBe(0);
    expect(streak.longestStreakDays).toBe(2);
  });

  it("finds the longest streak even when it isn't the current one", () => {
    const streak = computeLearningStreak(
      ["2026-06-01", "2026-06-02", "2026-06-03", "2026-06-04", "2026-07-21"],
      REF,
    );
    expect(streak.longestStreakDays).toBe(4);
    expect(streak.currentStreakDays).toBe(1);
  });

  it("counts distinct days learned within the reference month only", () => {
    const streak = computeLearningStreak(
      ["2026-06-30", "2026-07-01", "2026-07-15", "2026-07-21"],
      REF,
    );
    expect(streak.daysLearnedThisMonth).toBe(3);
  });

  it("de-duplicates repeated dates", () => {
    const streak = computeLearningStreak(
      ["2026-07-21", "2026-07-21", "2026-07-20"],
      REF,
    );
    expect(streak.currentStreakDays).toBe(2);
  });
});

describe("buildLearningHealth", () => {
  it("combines profile summary, study time, streak, and review count", () => {
    const records = [record({ averageResponseMs: 10_000, totalAttempts: 2 })];
    const profile = {
      hasData: true,
      overallMasteryScore: 55,
      overallConfidenceScore: 50,
      totalQuestionsAnswered: 4,
      correctAnswers: 3,
      overallAccuracy: 75,
      averageResponseMs: 10_000,
      strongestSubject: null,
      weakestSubject: null,
      subjectSummaries: [],
      strongestSkills: [],
      weakestSkills: [],
      skillsDueForReview: [
        {
          skillId: "s1",
          skillName: "Skill 1",
          subjectId: "sub-1",
          subjectName: "Maths",
          nextReviewAt: REF.toISOString(),
        },
      ],
      lastPractisedAt: null,
    };
    const streak = {
      currentStreakDays: 3,
      longestStreakDays: 5,
      daysLearnedThisMonth: 10,
    };

    const health = buildLearningHealth(profile, records, streak);

    expect(health.overallMasteryScore).toBe(55);
    expect(health.overallAccuracy).toBe(75);
    expect(health.totalQuestionsAnswered).toBe(4);
    expect(health.totalStudyTimeMs).toBe(20_000);
    expect(health.currentStreakDays).toBe(3);
    expect(health.longestStreakDays).toBe(5);
    expect(health.daysLearnedThisMonth).toBe(10);
    expect(health.skillsDueForReviewCount).toBe(1);
  });
});

function missionMeta(overrides: Partial<MissionMeta> = {}): MissionMeta {
  return {
    missionId: `mission-${Math.random()}`,
    missionDate: "2026-07-20",
    status: "completed",
    completedAt: "2026-07-20T12:00:00.000Z",
    questionCount: 4,
    ...overrides,
  };
}

describe("buildSessionHistory", () => {
  it("aggregates answered count and accuracy per mission, regardless of status", () => {
    const missions = [
      missionMeta({ missionId: "m1", status: "in_progress" }),
      missionMeta({ missionId: "m2", status: "completed" }),
    ];
    const attempts = new Map<string, MissionAttemptRow[]>([
      ["m1", [{ isCorrect: true, difficulty: 2, responseMs: 1000 }]],
      [
        "m2",
        [
          { isCorrect: true, difficulty: 2, responseMs: 1000 },
          { isCorrect: false, difficulty: 3, responseMs: 2000 },
        ],
      ],
    ]);

    const history = buildSessionHistory(missions, attempts);

    expect(history[0]!.answeredCount).toBe(1);
    expect(history[0]!.accuracyPercent).toBe(100);
    expect(history[1]!.answeredCount).toBe(2);
    expect(history[1]!.accuracyPercent).toBe(50);
    expect(history[1]!.totalResponseMs).toBe(3000);
  });

  it("reports a null accuracy when a mission has no attempts yet", () => {
    const history = buildSessionHistory(
      [missionMeta({ missionId: "m1" })],
      new Map(),
    );
    expect(history[0]!.accuracyPercent).toBeNull();
  });
});

describe("buildWeeklyProgress", () => {
  it("includes only completed missions, most recent first, capped at the limit", () => {
    const missions = [
      missionMeta({ missionId: "m1", status: "completed" }),
      missionMeta({ missionId: "m2", status: "ready" }),
      missionMeta({ missionId: "m3", status: "completed" }),
    ];
    const progress = buildWeeklyProgress(missions, new Map(), 7);
    expect(progress.map((p) => p.missionId)).toEqual(["m1", "m3"]);
  });

  it("computes an approximate mastery change by summing the difficulty-based delta", () => {
    const missions = [missionMeta({ missionId: "m1", status: "completed" })];
    const attempts = new Map<string, MissionAttemptRow[]>([
      [
        "m1",
        [
          { isCorrect: true, difficulty: 3, responseMs: 1000 }, // +4
          { isCorrect: false, difficulty: 1, responseMs: 1000 }, // -5
        ],
      ],
    ]);

    const progress = buildWeeklyProgress(missions, attempts);
    expect(progress[0]!.masteryChangeApprox).toBe(4 - 5);
  });
});

describe("extractUpcomingFocusSkillIds", () => {
  it("prioritises weak_skill and review_due picks, deduped, in encounter order", () => {
    const items = [
      { skillId: "a", reason: "curriculum_coverage" as const },
      { skillId: "b", reason: "weak_skill" as const },
      { skillId: "b", reason: "weak_skill" as const },
      { skillId: "c", reason: "review_due" as const },
      { skillId: "d", reason: "challenge" as const },
    ];

    expect(extractUpcomingFocusSkillIds(items, 3)).toEqual(["b", "c", "a"]);
  });

  it("falls back to any selected skill when there aren't enough weak/due picks", () => {
    const items = [
      { skillId: "a", reason: "curriculum_coverage" as const },
      { skillId: "b", reason: "challenge" as const },
    ];

    expect(extractUpcomingFocusSkillIds(items, 3)).toEqual(["a", "b"]);
  });

  it("returns an empty list for no items", () => {
    expect(extractUpcomingFocusSkillIds([], 3)).toEqual([]);
  });
});
