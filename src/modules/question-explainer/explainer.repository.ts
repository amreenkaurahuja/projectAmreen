import type { SupabaseClient } from "@supabase/supabase-js";

export class ExplainerRepositoryError extends Error {}
export class ExplainerAccessError extends ExplainerRepositoryError {}

/** Everything the context builder and eligibility check need — already reduced to scalars, never a raw row, before it leaves this repository. */
export interface ExplanationSourceData {
  attemptId: string;
  isCorrect: boolean;
  questionId: string;
  skillId: string;
  skillName: string;
  subjectName: string;
  difficulty: number;
  prompt: string;
  learnerAnswerLabel: string;
  correctAnswerLabel: string;
  authoredExplanation: string;
}

export interface QuestionExplainerRepository {
  getAuthenticatedUserId(): Promise<string>;
  assertLearnerOwned(learnerId: string): Promise<void>;
  getLearnerDisplayName(learnerId: string): Promise<string | null>;
  /** Null covers "doesn't exist", "unanswered", and "belongs to another learner" alike — scoped by learnerId here rather than left to the caller, so a mismatched attempt never reveals whether it exists at all. */
  getExplanationSource(params: {
    learnerId: string;
    attemptId: string;
  }): Promise<ExplanationSourceData | null>;
  /** Used only to look up a deterministically-selected follow-up question's prompt text for the context (PS-007 §4) — never its id, and never used to grade or select it. Active-question scoping is already guaranteed by FollowUpQuestionSelector; this is a plain lookup, not an eligibility check. */
  getQuestionPromptById(questionId: string): Promise<string | null>;
  /**
   * TDS-007 Stage 4: the client never sends a learner id, only an
   * attemptId — this is how the API route resolves which learner an
   * attempt belongs to before calling QuestionExplainerService, which
   * still takes an explicit learnerId (Stage 1-3 unchanged). Null covers
   * "doesn't exist" and "belongs to another learner" alike, same as
   * getExplanationSource — this table's RLS policy (0004's "Parents manage
   * own attempts") already restricts every query here to the current
   * session's own learners, so a mismatched attempt is invisible at the
   * database level, not just filtered in application code.
   */
  getLearnerIdForAttempt(attemptId: string): Promise<string | null>;
}

interface RawOptionRow {
  id: string;
  label: string;
  is_correct: boolean;
}

interface RawQuestionRow {
  id: string;
  prompt: string;
  explanation: string;
  difficulty: number | null;
  skill_id: string;
  subjects: { name: string };
  skills: { name: string };
  question_options: RawOptionRow[];
}

interface RawMissionItemRow {
  missions: { learner_id: string };
  question_bank: RawQuestionRow;
}

interface RawAttemptRow {
  id: string;
  is_correct: boolean;
  question_id: string;
  selected_option_id: string;
  mission_items: RawMissionItemRow;
}

export class SupabaseQuestionExplainerRepository implements QuestionExplainerRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async getAuthenticatedUserId(): Promise<string> {
    const { data, error } = await this.supabase.auth.getUser();
    if (error || !data.user) {
      throw new ExplainerAccessError("Authentication required");
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
      throw new ExplainerRepositoryError(
        `Unable to verify learner ownership: ${error.message}`,
      );
    }
    if (!data) {
      throw new ExplainerAccessError(
        "Learner is not owned by the current user",
      );
    }
  }

  async getLearnerDisplayName(learnerId: string): Promise<string | null> {
    const { data, error } = await this.supabase
      .from("learners")
      .select("display_name")
      .eq("id", learnerId)
      .maybeSingle();

    if (error) {
      throw new ExplainerRepositoryError(
        `Unable to load learner: ${error.message}`,
      );
    }
    return data?.display_name ?? null;
  }

  async getExplanationSource(params: {
    learnerId: string;
    attemptId: string;
  }): Promise<ExplanationSourceData | null> {
    const { data, error } = await this.supabase
      .from("question_attempts")
      .select(
        `
        id, is_correct, question_id, selected_option_id,
        mission_items!inner(
          missions!inner(learner_id),
          question_bank!inner(
            id, prompt, explanation, difficulty, skill_id,
            subjects!inner(name),
            skills!inner(name),
            question_options(id,label,is_correct)
          )
        )
      `,
      )
      .eq("id", params.attemptId)
      .maybeSingle();

    if (error) {
      throw new ExplainerRepositoryError(
        `Unable to load attempt for explanation: ${error.message}`,
      );
    }
    if (!data) return null;

    const row = data as unknown as RawAttemptRow;
    // Scoped here rather than in the query itself (the learner_id lives two
    // joins away) — same reasoning as adaptive-mission.repository.ts's
    // loadRecentAttemptRows comment on filtering embedded-relation columns.
    if (row.mission_items.missions.learner_id !== params.learnerId) {
      return null;
    }

    const question = row.mission_items.question_bank;
    const selectedOption = question.question_options.find(
      (option) => option.id === row.selected_option_id,
    );
    const correctOption = question.question_options.find(
      (option) => option.is_correct,
    );

    return {
      attemptId: row.id,
      isCorrect: row.is_correct,
      questionId: row.question_id,
      skillId: question.skill_id,
      skillName: question.skills.name,
      subjectName: question.subjects.name,
      difficulty: question.difficulty ?? 1,
      prompt: question.prompt,
      learnerAnswerLabel: selectedOption?.label ?? "",
      correctAnswerLabel: correctOption?.label ?? "",
      authoredExplanation: question.explanation,
    };
  }

  async getQuestionPromptById(questionId: string): Promise<string | null> {
    const { data, error } = await this.supabase
      .from("question_bank")
      .select("prompt")
      .eq("id", questionId)
      .maybeSingle();

    if (error) {
      throw new ExplainerRepositoryError(
        `Unable to load follow-up question: ${error.message}`,
      );
    }
    return data?.prompt ?? null;
  }

  async getLearnerIdForAttempt(attemptId: string): Promise<string | null> {
    const { data, error } = await this.supabase
      .from("question_attempts")
      .select("mission_items!inner(missions!inner(learner_id))")
      .eq("id", attemptId)
      .maybeSingle();

    if (error) {
      throw new ExplainerRepositoryError(
        `Unable to resolve learner for attempt: ${error.message}`,
      );
    }
    if (!data) return null;

    const row = data as unknown as {
      mission_items: { missions: { learner_id: string } };
    };
    return row.mission_items.missions.learner_id;
  }
}
