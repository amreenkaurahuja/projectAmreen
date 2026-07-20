import type { SupabaseClient } from "@supabase/supabase-js";
import type { MissionItem, MissionSummary } from "./mission.types";
import type { DatabaseQuestionRecord } from "./mission.generator";

export class MissionRepositoryError extends Error {}

export class MissionAccessError extends MissionRepositoryError {}

export class MissionDuplicateError extends MissionRepositoryError {}

export class MissionQuestionBankError extends MissionRepositoryError {}

export interface MissionRepository {
  getAuthenticatedUserId(): Promise<string>;
  ensureLearnerOwned(learnerId: string): Promise<void>;
  findTodaysMission(learnerId: string): Promise<MissionSummary | null>;
  createMission(
    learnerId: string,
    missionDate: string,
    estimatedMinutes: number,
    items: MissionItem[],
  ): Promise<MissionSummary>;
  getActiveQuestionsBySubject(
    subjectSlug: string,
    limit: number,
  ): Promise<DatabaseQuestionRecord[]>;
}

export class SupabaseMissionRepository implements MissionRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async getAuthenticatedUserId(): Promise<string> {
    const { data, error } = await this.supabase.auth.getUser();
    if (error || !data.user) {
      throw new MissionAccessError("Authentication required");
    }
    return data.user.id;
  }

  async ensureLearnerOwned(learnerId: string): Promise<void> {
    const { data, error } = await this.supabase
      .from("learners")
      .select("id")
      .eq("id", learnerId)
      .eq("parent_id", await this.getAuthenticatedUserId())
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

  async findTodaysMission(learnerId: string): Promise<MissionSummary | null> {
    const missionDate = todayUtc();
    const { data, error } = await this.supabase
      .from("missions")
      .select("id,learner_id,mission_date,status,estimated_minutes")
      .eq("learner_id", learnerId)
      .eq("mission_date", missionDate)
      .maybeSingle();

    if (error) {
      throw new MissionRepositoryError(
        `Unable to load today's mission: ${error.message}`,
      );
    }

    if (!data) return null;

    const { data: items, error: itemsError } = await this.supabase
      .from("mission_items")
      .select("id")
      .eq("mission_id", data.id);

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

    const answeredItemIds = new Set(
      (attempts ?? [])
        .map((attempt) => attempt.mission_item_id)
        .filter((id): id is string => Boolean(id)),
    );
    const correctItemIds = new Set(
      (attempts ?? [])
        .filter((attempt) => attempt.is_correct)
        .map((attempt) => attempt.mission_item_id)
        .filter((id): id is string => Boolean(id)),
    );

    return {
      missionId: data.id,
      learnerId: data.learner_id,
      missionDate: data.mission_date,
      status: data.status,
      questionCount: itemIds.length,
      estimatedMinutes: data.estimated_minutes,
      answeredCount: answeredItemIds.size,
      correctCount: correctItemIds.size,
    };
  }

  async createMission(
    learnerId: string,
    missionDate: string,
    estimatedMinutes: number,
    items: MissionItem[],
  ): Promise<MissionSummary> {
    const { data, error } = await this.supabase
      .from("missions")
      .insert({
        learner_id: learnerId,
        mission_date: missionDate,
        status: "ready",
        estimated_minutes: estimatedMinutes,
      })
      .select("id,learner_id,mission_date,status,estimated_minutes")
      .single();

    if (error) {
      if (error.code === "23505") {
        throw new MissionDuplicateError("Mission already exists");
      }
      throw new MissionRepositoryError(
        `Unable to create mission: ${error.message}`,
      );
    }

    const rows = items.map((item) => ({
      mission_id: data.id,
      question_id: item.questionId,
      position: item.position,
    }));

    const { error: insertError } = await this.supabase
      .from("mission_items")
      .insert(rows);

    if (insertError) {
      if (insertError.code === "23505") {
        throw new MissionDuplicateError("Mission already exists");
      }
      throw new MissionRepositoryError(
        `Unable to create mission items: ${insertError.message}`,
      );
    }

    return {
      missionId: data.id,
      learnerId: data.learner_id,
      missionDate: data.mission_date,
      status: data.status,
      questionCount: rows.length,
      estimatedMinutes: data.estimated_minutes,
      answeredCount: 0,
      correctCount: 0,
    };
  }

  async getActiveQuestionsBySubject(
    subjectSlug: string,
    limit: number,
  ): Promise<DatabaseQuestionRecord[]> {
    const { data: subject, error: subjectError } = await this.supabase
      .from("subjects")
      .select("id")
      .eq("slug", subjectSlug)
      .eq("is_active", true)
      .maybeSingle();

    if (subjectError) {
      throw new MissionQuestionBankError(
        `Unable to load subject ${subjectSlug}`,
      );
    }

    if (!subject) {
      throw new MissionQuestionBankError(`Subject not found: ${subjectSlug}`);
    }

    const { data, error } = await this.supabase
      .from("question_bank")
      .select("id")
      .eq("subject_id", subject.id)
      .eq("is_active", true)
      .limit(limit * 3);

    if (error) {
      throw new MissionQuestionBankError(
        `Unable to load questions for ${subjectSlug}`,
      );
    }

    return (data ?? []).map((row) => ({
      id: row.id,
      subjectSlug: subjectSlug as DatabaseQuestionRecord["subjectSlug"],
    }));
  }
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}
