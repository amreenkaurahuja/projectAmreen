import { describe, expect, it } from "vitest";
import {
  buildCompletionSummary,
  buildReview,
  computeAccuracyPercent,
  computeDisplayMinutes,
  computeScoreMessage,
  computeSubjectBreakdown,
  computeTotalResponseMs,
} from "@/modules/missions/mission-completion.calculations";
import type { MissionPlayer } from "@/modules/missions/mission-player.types";

function buildQuestion(
  overrides: Partial<MissionPlayer["questions"][number]> = {},
): MissionPlayer["questions"][number] {
  return {
    missionItemId: "item-1",
    questionId: "question-1",
    position: 1,
    subjectName: "Mathematics",
    subjectSlug: "mathematics",
    topicName: null,
    prompt: "What is 2 + 2?",
    options: [
      { id: "a", label: "3" },
      { id: "b", label: "4" },
    ],
    attempt: null,
    ...overrides,
  };
}

function buildMission(
  questions: MissionPlayer["questions"],
  overrides: Partial<MissionPlayer> = {},
): MissionPlayer {
  const answeredCount = questions.filter((q) => q.attempt).length;
  const correctCount = questions.filter((q) => q.attempt?.isCorrect).length;

  return {
    missionId: "mission-1",
    learnerId: "learner-1",
    missionDate: "2026-07-20",
    status: "completed",
    estimatedMinutes: 20,
    completedAt: "2026-07-20T12:00:00.000Z",
    totalQuestions: questions.length,
    answeredCount,
    correctCount,
    questions,
    ...overrides,
  };
}

describe("computeAccuracyPercent", () => {
  it("rounds correct/answered to a percentage", () => {
    expect(computeAccuracyPercent(4, 5)).toBe(80);
  });

  it("returns 0 when nothing has been answered, avoiding division by zero", () => {
    expect(computeAccuracyPercent(0, 0)).toBe(0);
  });
});

describe("computeTotalResponseMs", () => {
  it("sums response time across answered questions only", () => {
    const mission = buildMission([
      buildQuestion({
        missionItemId: "item-1",
        attempt: {
          selectedOptionId: "b",
          correctOptionId: "b",
          isCorrect: true,
          explanation: "",
          responseMs: 1000,
        },
      }),
      buildQuestion({ missionItemId: "item-2", attempt: null }),
      buildQuestion({
        missionItemId: "item-3",
        attempt: {
          selectedOptionId: "a",
          correctOptionId: "b",
          isCorrect: false,
          explanation: "",
          responseMs: 2500,
        },
      }),
    ]);

    expect(computeTotalResponseMs(mission)).toBe(3500);
  });
});

describe("computeDisplayMinutes", () => {
  it("uses recorded response time when available", () => {
    expect(computeDisplayMinutes(120_000, 20)).toBe(2);
  });

  it("falls back to the mission's estimated minutes when no response time was recorded", () => {
    expect(computeDisplayMinutes(0, 20)).toBe(20);
  });
});

describe("computeScoreMessage", () => {
  it.each([
    [100, "Outstanding work"],
    [90, "Outstanding work"],
    [89, "Great job"],
    [75, "Great job"],
    [74, "Good effort"],
    [60, "Good effort"],
    [59, "Keep practising"],
    [0, "Keep practising"],
  ])("returns %i%% -> %s", (accuracyPercent, expected) => {
    expect(computeScoreMessage(accuracyPercent)).toBe(expected);
  });
});

describe("computeSubjectBreakdown", () => {
  it("groups by subject, counting only attempted questions", () => {
    const mission = buildMission([
      buildQuestion({
        missionItemId: "item-1",
        subjectName: "Mathematics",
        subjectSlug: "mathematics",
        attempt: {
          selectedOptionId: "b",
          correctOptionId: "b",
          isCorrect: true,
          explanation: "",
          responseMs: 1000,
        },
      }),
      buildQuestion({
        missionItemId: "item-2",
        subjectName: "Mathematics",
        subjectSlug: "mathematics",
        attempt: {
          selectedOptionId: "a",
          correctOptionId: "b",
          isCorrect: false,
          explanation: "",
          responseMs: 1000,
        },
      }),
      buildQuestion({
        missionItemId: "item-3",
        subjectName: "English",
        subjectSlug: "english",
        attempt: null,
      }),
    ]);

    const breakdown = computeSubjectBreakdown(mission);

    expect(breakdown).toEqual([
      {
        subjectName: "Mathematics",
        subjectSlug: "mathematics",
        attempted: 2,
        correct: 1,
        accuracyPercent: 50,
      },
    ]);
  });
});

