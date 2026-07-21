export type MissionStatus = "ready" | "in_progress" | "completed";

/**
 * Why the adaptive generator chose a given question. Persisted on
 * mission_items (see migration 0009) — internal/explainability data only,
 * never surfaced to the learner UI.
 */
export type SelectionReason =
  | "weak_skill"
  | "review_due"
  | "curriculum_coverage"
  | "challenge"
  | "fallback";

export interface MissionSummary {
  missionId: string;
  learnerId: string;
  missionDate: string;
  status: MissionStatus;
  questionCount: number;
  estimatedMinutes: number;
  answeredCount: number;
  correctCount: number;
  completedAt: string | null;
}

export interface MissionItem {
  id: string;
  questionId: string;
  position: number;
  subjectSlug: string;
  /** Set by the adaptive generator; absent for anything created before it. */
  selectionReason?: SelectionReason;
}

export interface Mission extends MissionSummary {
  items: MissionItem[];
}
