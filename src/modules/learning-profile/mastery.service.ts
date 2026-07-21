import * as Sentry from "@sentry/nextjs";
import { logger } from "@/lib/observability/logger";
import {
  applyAttemptToMastery,
  createInitialMasteryState,
} from "./mastery-calculator";
import { buildLearnerProfileSummary } from "./mastery-summary";
import {
  MasteryConcurrencyConflictError,
  type MasteryRepository,
} from "./mastery.repository";
import type {
  AttemptEvent,
  LearnerProfileSummary,
  LearnerSkillMasteryRecord,
  MasteryProcessingOutcome,
} from "./mastery.types";

const MAX_OPTIMISTIC_RETRIES = 5;

export interface ProcessQuestionAttemptParams {
  learnerId: string;
  /** question_attempts.id — the persisted attempt row, not the mission item. */
  attemptId: string;
  questionId: string;
  isCorrect: boolean;
  responseMs: number | null;
  answeredAt: Date;
  /** Included in logs/Sentry tags for correlation; optional. */
  requestId?: string;
}

/**
 * Orchestrates mastery processing for one persisted question attempt.
 *
 * Design decision (see docs/Architecture.md → "Learning profile & mastery"
 * for the full writeup): this never throws for a processing failure. The
 * attempt itself is already safely persisted by the time this runs — the
 * learner's immediate answer feedback and mission progress must not be
 * blocked or broken by a bug in the mastery engine. Failures are logged
 * (structured log + Sentry) and returned as a soft outcome; the attempt's
 * mastery_processed_at claim is rolled back so a later retry or the backfill
 * script (scripts/backfill-learning-mastery.ts) can pick it up again.
 */
export class MasteryService {
  constructor(private readonly repository: MasteryRepository) {}

  async processQuestionAttempt(
    params: ProcessQuestionAttemptParams,
  ): Promise<MasteryProcessingOutcome> {
    const {
      learnerId,
      attemptId,
      questionId,
      isCorrect,
      responseMs,
      answeredAt,
      requestId,
    } = params;

    try {
      await this.repository.assertLearnerOwned(learnerId);

      const metadata =
        await this.repository.getQuestionCurriculumMetadata(questionId);
      if (!metadata) {
        logger.warn("learning-profile.mastery.no-resolvable-skill", {
          requestId,
          learnerId,
          questionId,
        });
        return { processed: false, reason: "no-resolvable-skill" };
      }

      const claimed = await this.repository.claimAttemptForMastery(attemptId);
      if (!claimed) {
        return { processed: false, reason: "already-processed" };
      }

      const event: AttemptEvent = {
        isCorrect,
        difficulty: metadata.difficulty,
        responseMs,
        answeredAt,
      };

      try {
        const mastery = await this.applyWithRetry({
          learnerId,
          skillId: metadata.skillId,
          subjectId: metadata.subjectId,
          topicId: metadata.topicId,
          event,
        });
        return { processed: true, mastery };
      } catch (error) {
        await this.repository.unclaimAttempt(attemptId).catch(() => undefined);
        throw error;
      }
    } catch (error) {
      Sentry.captureException(error, {
        tags: {
          request_id: requestId,
          learner_id: learnerId,
          question_id: questionId,
        },
      });
      logger.error("learning-profile.mastery.processing-failed", {
        requestId,
        learnerId,
        questionId,
        attemptId,
        error: error instanceof Error ? error.message : String(error),
      });
      return { processed: false, reason: "error" };
    }
  }

  /**
   * Loads and aggregates a learner's mastery data into the dashboard-facing
   * summary. Ownership is verified before any data is read. `referenceTimestamp`
   * defaults to the system clock but can be overridden for deterministic tests.
   */
  async getLearnerProfileSummary(
    learnerId: string,
    referenceTimestamp: Date = new Date(),
  ): Promise<LearnerProfileSummary> {
    await this.repository.assertLearnerOwned(learnerId);
    const records =
      await this.repository.getAllMasteryForLearnerEnriched(learnerId);
    return buildLearnerProfileSummary(records, referenceTimestamp);
  }

  /**
   * Optimistic concurrency: read current state, compute the new state with
   * the pure calculator, then attempt a conditional write (insert that
   * fails on a unique-constraint race, or an update gated on the row's
   * updated_at not having moved). On a lost race, re-read and retry —
   * bounded, since unbounded retries under this app's actual traffic
   * pattern (one learner answering one question at a time) would only ever
   * mask a real bug.
   */
  private async applyWithRetry(input: {
    learnerId: string;
    skillId: string;
    subjectId: string;
    topicId: string | null;
    event: AttemptEvent;
  }): Promise<LearnerSkillMasteryRecord> {
    let lastError: unknown;

    for (let attempt = 0; attempt < MAX_OPTIMISTIC_RETRIES; attempt += 1) {
      try {
        const existing = await this.repository.getMasteryRow(
          input.learnerId,
          input.skillId,
        );
        const newState = applyAttemptToMastery(
          existing ?? createInitialMasteryState(),
          input.event,
        );

        if (!existing) {
          return await this.repository.insertMasteryRow({
            learnerId: input.learnerId,
            skillId: input.skillId,
            subjectId: input.subjectId,
            topicId: input.topicId,
            state: newState,
          });
        }

        return await this.repository.updateMasteryRow({
          id: existing.id,
          expectedUpdatedAt: existing.updatedAt,
          state: newState,
        });
      } catch (error) {
        if (error instanceof MasteryConcurrencyConflictError) {
          lastError = error;
          continue;
        }
        throw error;
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error("Mastery update failed after retries");
  }
}
