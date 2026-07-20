import type { SupabaseClient } from "@supabase/supabase-js";
import {
  MissionAccessError,
  MissionRepositoryError,
} from "./mission.repository";
import type { MissionPlayerStatus } from "./mission-player.types";

export interface MissionRecord {
  missionId: string;
  learnerId: string;
  missionDate: string;
  status: MissionPlayerStatus;
  estimatedMinutes: number;
  completedAt: string | null;
}

export interface MissionItemRecord {
  missionItemId: string;
  questionId: string;
  position: number;
  subjectName: string;
  subjectSlug: string;
  topicName: string | null;
  prompt: string;
  explanation: string;
  options: Array<{
    id: string;
    label: string;
    isCorrect: boolean;
    sortOrder: number;
  }>;
  attempt: {
    selectedOptionId: string;
    isCorrect: boolean;
    responseMs: number;
  } | null;
}

export interface MissionItemForGrading {
  missionItemId: string;
  questionId: string;
  explanation: string;
  options: Array<{ id: string; isCorrect: boolean }>;
}

export interface AttemptCounts {
  answeredCount: number;
  correctCount: number;
  totalQuestions: number;
}

export interface MissionPlayerRepository {
  getAuthenticatedUserId(): Promise<string>;
  assertLearnerOwned(learnerId: string): Promise<void>;
  getMissionRecord(
    missionId: string,
    learnerId: string,
  ): Promise<MissionRecord | null>;
  getMissionItems(missionId: string): Promise<MissionItemRecord[]>;
  getMissionItemForGrading(
    missionId: string,
    missionItemId: string,
  ): Promise<MissionItemForGrading | null>;
  upsertAttempt(params: {
    missionItemId: string;
    questionId: string;
    optionId: string;
    isCorrect: boolean;
    responseMs: number;
  }): Promise<void>;
  countAttempts(missionId: string): Promise<AttemptCounts>;
  updateMissionStatus(params: {
    missionId: string;
    status: MissionPlayerStatus;
    completedAt: string | null;
  }): Promise<void>;
}

interface RawOptionRow {
  id: string;
  label: string;
  is_correct: boolean;
  sort_order: number;
}

interface RawQuestionRow {
  id: string;
  prompt: string;
  explanation: string;
  subjects: { name: string; slug: string };
  topics: { name: string } | null;
  question_options: RawOptionRow[];
}

interface RawAttemptRow {
  selected_option_id: string;
  is_correct: boolean;
  response_ms: number;
}

interface RawMissionItemRow {
  id: string;
  position: number;
  question_bank: RawQuestionRow;
}

interface RawAttemptWithItemRow extends RawAttemptRow {
  mission_item_id: string;
}

interface RawGradingRow {
  id: string;
  question_id: string;
  question_bank: {
    explanation: string;
    question_options: Array<{ id: string; is_correct: boolean }>;
  };
}

export class SupabaseMissionPlayerRepository implements MissionPlayerRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async getAuthenticatedUserId(): Promise<string> {
    const { data, error } = await this.supabase.auth.getUser();
    if (error || !data.user) {
      throw new MissionAccessError("Authentication required");
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
      throw new MissionRepositoryError(
        `Unable to verify learner ownership: ${error.message}`,
      );
    }

