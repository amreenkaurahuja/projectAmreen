import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  EnrichedMasteryRecord,
  LearnerSkillMasteryRecord,
  MasteryState,
  SkillCurriculumMetadata,
} from "./mastery.types";

export class MasteryRepositoryError extends Error {}
export class MasteryAccessError extends MasteryRepositoryError {}
/** Thrown when an optimistic insert/update loses a race — the caller retries. */
export class MasteryConcurrencyConflictError extends MasteryRepositoryError {}

export interface InsertMasteryParams {
  learnerId: string;
  skillId: string;
  subjectId: string;
  topicId: string | null;
  state: MasteryState;
}

export interface UpdateMasteryParams {
  id: string;
  expectedUpdatedAt: string;
  state: MasteryState;
}

export interface MasteryRepository {
  getAuthenticatedUserId(): Promise<string>;
  assertLearnerOwned(learnerId: string): Promise<void>;
  /**
   * Resolves subject/topic/skill/difficulty for a question. As of migration
   * 0008, question_bank.skill_id is NOT NULL, so this should always resolve
   * directly for any question created after that migration. The fallback to
   * the question's topic's sole active skill only exists to defensively
   * cover pre-0008 data in an environment where that migration hasn't run
   * yet. Returns null when no skill can be resolved at all (question not
   * found, or — pre-0008 fallback only — the topic has zero or multiple
   * active skills) — the caller must treat that as "cannot process," not an
   * error.
   */
  getQuestionCurriculumMetadata(
    questionId: string,
  ): Promise<SkillCurriculumMetadata | null>;
  /** Atomically claims an attempt for mastery processing. False if already claimed. */
  claimAttemptForMastery(attemptId: string): Promise<boolean>;
  /** Best-effort compensating action if processing fails after claiming. */
  unclaimAttempt(attemptId: string): Promise<void>;
  getMasteryRow(
    learnerId: string,
    skillId: string,
  ): Promise<LearnerSkillMasteryRecord | null>;
  insertMasteryRow(
    params: InsertMasteryParams,
  ): Promise<LearnerSkillMasteryRecord>;
  updateMasteryRow(
    params: UpdateMasteryParams,
  ): Promise<LearnerSkillMasteryRecord>;
  getAllMasteryForLearner(
    learnerId: string,
  ): Promise<LearnerSkillMasteryRecord[]>;
  /** Same rows as getAllMasteryForLearner, joined with skill/subject names for the profile summary. */
  getAllMasteryForLearnerEnriched(
    learnerId: string,
  ): Promise<EnrichedMasteryRecord[]>;
}

interface RawQuestionMetaRow {
  subject_id: string;
  topic_id: string | null;
  skill_id: string | null;
  difficulty: number;
}

interface RawMasteryRow {
  id: string;
  learner_id: string;
  skill_id: string;
  subject_id: string;
  topic_id: string | null;
  mastery_score: number;
  confidence_score: number;
  total_attempts: number;
  correct_attempts: number;
  incorrect_attempts: number;
  average_response_ms: number | null;
  last_response_ms: number | null;
  current_streak: number;
  best_streak: number;
  current_incorrect_streak: number;
  last_attempt_correct: boolean | null;
  last_practised_at: string | null;
  next_review_at: string | null;
  updated_at: string;
}

interface RawEnrichedMasteryRow extends RawMasteryRow {
  skills: { name: string };
  subjects: { name: string };
}

function mapRow(row: RawMasteryRow): LearnerSkillMasteryRecord {
  return {
    id: row.id,
    learnerId: row.learner_id,
    skillId: row.skill_id,
    subjectId: row.subject_id,
    topicId: row.topic_id,
    masteryScore: row.mastery_score,
    confidenceScore: row.confidence_score,
    totalAttempts: row.total_attempts,
    correctAttempts: row.correct_attempts,
    incorrectAttempts: row.incorrect_attempts,
    averageResponseMs: row.average_response_ms,
    lastResponseMs: row.last_response_ms,
    currentStreak: row.current_streak,
    bestStreak: row.best_streak,
    currentIncorrectStreak: row.current_incorrect_streak,
    lastAttemptCorrect: row.last_attempt_correct,
    lastPractisedAt: row.last_practised_at,
    nextReviewAt: row.next_review_at,
    updatedAt: row.updated_at,
  };
}

function stateToRow(state: MasteryState) {
  return {
    mastery_score: state.masteryScore,
    confidence_score: state.confidenceScore,
    total_attempts: state.totalAttempts,
    correct_attempts: state.correctAttempts,
    incorrect_attempts: state.incorrectAttempts,
    average_response_ms: state.averageResponseMs,
    last_response_ms: state.lastResponseMs,
    current_streak: state.currentStreak,
    best_streak: state.bestStreak,
    current_incorrect_streak: state.currentIncorrectStreak,
    last_attempt_correct: state.lastAttemptCorrect,
    last_practised_at: state.lastPractisedAt,
    next_review_at: state.nextReviewAt,
  };
}

