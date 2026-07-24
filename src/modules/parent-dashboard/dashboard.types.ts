import type { MissionStatus } from "@/modules/missions/mission.types";
import type {
  SkillSummary,
  SubjectSummary,
} from "@/modules/learning-profile/mastery.types";

export type MasteryLabel = "Excellent" | "Developing" | "Needs Practice";

export interface SubjectInsight extends SubjectSummary {
  masteryLabel: MasteryLabel;
}

export interface SkillHighlight extends SkillSummary {
  reviewDue: boolean;
}

export interface LearningHealth {
  overallMasteryScore: number | null;
  overallAccuracy: number | null;
  totalQuestionsAnswered: number;
  /** Approximate — see docs/Architecture.md → "Parent Intelligence Dashboard". */
  totalStudyTimeMs: number;
  currentStreakDays: number;
  longestStreakDays: number;
  daysLearnedThisMonth: number;
  skillsDueForReviewCount: number;
}

export interface WeeklyProgressRow {
  missionId: string;
  missionDate: string;
  questionCount: number;
  accuracyPercent: number | null;
  totalResponseMs: number;
  /**
   * Approximate mastery movement for this session: sum of the pure
   * difficulty-based mastery delta (see mastery-calculator.ts's
   * computeMasteryDelta) across the mission's attempts. Excludes the
   * consistency-streak modifier, which needs full sequential replay —
   * there is no mastery_history table yet to read a true delta from.
   */
  masteryChangeApprox: number;
}

export interface SessionHistoryRow {
  missionId: string;
  missionDate: string;
  status: MissionStatus;
  completedAt: string | null;
  questionCount: number;
  answeredCount: number;
  accuracyPercent: number | null;
  totalResponseMs: number;
}

export type RecommendationType =
  | "focus_weak_skill"
  | "practice_overdue"
  | "slow_down"
  | "timed_practice"
  | "add_challenge";

export interface Recommendation {
  type: RecommendationType;
  message: string;
}

/** Skill names only — never scores, reasons, or category weights (see docs/Architecture.md). */
export interface UpcomingMissionPreview {
  focusSkillNames: string[];
}

export interface ParentDashboardData {
  learnerId: string;
  learnerName: string;
  /** False when the learner has no mastery data yet — most sections render an empty state. */
  hasData: boolean;
  learningHealth: LearningHealth;
  /** Sorted weakest mastery first. */
  subjectInsights: SubjectInsight[];
  strongestSkills: SkillHighlight[];
  focusSkills: SkillHighlight[];
  /** Last 7 completed sessions, most recent first. */
  weeklyProgress: WeeklyProgressRow[];
  recommendations: Recommendation[];
  upcomingMissionPreview: UpcomingMissionPreview;
  /** Recent missions, most recent first. */
  sessionHistory: SessionHistoryRow[];
}