    if (!data) {
      throw new MissionAccessError("Learner is not owned by the current user");
    }
  }

  async getMissionRecord(
    missionId: string,
    learnerId: string,
  ): Promise<MissionRecord | null> {
    const { data, error } = await this.supabase
      .from("missions")
      .select(
        "id,learner_id,mission_date,status,estimated_minutes,completed_at",
      )
      .eq("id", missionId)
      .eq("learner_id", learnerId)
      .maybeSingle();

    if (error) {
      throw new MissionRepositoryError(
        `Unable to load mission: ${error.message}`,
      );
    }

    if (!data) return null;

    return {
      missionId: data.id,
      learnerId: data.learner_id,
      missionDate: data.mission_date,
      status: data.status,
      estimatedMinutes: data.estimated_minutes,
      completedAt: data.completed_at,
    };
  }

  async getMissionItems(missionId: string): Promise<MissionItemRecord[]> {
    const { data, error } = await this.supabase
      .from("mission_items")
      .select(
        `
        id, position,
        question_bank!inner(
          id, prompt, explanation,
          subjects!inner(name,slug),
          topics(name),
          question_options(id,label,is_correct,sort_order)
        )
      `,
      )
      .eq("mission_id", missionId)
      .order("position");

    if (error) {
      throw new MissionRepositoryError(
        `Unable to load mission items: ${error.message}`,
      );
    }

    const rows = (data ?? []) as unknown as RawMissionItemRow[];
    const itemIds = rows.map((row) => row.id);

    // Fetched as a separate query rather than embedded under mission_items:
    // PostgREST's generated SQL for a to-many embed through this table's RLS
    // policy does not resolve the same way a flat join does, and silently
    // returns an empty embed even for attempts the policy legitimately
    // grants access to. A direct query against question_attempts does not
    // hit that issue.
    const { data: attemptRows, error: attemptsError } =
      itemIds.length === 0
        ? { data: [] as RawAttemptWithItemRow[], error: null }
        : await this.supabase
            .from("question_attempts")
            .select("mission_item_id,selected_option_id,is_correct,response_ms")
            .in("mission_item_id", itemIds);

    if (attemptsError) {
      throw new MissionRepositoryError(
        `Unable to load mission attempts: ${attemptsError.message}`,
      );
    }

    const attemptsByItemId = new Map<string, RawAttemptRow>(
      ((attemptRows ?? []) as RawAttemptWithItemRow[]).map((attempt) => [
        attempt.mission_item_id,
        attempt,
      ]),
    );

    return rows.map((row) => {
      const question = row.question_bank;
      const attempt = attemptsByItemId.get(row.id) ?? null;

      return {
        missionItemId: row.id,
        questionId: question.id,
        position: row.position,
        subjectName: question.subjects.name,
        subjectSlug: question.subjects.slug,
        topicName: question.topics?.name ?? null,
        prompt: question.prompt,
        explanation: question.explanation,
        options: [...question.question_options]
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((option) => ({
            id: option.id,
            label: option.label,
            isCorrect: option.is_correct,
            sortOrder: option.sort_order,
          })),
        attempt: attempt
          ? {
              selectedOptionId: attempt.selected_option_id,
              isCorrect: attempt.is_correct,
              responseMs: attempt.response_ms,
            }
          : null,
      };
    });
  }

  async getMissionItemForGrading(
    missionId: string,
    missionItemId: string,
  ): Promise<MissionItemForGrading | null> {
    const { data, error } = await this.supabase
      .from("mission_items")
      .select(
        "id, question_id, question_bank!inner(explanation, question_options(id,is_correct))",
      )
      .eq("id", missionItemId)
      .eq("mission_id", missionId)
      .maybeSingle();

    if (error) {
      throw new MissionRepositoryError(
        `Unable to load mission item: ${error.message}`,
      );
    }

    if (!data) return null;

    const row = data as unknown as RawGradingRow;

    return {
      missionItemId: row.id,
      questionId: row.question_id,
      explanation: row.question_bank.explanation,
      options: row.question_bank.question_options.map((option) => ({
        id: option.id,
        isCorrect: option.is_correct,
      })),
    };
  }

  async upsertAttempt(params: {
    missionItemId: string;
    questionId: string;
    optionId: string;
    isCorrect: boolean;
    responseMs: number;
  }): Promise<void> {
    const { error } = await this.supabase.from("question_attempts").upsert(
      {
        mission_item_id: params.missionItemId,
        question_id: params.questionId,
        selected_option_id: params.optionId,
        is_correct: params.isCorrect,
        response_ms: params.responseMs,
        answered_at: new Date().toISOString(),
      },
      { onConflict: "mission_item_id" },
    );

    if (error) {
      throw new MissionRepositoryError(
        `Unable to save attempt: ${error.message}`,
      );
    }
  }

  async countAttempts(missionId: string): Promise<AttemptCounts> {
    const { data: items, error: itemsError } = await this.supabase
      .from("mission_items")
      .select("id")
      .eq("mission_id", missionId);

    if (itemsError) {
      throw new MissionRepositoryError(
        `Unable to load mission items: ${itemsError.message}`,
      );
    }

    const itemIds = (items ?? []).map((item) => item.id);

    const { data: attempts, error: attemptsError } = await this.supabase
      .from("question_attempts")
      .select("mission_item_id,is_correct")
      .in("mission_item_id", itemIds);

    if (attemptsError) {
      throw new MissionRepositoryError(
        `Unable to load mission attempts: ${attemptsError.message}`,
      );
    }

    const answeredCount = attempts?.length ?? 0;
    const correctCount = (attempts ?? []).filter(
      (attempt) => attempt.is_correct,
    ).length;

    return { answeredCount, correctCount, totalQuestions: itemIds.length };
  }

  async updateMissionStatus(params: {
    missionId: string;
    status: MissionPlayerStatus;
    completedAt: string | null;
  }): Promise<void> {
    const { error } = await this.supabase
      .from("missions")
      .update({ status: params.status, completed_at: params.completedAt })
      .eq("id", params.missionId);

    if (error) {
      throw new MissionRepositoryError(
        `Unable to update mission status: ${error.message}`,
      );
    }
  }
}