export class SupabaseMasteryRepository implements MasteryRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async getAuthenticatedUserId(): Promise<string> {
    const { data, error } = await this.supabase.auth.getUser();
    if (error || !data.user) {
      throw new MasteryAccessError("Authentication required");
    }
    return data.user.id;
  }

  async assertLearnerOwned(learnerId: string): Promise<void> {
    const userId = await this.getAuthenticatedUserId();
    const { data, error } = await this.supabase
      .from("learners")
      .select("id")
      .eq("id", learnerId)
      .eq("parent_id", userId)
      .maybeSingle();

    if (error) {
      throw new MasteryRepositoryError(
        `Unable to verify learner ownership: ${error.message}`,
      );
    }

    if (!data) {
      throw new MasteryAccessError("Learner is not owned by the current user");
    }
  }

  async getQuestionCurriculumMetadata(
    questionId: string,
  ): Promise<SkillCurriculumMetadata | null> {
    const { data, error } = await this.supabase
      .from("question_bank")
      .select("subject_id,topic_id,skill_id,difficulty")
      .eq("id", questionId)
      .maybeSingle();

    if (error) {
      throw new MasteryRepositoryError(
        `Unable to load question metadata: ${error.message}`,
      );
    }
    if (!data) return null;

    const row = data as RawQuestionMetaRow;
    const skillId =
      row.skill_id ?? (await this.resolveTopicSkill(row.topic_id));
    if (!skillId) return null;

    return {
      skillId,
      subjectId: row.subject_id,
      topicId: row.topic_id,
      difficulty: row.difficulty,
    };
  }

  private async resolveTopicSkill(
    topicId: string | null,
  ): Promise<string | null> {
    if (!topicId) return null;

    const { data, error } = await this.supabase
      .from("skills")
      .select("id")
      .eq("topic_id", topicId)
      .eq("is_active", true);

    if (error) {
      throw new MasteryRepositoryError(
        `Unable to resolve a skill for topic ${topicId}: ${error.message}`,
      );
    }

    if (!data || data.length !== 1) return null;
    return data[0]!.id;
  }

  async claimAttemptForMastery(attemptId: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from("question_attempts")
      .update({ mastery_processed_at: new Date().toISOString() })
      .eq("id", attemptId)
      .is("mastery_processed_at", null)
      .select("id");

    if (error) {
      throw new MasteryRepositoryError(
        `Unable to claim attempt: ${error.message}`,
      );
    }

    return (data?.length ?? 0) > 0;
  }

  async unclaimAttempt(attemptId: string): Promise<void> {
    const { error } = await this.supabase
      .from("question_attempts")
      .update({ mastery_processed_at: null })
      .eq("id", attemptId);

    if (error) {
      throw new MasteryRepositoryError(
        `Unable to unclaim attempt: ${error.message}`,
      );
    }
  }

  async getMasteryRow(
    learnerId: string,
    skillId: string,
  ): Promise<LearnerSkillMasteryRecord | null> {
    const { data, error } = await this.supabase
      .from("learner_skill_mastery")
      .select("*")
      .eq("learner_id", learnerId)
      .eq("skill_id", skillId)
      .maybeSingle();

    if (error) {
      throw new MasteryRepositoryError(
        `Unable to load mastery: ${error.message}`,
      );
    }
    if (!data) return null;

    return mapRow(data as RawMasteryRow);
  }

  async insertMasteryRow(
    params: InsertMasteryParams,
  ): Promise<LearnerSkillMasteryRecord> {
    const { data, error } = await this.supabase
      .from("learner_skill_mastery")
      .insert({
        learner_id: params.learnerId,
        skill_id: params.skillId,
        subject_id: params.subjectId,
        topic_id: params.topicId,
        ...stateToRow(params.state),
      })
      .select("*")
      .single();

    if (error) {
      if (error.code === "23505") {
        throw new MasteryConcurrencyConflictError(
          "Mastery row already exists for this learner/skill",
        );
      }
      throw new MasteryRepositoryError(
        `Unable to create mastery row: ${error.message}`,
      );
    }

    return mapRow(data as RawMasteryRow);
  }

  async updateMasteryRow(
    params: UpdateMasteryParams,
  ): Promise<LearnerSkillMasteryRecord> {
    const { data, error } = await this.supabase
      .from("learner_skill_mastery")
      .update({
        ...stateToRow(params.state),
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.id)
      .eq("updated_at", params.expectedUpdatedAt)
      .select("*")
      .maybeSingle();

    if (error) {
      throw new MasteryRepositoryError(
        `Unable to update mastery row: ${error.message}`,
      );
    }
    if (!data) {
      throw new MasteryConcurrencyConflictError(
        "Mastery row was updated concurrently",
      );
    }

    return mapRow(data as RawMasteryRow);
  }

  async getAllMasteryForLearner(
    learnerId: string,
  ): Promise<LearnerSkillMasteryRecord[]> {
    const { data, error } = await this.supabase
      .from("learner_skill_mastery")
      .select("*")
      .eq("learner_id", learnerId);

    if (error) {
      throw new MasteryRepositoryError(
        `Unable to load learner mastery: ${error.message}`,
      );
    }

    return ((data ?? []) as RawMasteryRow[]).map(mapRow);
  }

  async getAllMasteryForLearnerEnriched(
    learnerId: string,
  ): Promise<EnrichedMasteryRecord[]> {
    const { data, error } = await this.supabase
      .from("learner_skill_mastery")
      .select("*, skills!inner(name), subjects!inner(name)")
      .eq("learner_id", learnerId);

    if (error) {
      throw new MasteryRepositoryError(
        `Unable to load learner mastery: ${error.message}`,
      );
    }

    return ((data ?? []) as RawEnrichedMasteryRow[]).map((row) => ({
      ...mapRow(row),
      skillName: row.skills.name,
      subjectName: row.subjects.name,
    }));
  }
}
