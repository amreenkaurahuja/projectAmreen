import type { MissionPlayer } from "./mission-player.types";

export function getInitialMissionIndex(mission: MissionPlayer): number {
  const firstUnanswered = mission.questions.findIndex(
    (question) => !question.attempt,
  );

  return firstUnanswered === -1 ? mission.questions.length : firstUnanswered;
}
