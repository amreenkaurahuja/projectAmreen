import { describe, expect, it } from "vitest";
import { getInitialMissionIndex } from "@/lib/missions/resume";
import type { DailyMission } from "@/lib/missions/types";

function buildMission(answeredCount: number): DailyMission {
  const questions = Array.from({ length: 16 }, (_, index) => ({
    missionItemId: `item-${index}`,
    questionId: `question-${index}`,
    subjectName: "Mathematics",
    subjectSlug: "mathematics",
    prompt: `Question ${index + 1}`,
    explanation: "Explanation",
    difficulty: 1,
    options: [{ id: `option-${index}`, label: "Option" }],
    answeredOptionId: index < answeredCount ? `option-${index}` : null,
    isCorrect: index < answeredCount ? true : null,
  }));

  return {
    id: "mission-1",
    learnerId: "learner-1",
    missionDate: "2024-01-01",
    status: "in_progress",
    estimatedMinutes: 20,
    totalQuestions: 16,
    answeredQuestions: answeredCount,
    correctAnswers: answeredCount,
    questions,
  };
}

describe("mission resume selection", () => {
  it("starts at question 1 when no questions have been answered", () => {
    expect(getInitialMissionIndex(buildMission(0))).toBe(0);
  });

  it("starts at question 2 when the first question is already answered", () => {
    expect(getInitialMissionIndex(buildMission(1))).toBe(1);
  });

  it("starts at question 6 when five questions are already answered", () => {
    expect(getInitialMissionIndex(buildMission(5))).toBe(5);
  });

  it("returns completion when all questions have been answered", () => {
    expect(getInitialMissionIndex(buildMission(16))).toBe(16);
  });
});
