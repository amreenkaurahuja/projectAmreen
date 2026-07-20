export type MissionStatus = "ready" | "in_progress" | "completed";

export type MissionQuestion = {
  missionItemId: string;
  questionId: string;
  subjectName: string;
  subjectSlug: string;
  prompt: string;
  explanation: string;
  difficulty: number;
  options: Array<{ id: string; label: string }>;
  answeredOptionId: string | null;
  isCorrect: boolean | null;
};

export type DailyMission = {
  id: string;
  learnerId: string;
  missionDate: string;
  status: MissionStatus;
  estimatedMinutes: number;
  totalQuestions: number;
  answeredQuestions: number;
  correctAnswers: number;
  questions: MissionQuestion[];
};
