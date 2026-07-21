import type { MissionPlayerService } from "./mission-player.service";
import type { MissionCompletionRepository } from "./mission-completion.repository";
import {
  buildCompletionSummary,
  buildReview,
} from "./mission-completion.calculations";
import type {
  MissionCompletionSummary,
  MissionReview,
} from "./mission-completion.types";

const DEFAULT_LEARNER_NAME = "Learner";

export class MissionCompletionService {
  constructor(
    private readonly playerService: MissionPlayerService,
    private readonly repository: MissionCompletionRepository,
  ) {}

  async getSummary(
    learnerId: string,
    missionId: string,
  ): Promise<MissionCompletionSummary> {
    const mission = await this.playerService.getMissionForPlayer(
      learnerId,
      missionId,
    );
    const learnerName =
      (await this.repository.getLearnerDisplayName(learnerId)) ??
      DEFAULT_LEARNER_NAME;

    return buildCompletionSummary(mission, learnerName);
  }

  async getReview(
    learnerId: string,
    missionId: string,
  ): Promise<MissionReview> {
    const mission = await this.playerService.getMissionForPlayer(
      learnerId,
      missionId,
    );
    const learnerName =
      (await this.repository.getLearnerDisplayName(learnerId)) ??
      DEFAULT_LEARNER_NAME;

    return buildReview(mission, learnerName);
  }
}
