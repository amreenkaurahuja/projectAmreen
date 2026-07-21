import type { MissionPlayer } from "./mission-player.types";
import type {
  MissionCompletionSummary,
  MissionReview,
  MissionReviewItem,
  SubjectBreakdownStat,
} from "./mission-completion.types";

// Pure, framework-agnostic calculations shared by the server-rendered
// completion/review pages and the client-side completion screen, so the
// two never compute accuracy, breakdowns, or score messaging differently.

export function computeAccuracyPercent(
  correctCount: number,
  answeredCount: number,
): number {
  return answeredCount > 0
    ? Math.round((correctCount / answeredCount) * 100)
    : 0;
}

export function computeTotalResponseMs(mission: MissionPlayer): number {
  return mission.questions.reduce(
    (sum, item) => sum + (item.attempt?.responseMs ?? 0),
    0,
  );
}

export function computeDisplayMinutes(
  totalResponseMs: number,
  estimatedMinutes: number,
): number {
  return totalResponseMs > 0
    ? Math.round(totalResponseMs / 60000)
    : estimatedMinutes;
}

export function computeSubjectBreakdown(
  mission: MissionPlayer,
): SubjectBreakdownStat[] {
  const bySubject = new Map<string, SubjectBreakdownStat>();

  for (const item of mission.questions) {
    if (!item.attempt) continue;

    const existing = bySubject.get(item.subjectSlug) ?? {
      subjectName: item.subjectName,
      subjectSlug: item.subjectSlug,
      attempted: 0,
      correct: 0,
      accuracyPercent: 0,
    };
    existing.attempted += 1;
    if (item.attempt.isCorrect) existing.correct += 1;
    bySubject.set(item.subjectSlug, existing);
  }

  return Array.from(bySubject.values()).map((stat) => ({
    ...stat,
    accuracyPercent: computeAccuracyPercent(stat.correct, stat.attempted),
  }));
}

export function computeScoreMessage(accuracyPercent: number): string {
  if (accuracyPercent >= 90) return "Outstanding work";
  if (accuracyPercent >= 75) return "Great job";
  if (accuracyPercent >= 60) return "Good effort";
  return "Keep practising";
}

export function buildCompletionSummary(
  mission: MissionPlayer,
  learnerName: string,
): MissionCompletionSummary {
  const accuracyPercent = computeAccuracyPercent(
    mission.correctCount,
    mission.answeredCount,
  );
  const totalResponseMs = computeTotalResponseMs(mission);

  return {
    missionId: mission.missionId,
    learnerId: mission.learnerId,
    learnerName,
    status: mission.status,
    completedAt: mission.completedAt,
    totalQuestions: mission.totalQuestions,
    answeredCount: mission.answeredCount,
    correctCount: mission.correctCount,
    accuracyPercent,
    totalResponseMs,
    hasRecordedTime: totalResponseMs > 0,
    displayMinutes: computeDisplayMinutes(
      totalResponseMs,
      mission.estimatedMinutes,
    ),
    scoreMessage: computeScoreMessage(accuracyPercent),
    subjectBreakdown: computeSubjectBreakdown(mission),
  };
}

export function buildReview(
  mission: MissionPlayer,
  learnerName: string,
): MissionReview {
  const mistakes: MissionReviewItem[] = mission.questions
    .filter((item) => item.attempt && !item.attempt.isCorrect)
    .map((item) => {
      const attempt = item.attempt!;
      const selectedOption = item.options.find(
        (option) => option.id === attempt.selectedOptionId,
      );
      const correctOption = item.options.find(
        (option) => option.id === attempt.correctOptionId,
      );

      return {
        missionItemId: item.missionItemId,
        subjectName: item.subjectName,
        subjectSlug: item.subjectSlug,
        topicName: item.topicName,
        prompt: item.prompt,
        selectedOptionLabel: selectedOption?.label ?? "",
        correctOptionLabel: correctOption?.label ?? "",
        explanation: attempt.explanation,
      };
    });

  return {
    missionId: mission.missionId,
    learnerId: mission.learnerId,
    learnerName,
    totalQuestions: mission.totalQuestions,
    answeredCount: mission.answeredCount,
    mistakes,
    isPerfectScore: mistakes.length === 0,
  };
}
