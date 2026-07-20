export type MissionStatus = "ready" | "in_progress" | "completed";

export interface MissionSummary {
  missionId: string;
  learnerId: string;
  missionDate: string;
  status: MissionStatus;
  questionCount: number;
  estimatedMinutes: number;
  answeredCount: number;
  correctCount: number;
}

export interface MissionItem {
  id: string;
  questionId: string;
  position: number;
  subjectSlug: string;
}

export interface Mission extends MissionSummary {
  items: MissionItem[];
}
