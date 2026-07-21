// Regression coverage for a production bug verified directly against the
// database for mission b57ff967-549a-444d-99c8-66d15de4f996: the server
// correctly computes an initial index of 1 (question 2), but the client
// must actually use that value on mount instead of defaulting to 0.
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MissionPlayer } from "@/components/missions/mission-player";
import type { MissionPlayer as MissionPlayerData } from "@/modules/missions/mission-player.types";

function buildMission(answeredPositions: number[]): MissionPlayerData {
  const questions = Array.from({ length: 16 }, (_, index) => {
    const position = index + 1;
    const answered = answeredPositions.includes(position);

    return {
      missionItemId: `item-${position}`,
      questionId: `question-${position}`,
      position,
      subjectName: "Mathematics",
      subjectSlug: "mathematics",
      topicName: null,
      prompt: `Prompt for question ${position}`,
      options: [
        { id: `${position}-a`, label: "Option A" },
        { id: `${position}-b`, label: "Option B" },
      ],
      attempt: answered
        ? {
            selectedOptionId: `${position}-a`,
            correctOptionId: `${position}-a`,
            isCorrect: true,
            explanation: "Because.",
            responseMs: 1200,
          }
        : null,
    };
  });

  return {
    missionId: "b57ff967-549a-444d-99c8-66d15de4f996",
    learnerId: "learner-1",
    missionDate: "2026-07-20",
    status: answeredPositions.length > 0 ? "in_progress" : "ready",
    estimatedMinutes: 20,
    completedAt: null,
    totalQuestions: 16,
    answeredCount: answeredPositions.length,
    correctCount: answeredPositions.length,
    questions,
  };
}

describe("MissionPlayer resume regression", () => {
  it("opens question 2 of 16 when the server supplies initialIndex=1, and does not fall back to question 1", () => {
    const mission = buildMission([1]);

    render(
      <MissionPlayer
        initialMission={mission}
        initialIndex={1}
        learnerName="Amelia"
      />,
    );

    expect(screen.getByText("Question 2 of 16")).toBeInTheDocument();
    expect(screen.getByText("Prompt for question 2")).toBeInTheDocument();
    expect(screen.queryByText("Question 1 of 16")).not.toBeInTheDocument();
    expect(screen.queryByText("Prompt for question 1")).not.toBeInTheDocument();
  });

  it("opens question 6 of 16 when the server supplies initialIndex=5", () => {
    const mission = buildMission([1, 2, 3, 4, 5]);

    render(
      <MissionPlayer
        initialMission={mission}
        initialIndex={5}
        learnerName="Amelia"
      />,
    );

    expect(screen.getByText("Question 6 of 16")).toBeInTheDocument();
    expect(screen.getByText("Prompt for question 6")).toBeInTheDocument();
  });

  it("still opens question 1 of 16 when the server supplies initialIndex=0", () => {
    const mission = buildMission([]);

    render(
      <MissionPlayer
        initialMission={mission}
        initialIndex={0}
        learnerName="Amelia"
      />,
    );

    expect(screen.getByText("Question 1 of 16")).toBeInTheDocument();
  });

  it("shows the completion screen when the server supplies initialIndex=16", () => {
    const mission = buildMission(Array.from({ length: 16 }, (_, i) => i + 1));

    render(
      <MissionPlayer
        initialMission={mission}
        initialIndex={16}
        learnerName="Amelia"
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Mission Complete" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Review Mistakes")).toBeInTheDocument();
  });
});
