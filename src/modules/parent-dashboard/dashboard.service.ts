import { DEFAULT_ADAPTIVE_CONFIG } from "@/modules/adaptive-learning/adaptive-config";
import { selectAdaptiveMission } from "@/modules/adaptive-learning/adaptive-selector";
import type { AdaptiveDataRepository } from "@/modules/adaptive-learning/adaptive-mission.repository";
import type { AdaptiveMissionConfig } from "@/modules/adaptive-learning/adaptive.types";
import { buildLearnerProfileSummary } from "@/modules/learning-profile/mastery-summary";
import type { MasteryRepository } from "@/modules/learning-profile/mastery.repository";
import type { MissionCompletionRepository } from "@/modules/missions/mission-completion.repository";
import {
  buildLearningHealth,
  buildSessionHistory,
  buildSkillHighlights,
  buildSubjectInsights,
  buildWeeklyProgress,
  computeLearningStreak,
  extractUpcomingFocusSkillIds,
} from "./learning-health";
import { buildRecommendations } from "./recommendation-engine";
import type { ParentDashboardRepository } from "./dashboard.repository";
import type {
  ParentDashboardData,
  UpcomingMissionPreview,
} from "./dashboard.types";

const DEFAULT_LEARNER_NAME = "Learner";
const SKILL_HIGHLIGHT_LIMIT = 5;
const UPCOMING_FOCUS_LIMIT = 3;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Orchestrates the Parent Intelligence Dashboard: verifies ownership, loads
 * mastery/mission/adaptive data through existing repositories (nothing new
 * is queried that another service doesn't already own), and hands it to the
 * pure functions in learning-health.ts / recommendation-engine.ts. The UI
 * layer only ever sees the resulting ParentDashboardData — no Supabase
 * access, no derived-metric logic, in any page component.
 */
export class ParentDashboardService {
  constructor(
    private readonly repository: ParentDashboardRepository,
    private readonly masteryRepository: MasteryRepository,
    private readonly adaptiveRepository: AdaptiveDataRepository,
    private readonly missionCompletionRepository: MissionCompletionRepository,
    private readonly config: AdaptiveMissionConfig = DEFAULT_ADAPTIVE_CONFIG,
  ) {}

  async getDashboardData(
    learnerId: string,
    referenceTimestamp: Date = new Date(),
  ): Promise<ParentDashboardData> {
    await this.repository.assertLearnerOwned(learnerId);

    const [learnerName, records, completedMissionDates, recentMissionData] =
      await Promise.all([
        this.missionCompletionRepository.getLearnerDisplayName(learnerId),
        this.masteryRepository.getAllMasteryForLearnerEnriched(learnerId),
        this.repository.getCompletedMissionDates(learnerId),
        this.repository.getRecentMissionData(learnerId),
      ]);

    const profile = buildLearnerProfileSummary(records, referenceTimestamp);
    const streak = computeLearningStreak(
      completedMissionDates,
      referenceTimestamp,
    );

    const upcomingMissionPreview = await this.buildUpcomingMissionPreview(
      learnerId,
      referenceTimestamp,
    );

    return {
      learnerId,
      learnerName: learnerName ?? DEFAULT_LEARNER_NAME,
      hasData: profile.hasData,
      learningHealth: buildLearningHealth(profile, records, streak),
      subjectInsights: buildSubjectInsights(records),
      strongestSkills: buildSkillHighlights(
        records,
        "strongest",
        SKILL_HIGHLIGHT_LIMIT,
        referenceTimestamp,
      ),
      focusSkills: buildSkillHighlights(
        records,
        "weakest",
        SKILL_HIGHLIGHT_LIMIT,
        referenceTimestamp,
      ),
      weeklyProgress: buildWeeklyProgress(
        recentMissionData.missions,
        recentMissionData.attemptsByMission,
      ),
      recommendations: buildRecommendations(records, profile),
      upcomingMissionPreview,
      sessionHistory: buildSessionHistory(
        recentMissionData.missions,
        recentMissionData.attemptsByMission,
      ),
    };
  }

  /**
   * Runs the same pure adaptive selector tomorrow's mission generation would
   * use, but never persists anything — this is a preview only. If tomorrow
   * actually arrives before the learner starts a mission, the real
   * AdaptiveMissionService generates and persists it independently.
   */
  private async buildUpcomingMissionPreview(
    learnerId: string,
    referenceTimestamp: Date,
  ): Promise<UpcomingMissionPreview> {
    const tomorrow = new Date(referenceTimestamp.getTime() + MS_PER_DAY);
    const missionDate = tomorrow.toISOString().slice(0, 10);
    const cooldownSinceIso = new Date(
      tomorrow.getTime() - this.config.cooldownDays * MS_PER_DAY,
    ).toISOString();

    const data = await this.adaptiveRepository.loadCandidateData(
      learnerId,
      cooldownSinceIso,
    );
    if (data.candidates.length === 0) {
      return { focusSkillNames: [] };
    }

    const result = selectAdaptiveMission({
      learnerId,
      missionDate,
      referenceTimestamp: tomorrow,
      candidates: data.candidates,
      masteryBySkill: data.masteryBySkill,
      recentAttemptsByQuestion: data.recentAttemptsByQuestion,
      activeSubjectSlugs: data.activeSubjectSlugs,
      config: this.config,
    });

    const focusSkillIds = extractUpcomingFocusSkillIds(
      result.items,
      UPCOMING_FOCUS_LIMIT,
    );
    if (focusSkillIds.length === 0) {
      return { focusSkillNames: [] };
    }

    const namesById = await this.repository.getSkillNames(focusSkillIds);
    const focusSkillNames = focusSkillIds
      .map((id) => namesById.get(id))
      .filter((name): name is string => Boolean(name));

    return { focusSkillNames };
  }
}
