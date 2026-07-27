import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_ADAPTIVE_CONFIG } from "./adaptive-config";

// A narrow, single-question counterpart to adaptive-selector.ts's whole-
// mission generator. Callers outside this module (e.g.
// src/modules/question-explainer/) get exactly one function to call and
// never see QuestionCandidate, candidate-builder.ts, or the category-based
// selection algorithm those own — see docs/AI_CONSTITUTION.md's TDS-007
// Stage 1 decision that the explainer "should not know how mission
// candidate construction works."

export class FollowUpSelectorRepositoryError extends Error {}

export interface FollowUpCandidate {
  questionId: string;
  difficulty: number;
}

export interface FollowUpQuestion {
  questionId: string;
}

export interface SelectFollowUpQuestionParams {
  learnerId: string;
  skillId: string;
  excludeQuestionIds: readonly string[];
  targetDifficulty: number;
  referenceTimestamp?: Date;
}

export interface FollowUpQuestionRepository {
  /** Active question_bank rows for one skill, already excluding excludeQuestionIds and anything the learner answered inside the cooldown window. */
  loadEligibleCandidates(params: {
    skillId: string;
    excludeQuestionIds: readonly string[];
    learnerId: string;
    cooldownSinceIso: string;
  }): Promise<FollowUpCandidate[]>;
}

/** Pure: closest difficulty to the target wins; ties prefer the easier option, then the lower question id, so the result is deterministic for the same candidate set. */
export function pickClosestDifficultyCandidate(
  candidates: readonly FollowUpCandidate[],
  targetDifficulty: number,
): FollowUpCandidate | null {
  if (candidates.length === 0) return null;

  return [...candidates].sort((a, b) => {
    const distanceA = Math.abs(a.difficulty - targetDifficulty);
    const distanceB = Math.abs(b.difficulty - targetDifficulty);
    if (distanceA !== distanceB) return distanceA - distanceB;
    if (a.difficulty !== b.difficulty) return a.difficulty - b.difficulty;
    return a.questionId < b.questionId
      ? -1
      : a.questionId > b.questionId
        ? 1
        : 0;
  })[0]!;
}

/**
 * The one function a business capability outside adaptive-learning should
 * call to get a single deterministic follow-up question for a skill.
 * Reuses the same cooldown window as full mission generation
 * (adaptive-config.ts's DEFAULT_ADAPTIVE_CONFIG.cooldownDays) so a follow-up
 * never repeats a question the learner answered recently.
 */
export class FollowUpQuestionSelector {
  constructor(private readonly repository: FollowUpQuestionRepository) {}

  async selectFollowUpQuestion(
    params: SelectFollowUpQuestionParams,
  ): Promise<FollowUpQuestion | null> {
    const referenceTimestamp = params.referenceTimestamp ?? new Date();
    const cooldownSinceIso = new Date(
      referenceTimestamp.getTime() -
        DEFAULT_ADAPTIVE_CONFIG.cooldownDays * 24 * 60 * 60 * 1000,
    ).toISOString();

    const candidates = await this.repository.loadEligibleCandidates({
      skillId: params.skillId,
      excludeQuestionIds: params.excludeQuestionIds,
      learnerId: params.learnerId,
      cooldownSinceIso,
    });

    const picked = pickClosestDifficultyCandidate(
      candidates,
      params.targetDifficulty,
    );
    return picked ? { questionId: picked.questionId } : null;
  }
}

interface RawCandidateRow {
  id: string;
  difficulty: number | null;
}

interface RawRecentAttemptRow {
  question_id: string;
}

export class SupabaseFollowUpQuestionRepository implements FollowUpQuestionRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async loadEligibleCandidates(params: {
    skillId: string;
    excludeQuestionIds: readonly string[];
    learnerId: string;
    cooldownSinceIso: string;
  }): Promise<FollowUpCandidate[]> {
    const { data, error } = await this.supabase
      .from("question_bank")
      .select("id,difficulty")
      .eq("skill_id", params.skillId)
      .eq("is_active", true);

    if (error) {
      throw new FollowUpSelectorRepositoryError(
        `Unable to load follow-up candidates: ${error.message}`,
      );
    }

    const excludeSet = new Set(params.excludeQuestionIds);
    const rows = ((data ?? []) as RawCandidateRow[]).filter(
      (row) => !excludeSet.has(row.id),
    );
    if (rows.length === 0) return [];

    // Same child-to-parent embed shape already proven safe under RLS in
    // adaptive-mission.repository.ts's loadRecentAttemptRows.
    const { data: recentRows, error: recentError } = await this.supabase
      .from("question_attempts")
      .select("question_id,mission_items!inner(missions!inner(learner_id))")
      .gte("answered_at", params.cooldownSinceIso)
      .eq("mission_items.missions.learner_id", params.learnerId)
      .in(
        "question_id",
        rows.map((row) => row.id),
      );

    if (recentError) {
      throw new FollowUpSelectorRepositoryError(
        `Unable to load recent attempts: ${recentError.message}`,
      );
    }

    const recentIds = new Set(
      ((recentRows ?? []) as unknown as RawRecentAttemptRow[]).map(
        (row) => row.question_id,
      ),
    );

    return rows
      .filter((row) => !recentIds.has(row.id))
      .map((row) => ({ questionId: row.id, difficulty: row.difficulty ?? 1 }));
  }
}
