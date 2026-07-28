import type { MissionPlayerStatus } from "./mission-player.types";

export interface SubjectBreakdownStat {
  subjectName: string;
  subjectSlug: string;
  attempted: number;
  correct: number;
  accuracyPercent: number;
}

export interface MissionCompletionSummary {
  missionId: string;
  learnerId: string;
  learnerName: string;
  status: MissionPlayerStatus;
  completedAt: string | null;
  totalQuestions: number;
  answeredCount: number;
  correctCount: number;
  accuracyPercent: number;
  totalResponseMs: number;
  hasRecordedTime: boolean;
  displayMinutes: number;
  scoreMessage: string;
  subjectBreakdown: SubjectBreakdownStat[];
}

export interface MissionReviewItem {
  missionItemId: string;
  attemptId: string;
  subjectName: string;
  subjectSlug: string;
  topicName: string | null;
  prompt: string;
  selectedOptionLabel: string;
  correctOptionLabel: string;
  explanation: string;
}

export interface MissionReview {
  missionId: string;
  learnerId: string;
  learnerName: string;
  totalQuestions: number;
  answeredCount: number;
  mistakes: MissionReviewItem[];
  isPerfectScore: boolean;
}
