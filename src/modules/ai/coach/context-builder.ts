import "server-only";
import type { ParentDashboardService } from "@/modules/parent-dashboard/dashboard.service";
import type {
  ParentDashboardData,
  Recommendation as DashboardRecommendation,
  RecommendationType,
  SessionHistoryRow,
  SkillHighlight,
  SubjectInsight,
} from "@/modules/parent-dashboard/dashboard.types";
import type { MissionCompletionService } from "@/modules/missions/mission-completion.service";
import { validateLearnerCoachingContext } from "../validation/dto-validator";
import type {
  Audience,
  LearnerCoachingContext,
  MissionSummary,
  Recommendation,
  SkillSummary,
  SubjectSummary,
} from "./coach.types";

const SCHEMA_VERSION = "1.0" as const;
const PROMPT_VERSION = "coach-v1" as const;

/** Human-readable titles for the deterministic recommendation engine's fixed rule set (recommendation-engine.ts). */
const RECOMMENDATION_TITLES: Record<RecommendationType, string> = {
  focus_weak_skill: "Focus on a weak skill",
  practice_overdue: "Practise overdue skills",
  slow_down: "Slow down and build confidence",
  timed_practice: "Try some timed practice",
  add_challenge: "Add more challenge",
};

export class ContextBuilderValidationError extends Error {
  constructor(
    message: string,
    /** The rejected candidate, still shaped like a LearnerCoachingContext even though a field failed validation — kept so a caller can still build a deterministic fallback (which does no validation of its own) rather than fail outright. Never sent to a prompt or the gateway. */
    readonly candidate: LearnerCoachingContext,
  ) {
    super(message);
    this.name = "ContextBuilderValidationError";
  }
}

function toSkillSummary(skill: SkillHighlight): SkillSummary {
  return {
    name: skill.skillName,
    subject: skill.subjectName,
    mastery: skill.masteryScore,
    confidence: skill.confidenceScore,
  };
}

function toSubjectSummary(subject: SubjectInsight): SubjectSummary {
  return {
    subject: subject.subjectName,
    mastery: subject.masteryScore,
    confidence: subject.confidenceScore,
    accuracy: subject.accuracy,
  };
}

function toRecommendation(
  recommendation: DashboardRecommendation,
): Recommendation {
  return {
    title: RECOMMENDATION_TITLES[recommendation.type],
    description: recommendation.message,
  };
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function isCompletedWithDate(
  row: SessionHistoryRow,
): row is SessionHistoryRow & { completedAt: string } {
  return row.status === "completed" && row.completedAt !== null;
}

export interface BuildContextParams {
  learnerId: string;
  audience: Audience;
  referenceTimestamp?: Date;
}

/**
 * The only class allowed to talk to learning services (ParentDashboardService,
 * MissionCompletionService) on the AI platform's behalf. Everything else
 * under src/modules/ai/ — prompts, providers, validators, the fallback
 * coach — receives only the LearnerCoachingContext this produces, never a
 * repository or service reference of its own. No calculations are
 * duplicated here: every number comes from data ParentDashboardService (and,
 * for the exact recent-mission score, MissionCompletionService) already
 * computed for Phase 5.3.
 */
export class ContextBuilder {
  constructor(
    private readonly dashboardService: ParentDashboardService,
    private readonly missionCompletionService: MissionCompletionService,
  ) {}

  /** Throws ContextBuilderValidationError if the assembled DTO fails validation — callers should fall back, never call the AI gateway with a rejected context. */
  async build(params: BuildContextParams): Promise<LearnerCoachingContext> {
    const referenceTimestamp = params.referenceTimestamp ?? new Date();
    const dashboard = await this.dashboardService.getDashboardData(
      params.learnerId,
      referenceTimestamp,
    );

    const recentMission = await this.buildRecentMission(
      params.learnerId,
      dashboard.sessionHistory,
    );

    const candidate: LearnerCoachingContext = {
      schemaVersion: SCHEMA_VERSION,
      promptVersion: PROMPT_VERSION,
      audience: params.audience,
      learnerDisplayName: dashboard.learnerName,
      generatedForDate: formatDate(referenceTimestamp),
      overallMastery: dashboard.learningHealth.overallMasteryScore ?? 0,
      overallAccuracy: dashboard.learningHealth.overallAccuracy ?? 0,
      totalQuestionsAnswered: dashboard.learningHealth.totalQuestionsAnswered,
      currentStreak: dashboard.learningHealth.currentStreakDays,
      skillsDueForReview: dashboard.learningHealth.skillsDueForReviewCount,
      strongestSkills: dashboard.strongestSkills.map(toSkillSummary),
      focusSkills: dashboard.focusSkills.map(toSkillSummary),
      subjectInsights: dashboard.subjectInsights.map(toSubjectSummary),
      deterministicRecommendations:
        dashboard.recommendations.map(toRecommendation),
      recentMission,
      upcomingFocusSkills: dashboard.upcomingMissionPreview.focusSkillNames,
    };

    const result = validateLearnerCoachingContext(candidate);
    if (!result.success) {
      throw new ContextBuilderValidationError(result.error, candidate);
    }
    return result.data;
  }

  private async buildRecentMission(
    learnerId: string,
    sessionHistory: ParentDashboardData["sessionHistory"],
  ): Promise<MissionSummary | null> {
    const mostRecentCompleted = sessionHistory.find(isCompletedWithDate);
    if (!mostRecentCompleted) return null;

    const summary = await this.missionCompletionService.getSummary(
      learnerId,
      mostRecentCompleted.missionId,
    );

    return {
      score: summary.correctCount,
      totalQuestions: summary.totalQuestions,
      durationMinutes: summary.displayMinutes,
      completedAt: mostRecentCompleted.completedAt,
    };
  }
}
