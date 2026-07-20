import { describe, expect, it } from "vitest";
import type { DailyMission } from "@/lib/missions/types";

describe("daily mission model", () => {
  it("supports a resumable mission", () => {
    const mission = {
      totalQuestions: 16,
      answeredQuestions: 5,
      correctAnswers: 4,
    } as DailyMission;
    expect(mission.totalQuestions - mission.answeredQuestions).toBe(11);
    expect(
      Math.round((mission.correctAnswers / mission.answeredQuestions) * 100),
    ).toBe(80);
  });
});
