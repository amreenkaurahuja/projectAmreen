import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildMasteryLookup,
  buildQuestionCandidates,
  buildRecentAttemptLookup,
  type RawMasteryRow,
  type RawQuestionCandidateRow,
  type RawRecentAttemptRow,
} from "./candidate-builder";
import type { QuestionCandidate, SkillMasteryState } from "./adaptive.types";

export class AdaptiveDataRepositoryError extends Error {}

export interface AdaptiveCandidateData {
  candidates: QuestionCandidate[];
  masteryBySkill: Map<string, SkillMasteryState>;
  /** questionId -> most recent answered_at, limited to the cooldown window already. */
  recentAttemptsByQuestion: Map<string, string>;
  activeSubjectSlugs: string[];
}

export interface AdaptiveDataRepository {
  /** cooldownSinceIso bounds the recent-attempts query — no need to pull a learner's entire history. */
  loadCandidateData(
    learnerId: string,
    cooldownSinceIso: string,
  ): Promise<AdaptiveCandidateData>;
}

interface RawRecentAttemptJoinRow {
  question_id: string;
  answered_at: string;
}

export class SupabaseAdaptiveDataRepository implements AdaptiveDataRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async loadCandidateData(
    learnerId: string,
    cooldownSinceIso: string,
  ): Promise<AdaptiveCandidateData> {
    const [questionRows, masteryRows, recentAttemptRows, activeSubjectSlugs] =
      await Promise.all([
        this.loadQuestionRows(),
        this.loadMasteryRows(learnerId),
        this.loadRecentAttemptRows(learnerId, cooldownSinceIso),
        this.loadActiveSubjectSlugs(),
      ]);

    return {
      candidates: buildQuestionCandidates(questionRows),
      masteryBySkill: buildMasteryLookup(masteryRows),
      recentAttemptsByQuestion: buildRecentAttemptLookup(recentAttemptRows),
      activeSubjectSlugs,
    };
  }

  private async loadQuestionRows(): Promise<RawQuestionCandidateRow[]> {
    const { data, error } = await this.supabase
      .from("question_bank")
      .select("id,subject_id,topic_id,skill_id,difficulty,subjects!inner(slug)")
      .eq("is_active", true);

    if (error) {
      throw new AdaptiveDataRepositoryError(
        `Unable to load candidate questions: ${error.message}`,
      );
    }
    return (data ?? []) as unknown as RawQuestionCandidateRow[];
  }

  private async loadMasteryRows(learnerId: string): Promise<RawMasteryRow[]> {
    const { data, error } = await this.supabase
      .from("learner_skill_mastery")
      .select("skill_id,subject_id,mastery_score,total_attempts,next_review_at")
      .eq("learner_id", learnerId);

    if (error) {
      throw new AdaptiveDataRepositoryError(
        `Unable to load mastery data: ${error.message}`,
      );
    }
    return (data ?? []) as RawMasteryRow[];
  }

  /**
   * Goes question_attempts -> mission_items -> missions (each step a
   * to-one FK join), filtering by the embedded missions.learner_id. This is
   * the opposite direction from the to-many embed documented in
   * docs/Architecture.md as unsafe under RLS (that case was embedding
   * question_attempts *under* mission_items); a child-to-parent chain like
   * this one is the same shape already used safely elsewhere (e.g.
   * mission-player.repository.ts's question_bank/subjects embed).
   */
  private async loadRecentAttemptRows(
    learnerId: string,
    sinceIso: string,
  ): Promise<RawRecentAttemptRow[]> {
    const { data, error } = await this.supabase
      .from("question_attempts")
      .select(
        "question_id,answered_at,mission_items!inner(missions!inner(learner_id))",
      )
      .gte("answered_at", sinceIso)
      .eq("mission_items.missions.learner_id", learnerId);

    if (error) {
      throw new AdaptiveDataRepositoryError(
        `Unable to load recent attempts: ${error.message}`,
      );
    }

    return ((data ?? []) as unknown as RawRecentAttemptJoinRow[]).map(
      (row) => ({
        question_id: row.question_id,
        answered_at: row.answered_at,
      }),
    );
  }

  private async loadActiveSubjectSlugs(): Promise<string[]> {
    const { data, error } = await this.supabase
      .from("subjects")
      .select("slug")
      .eq("is_active", true)
      .order("sort_order");

    if (error) {
      throw new AdaptiveDataRepositoryError(
        `Unable to load active subjects: ${error.message}`,
      );
    }
    return (data ?? []).map((row) => row.slug as string);
  }
}