describe("buildCompletionSummary", () => {
  it("assembles a full summary from a completed mission", () => {
    const questions = Array.from({ length: 16 }, (_, index) =>
      buildQuestion({
        missionItemId: `item-${index + 1}`,
        subjectName: index < 8 ? "Mathematics" : "English",
        subjectSlug: index < 8 ? "mathematics" : "english",
        attempt: {
          selectedOptionId: "b",
          correctOptionId: "b",
          isCorrect: index < 15,
          explanation: "Explanation",
          responseMs: 1000,
        },
      }),
    );
    const mission = buildMission(questions);

    const summary = buildCompletionSummary(mission, "Amelia");

    expect(summary.learnerName).toBe("Amelia");
    expect(summary.correctCount).toBe(15);
    expect(summary.answeredCount).toBe(16);
    expect(summary.accuracyPercent).toBe(94);
    expect(summary.scoreMessage).toBe("Outstanding work");
    expect(summary.totalResponseMs).toBe(16_000);
    expect(summary.hasRecordedTime).toBe(true);
    expect(summary.displayMinutes).toBe(0);
    expect(summary.subjectBreakdown).toHaveLength(2);
  });

  it("falls back to the estimated minutes when response time was never recorded", () => {
    const questions = [
      buildQuestion({
        attempt: {
          selectedOptionId: "b",
          correctOptionId: "b",
          isCorrect: true,
          explanation: "",
          responseMs: 0,
        },
      }),
    ];
    const summary = buildCompletionSummary(
      buildMission(questions, { estimatedMinutes: 20 }),
      "Amelia",
    );

    expect(summary.hasRecordedTime).toBe(false);
    expect(summary.displayMinutes).toBe(20);
  });
});

describe("buildReview", () => {
  it("returns only incorrect, answered questions with correct answer keys exposed", () => {
    const questions = [
      buildQuestion({
        missionItemId: "item-1",
        options: [
          { id: "a", label: "3" },
          { id: "b", label: "4" },
        ],
        attempt: {
          selectedOptionId: "a",
          correctOptionId: "b",
          isCorrect: false,
          explanation: "Because 2 + 2 = 4.",
          responseMs: 1000,
        },
      }),
      buildQuestion({
        missionItemId: "item-2",
        attempt: {
          selectedOptionId: "b",
          correctOptionId: "b",
          isCorrect: true,
          explanation: "",
          responseMs: 1000,
        },
      }),
      buildQuestion({ missionItemId: "item-3", attempt: null }),
    ];

    const review = buildReview(buildMission(questions), "Amelia");

    expect(review.mistakes).toHaveLength(1);
    expect(review.mistakes[0]).toEqual({
      missionItemId: "item-1",
      subjectName: "Mathematics",
      subjectSlug: "mathematics",
      topicName: null,
      prompt: "What is 2 + 2?",
      selectedOptionLabel: "3",
      correctOptionLabel: "4",
      explanation: "Because 2 + 2 = 4.",
    });
    expect(review.isPerfectScore).toBe(false);
  });

  it("reports a perfect score when every answered question was correct", () => {
    const questions = [
      buildQuestion({
        missionItemId: "item-1",
        attempt: {
          selectedOptionId: "b",
          correctOptionId: "b",
          isCorrect: true,
          explanation: "",
          responseMs: 1000,
        },
      }),
    ];

    const review = buildReview(buildMission(questions), "Amelia");

    expect(review.mistakes).toEqual([]);
    expect(review.isPerfectScore).toBe(true);
  });
});
