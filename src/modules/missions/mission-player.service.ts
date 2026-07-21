import { logger } from "@/lib/observability/logger";
import {
  MissionNotFoundError,
  MissionRepositoryError,
} from "./mission.repository";
import type { MissionPlayerRepository } from "./mission-player.repository";
import type {
  MissionPlayer,
  MissionPlayerQuestion,
  SubmitAnswerResult,
} from "./mission-player.types";

export class MissionOptionInvalidError extends MissionRepositoryError {}

/**
 * Narrow structural interface (not imported from the learning-profile
 * module) so mission-player stays decoupled from mastery internals —
 * MasteryService satisfies this shape without either module depending on
 * the other's concrete types.
 */
export interface MasteryProcessor {
  processQuestionAttempt(params: {
    learnerId: string;
    attemptId: string;
    questionId: string;
    isCorrect: boolean;
    responseMs: number | null;
    answeredAt: Date;
    requestId?: string;
  }): Promise<unknown>;
}

export class MissionPlayerService {
  constructor(
    private readonly repository: MissionPlayerRepository,
    private readonly masteryProcessor?: MasteryProcessor,
  ) {}

  async getMissionForPlayer(
    learnerId: string,
    missionId: string,
  ): Promise<MissionPlayer> {
    await this.repository.assertLearnerOwned(learnerId);

    const mission = await this.repository.getMissionRecord(
      missionId,
      learnerId,
    );
    if (!mission) {
      throw new MissionNotFoundError("Mission not found");
    }

    const items = await this.repository.getMissionItems(missionId);

    const questions: MissionPlayerQuestion[] = items.map((item) => {
      const correctOption = item.options.find((option) => option.isCorrect);

      return {
        missionItemId: item.missionItemId,
        questionId: item.questionId,
        position: item.position,
        subjectName: item.subjectName,
        subjectSlug: item.subjectSlug,
        topicName: item.topicName,
        prompt: item.prompt,
        options: item.options.map((option) => ({
          id: option.id,
          label: option.label,
        })),
        attempt: item.attempt
          ? {
              selectedOptionId: item.attempt.selectedOptionId,
              correctOptionId: correctOption?.id ?? "",
              isCorrect: item.attempt.isCorrect,
              explanation: item.explanation,
              responseMs: item.attempt.responseMs,
            }
          : null,
      };
    });

    const answeredCount = questions.filter(
      (question) => question.attempt,
    ).length;
    const correctCount = questions.filter(
      (question) => question.attempt?.isCorrect,
    ).length;

    return {
      missionId: mission.missionId,
      learnerId: mission.learnerId,
      missionDate: mission.missionDate,
      status: mission.status,
      estimatedMinutes: mission.estimatedMinutes,
      completedAt: mission.completedAt,
      totalQuestions: questions.length,
      answeredCount,
      correctCount,
      questions,
    };
  }

  async submitAnswer(params: {
    learnerId: string;
    missionId: string;
    missionItemId: string;
    optionId: string;
    responseMs: number;
    requestId?: string;
  }): Promise<SubmitAnswerResult> {
    const { learnerId, missionId, missionItemId, optionId, requestId } = params;
    const responseMs = Math.max(0, Math.min(params.responseMs, 3_600_000));

    await this.repository.assertLearnerOwned(learnerId);

    const mission = await this.repository.getMissionRecord(
      missionId,
      learnerId,
    );
    if (!mission) {
      throw new MissionNotFoundError("Mission not found");
    }

    const item = await this.repository.getMissionItemForGrading(
      missionId,
      missionItemId,
    );
    if (!item) {
      throw new MissionNotFoundError("Mission item not found");
    }

    const option = item.options.find((candidate) => candidate.id === optionId);
    if (!option) {
      throw new MissionOptionInvalidError(
        "Option does not belong to this question",
      );
    }

    const { attemptId, answeredAt } = await this.repository.upsertAttempt({
      missionItemId: item.missionItemId,
      questionId: item.questionId,
      optionId,
      isCorrect: option.isCorrect,
      responseMs,
    });

    const counts = await this.repository.countAttempts(missionId);
    const completed =
      counts.totalQuestions > 0 &&
      counts.answeredCount === counts.totalQuestions;
    const status = completed ? "completed" : "in_progress";
    const completedAt = completed
      ? (mission.completedAt ?? new Date().toISOString())
      : null;

    await this.repository.updateMissionStatus({
      missionId,
      status,
      completedAt,
    });

    // Answer grading and mission progress are already durably persisted at
    // this point. Mastery processing must never turn a successful answer
    // submission into a failed request, so a failure here (defensive —
    // MasteryService.processQuestionAttempt itself is documented to never
    // throw) is only logged, not propagated.
    if (this.masteryProcessor) {
      try {
        await this.masteryProcessor.processQuestionAttempt({
          learnerId,
          attemptId,
          questionId: item.questionId,
          isCorrect: option.isCorrect,
          responseMs,
          answeredAt: new Date(answeredAt),
          requestId,
        });
      } catch (error) {
        logger.error("mission-player.mastery-processing-failed", {
          requestId,
          learnerId,
          missionId,
          missionItemId,
          attemptId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const correctOptionId =
      item.options.find((candidate) => candidate.isCorrect)?.id ?? "";

    return {
      missionItemId: item.missionItemId,
      isCorrect: option.isCorrect,
      correctOptionId,
      explanation: item.explanation,
      mission: {
        status,
        totalQuestions: counts.totalQuestions,
        answeredCount: counts.answeredCount,
        correctCount: counts.correctCount,
        completedAt,
      },
    };
  }
}
