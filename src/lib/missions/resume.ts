import type { DailyMission } from "./types";

export function getInitialMissionIndex(mission: DailyMission): number {
  const firstUnanswered = mission.questions.findIndex(
    (question) => !question.answeredOptionId,
  );

  return firstUnanswered === -1 ? mission.questions.length : firstUnanswered;
}
