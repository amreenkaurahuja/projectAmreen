import { describe, expect, it } from "vitest";
import { getInitialMissionIndex } from "@/modules/missions/resume";
import type { MissionPlayer } from "@/modules/missions/mission-player.types";

function buildMission(answeredCount: number): MissionPlayer {
  const questions = Array.from({ length: 16 }, (_, index) => ({
    missionItemId: `item-${index}`,
    questionId: `question-${index}`,
    position: index + 1,
    subjectName: "Mathematics",
    subjectSlug: "mathematics",
    topicName: null,
    prompt: `Question ${index + 1}`,
    options: [{ id: `option-${index}`, label: "Option" }],
    attempt:
      index < answeredCount
        ? {
            attemptId: "attempt-1",
            selectedOptionId: `option-${index}`,
            correctOptionId: `option-${index}`,
            isCorrect: true,
            explanation: "Explanation",
            responseMs: 1000,
          }
        : null,
  }));

  return {
    missionId: "mission-1",
    learnerId: "learner-1",
    missionDate: "2026-07-20",
    status: "in_progress",
    estimatedMinutes: 20,
    completedAt: null,
    totalQuestions: 16,
    answeredCount,
    correctCount: answeredCount,
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
