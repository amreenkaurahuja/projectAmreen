import { logger } from "@/lib/observability/logger";
import type {
  MissionItem,
  MissionSummary,
} from "@/modules/missions/mission.types";
import {
  MissionDuplicateError,
  MissionQuestionBankError,
  type MissionRepository,
} from "@/modules/missions/mission.repository";
import { DEFAULT_ADAPTIVE_CONFIG } from "./adaptive-config";
import { selectAdaptiveMission } from "./adaptive-selector";
import type { AdaptiveDataRepository } from "./adaptive-mission.repository";
import type { AdaptiveMissionConfig } from "./adaptive.types";

const DEFAULT_ESTIMATED_MINUTES = 20;
const GENERATION_STRATEGY = "adaptive-v1";

/**
 * Replaces the old static 8/4/2/2 subject-interleave generator. Reuses the
 * existing MissionRepository for ownership checks and conflict-safe
 * persistence (findTodaysMission / createMission already handle the
 * "reuse existing mission" and "unique-constraint race" cases — see
 * docs/Architecture.md → "Adaptive mission generation" → "Mission reuse and
 * concurrency") so none of that logic is duplicated here. Only the
 * candidate-loading and selection steps are new.
 */
export class AdaptiveMissionService {
  constructor(
    private readonly missionRepository: MissionRepository,
    private readonly adaptiveRepository: AdaptiveDataRepository,
    private readonly config: AdaptiveMissionConfig = DEFAULT_ADAPTIVE_CONFIG,
  ) {}

  async getOrCreateTodaysMission(
    learnerId: string,
    referenceTimestamp: Date = new Date(),
  ): Promise<MissionSummary> {
    await this.missionRepository.getAuthenticatedUserId();
    await this.missionRepository.ensureLearnerOwned(learnerId);

    const existing = await this.missionRepository.findTodaysMission(learnerId);
    if (existing) {
      return existing;
    }

    const missionDate = referenceTimestamp.toISOString().slice(0, 10);
    const startedAt = Date.now();
    const cooldownSinceIso = new Date(
      referenceTimestamp.getTime() -
        this.config.cooldownDays * 24 * 60 * 60 * 1000,
    ).toISOString();

    const data = await this.adaptiveRepository.loadCandidateData(
      learnerId,
      cooldownSinceIso,
    );

    if (data.candidates.length === 0) {
      throw new MissionQuestionBankError(
        "No eligible questions available to generate a mission",
      );
    }

    const result = selectAdaptiveMission({
      learnerId,
      missionDate,
      referenceTimestamp,
      candidates: data.candidates,
      masteryBySkill: data.masteryBySkill,
      recentAttemptsByQuestion: data.recentAttemptsByQuestion,
      activeSubjectSlugs: data.activeSubjectSlugs,
      config: this.config,
    });

    if (result.items.length === 0) {
      throw new MissionQuestionBankError(
        "No eligible questions available to generate a mission",
      );
    }

    logger.info("adaptive-learning.mission.generated", {
      learnerId,
      candidateCount: result.candidateCount,
      selectedCount: result.items.length,
      categoryCounts: result.categoryCounts,
      fallbackCount: result.fallbackCount,
      capacityWarning: result.capacityWarning,
      durationMs: Date.now() - startedAt,
    });

    if (result.capacityWarning) {
      logger.warn("adaptive-learning.mission.capacity-warning", {
        learnerId,
        candidateCount: result.candidateCount,
        selectedCount: result.items.length,
        missionSize: this.config.missionSize,
      });
    }

    const items: MissionItem[] = result.items.map((item, index) => ({
      id: `${item.subjectSlug}-${item.questionId}`,
      questionId: item.questionId,
      position: index + 1,
      subjectSlug: item.subjectSlug,
      selectionReason: item.reason,
    }));

    try {
      return await this.missionRepository.createMission(
        learnerId,
        missionDate,
        DEFAULT_ESTIMATED_MINUTES,
        items,
        {
          generationStrategy: GENERATION_STRATEGY,
          generationMetadata: {
            candidateCount: result.candidateCount,
            selectedCount: result.items.length,
            categoryCounts: result.categoryCounts,
            fallbackCount: result.fallbackCount,
            capacityWarning: result.capacityWarning,
          },
        },
      );
    } catch (error) {
      if (error instanceof MissionDuplicateError) {
        const competing =
          await this.missionRepository.findTodaysMission(learnerId);
        if (competing) {
          return competing;
        }
      }
      throw error;
    }
  }
}
