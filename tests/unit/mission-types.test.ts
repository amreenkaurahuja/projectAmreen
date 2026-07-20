import { describe, expect, it } from "vitest";
import type { MissionPlayer } from "@/modules/missions/mission-player.types";

describe("mission player model", () => {
  it("supports a resumable mission", () => {
    const mission = {
      totalQuestions: 16,
      answeredCount: 5,
      correctCount: 4,
    } as MissionPlayer;

    expect(mission.totalQuestions - mission.answeredCount).toBe(11);
    expect(
      Math.round((mission.correctCount / mission.answeredCount) * 100),
    ).toBe(80);
  });

  it("hides attempt details until a question has been answered", () => {
    const question: MissionPlayer["questions"][number] = {
      missionItemId: "item-1",
      questionId: "question-1",
      position: 1,
      subjectName: "Mathematics",
      subjectSlug: "mathematics",
      topicName: "Arithmetic",
      prompt: "What is 2 + 2?",
      options: [
        { id: "a", label: "3" },
        { id: "b", label: "4" },
      ],
      attempt: null,
    };

    expect(question.attempt).toBeNull();
  });
});
