export type MissionPlayerStatus = "ready" | "in_progress" | "completed";

export interface MissionPlayerOption {
  id: string;
  label: string;
}

export interface MissionPlayerAttempt {
  selectedOptionId: string;
  correctOptionId: string;
  isCorrect: boolean;
  explanation: string;
  responseMs: number;
}

export interface MissionPlayerQuestion {
  missionItemId: string;
  questionId: string;
  position: number;
  subjectName: string;
  subjectSlug: string;
  topicName: string | null;
  prompt: string;
  options: MissionPlayerOption[];
  attempt: MissionPlayerAttempt | null;
}

export interface MissionPlayer {
  missionId: string;
  learnerId: string;
  missionDate: string;
  status: MissionPlayerStatus;
  estimatedMinutes: number;
  completedAt: string | null;
  totalQuestions: number;
  answeredCount: number;
  correctCount: number;
  questions: MissionPlayerQuestion[];
}

export interface SubjectBreakdown {
  subjectName: string;
  total: number;
  correct: number;
}

export interface MissionSummaryStats {
  status: MissionPlayerStatus;
  totalQuestions: number;
  answeredCount: number;
  correctCount: number;
  completedAt: string | null;
}

export interface SubmitAnswerResult {
  missionItemId: string;
  isCorrect: boolean;
  correctOptionId: string;
  explanation: string;
  mission: MissionSummaryStats;
}
