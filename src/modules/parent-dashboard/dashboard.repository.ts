import type { SupabaseClient } from "@supabase/supabase-js";
import type { MissionStatus } from "@/modules/missions/mission.types";
import type { MissionAttemptRow, MissionMeta } from "./learning-health";

export class ParentDashboardRepositoryError extends Error {}
export class ParentDashboardAccessError extends ParentDashboardRepositoryError {}

/** Bounds the detailed (per-mission, per-attempt) fetch — comfortably covers the last-7-completed weekly view and a ~10-row session history table regardless of a learner's total lifetime mission count. */
const RECENT_MISSIONS_LIMIT = 30;

export interface RecentMissionData {
  missions: MissionMeta[];
  attemptsByMission: Map<string, MissionAttemptRow[]>;
}

export interface ParentDashboardRepository {
  getAuthenticatedUserId(): Promise<string>;
  assertLearnerOwned(learnerId: string): Promise<void>;
  /** All-time, lightweight (date only) — used for streak/days-learned-this-month, which need full history. */
  getCompletedMissionDates(learnerId: string): Promise<string[]>;
  /** Bounded to the most recent missions with full attempt/difficulty detail — used for session history and weekly progress. */
  getRecentMissionData(learnerId: string): Promise<RecentMissionData>;
  getSkillNames(skillIds: string[]): Promise<Map<string, string>>;
}

interface RawMissionRow {
  id: string;
  mission_date: string;
  status: MissionStatus;
  completed_at: string | null;
}

interface RawMissionItemRow {
  id: string;
  mission_id: string;
}

interface RawAttemptRow {
  is_correct: boolean;
  response_ms: number;
  question_bank: { difficulty: number } | { difficulty: number }[] | null;
  mission_items: { mission_id: string } | { mission_id: string }[] | null;
}

function resolveEmbed<T>(value: T | T[] | null): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export class SupabaseParentDashboardRepository implements ParentDashboardRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async getAuthenticatedUserId(): Promise<string> {
    const { data, error } = await this.supabase.auth.getUser();
    if (error || !data.user) {
      throw new ParentDashboardAccessError("Authentication required");
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
      throw new ParentDashboardRepositoryError(
        `Unable to verify learner ownership: ${error.message}`,
      );
    }
    if (!data) {
      throw new ParentDashboardAccessError(
        "Learner is not owned by the current user",
      );
    }
  }

  async getCompletedMissionDates(learnerId: string): Promise<string[]> {
    const { data, error } = await this.supabase
      .from("missions")
      .select("mission_date")
      .eq("learner_id", learnerId)
      .eq("status", "completed");

    if (error) {
      throw new ParentDashboardRepositoryError(
        `Unable to load completed mission dates: ${error.message}`,
      );
    }
    return (data ?? []).map((row) => row.mission_date as string);
  }

  async getRecentMissionData(learnerId: string): Promise<RecentMissionData> {
    const { data: missionRows, error: missionsError } = await this.supabase
      .from("missions")
      .select("id,mission_date,status,completed_at")
      .eq("learner_id", learnerId)
      .order("mission_date", { ascending: false })
      .limit(RECENT_MISSIONS_LIMIT);

    if (missionsError) {
      throw new ParentDashboardRepositoryError(
        `Unable to load missions: ${missionsError.message}`,
      );
    }

    const missionIds = (missionRows ?? []).map((row) => row.id);
    if (missionIds.length === 0) {
      return { missions: [], attemptsByMission: new Map() };
    }

    const { data: itemRows, error: itemsError } = await this.supabase
      .from("mission_items")
      .select("id,mission_id")
      .in("mission_id", missionIds);

    if (itemsError) {
      throw new ParentDashboardRepositoryError(
        `Unable to load mission items: ${itemsError.message}`,
      );
    }

    const questionCountByMission = new Map<string, number>();
    for (const item of (itemRows ?? []) as RawMissionItemRow[]) {
      questionCountByMission.set(
        item.mission_id,
        (questionCountByMission.get(item.mission_id) ?? 0) + 1,
      );
    }

    // Goes question_attempts -> mission_items -> missions (to-one each
    // step), same safe direction documented in
    // adaptive-learning/adaptive-mission.repository.ts — never the reverse
    // to-many embed that's unsafe under this table's RLS policy.
    const { data: attemptRows, error: attemptsError } = await this.supabase
      .from("question_attempts")
      .select(
        "response_ms,is_correct,question_bank!inner(difficulty),mission_items!inner(mission_id)",
      )
      .in("mission_items.mission_id", missionIds);

    if (attemptsError) {
      throw new ParentDashboardRepositoryError(
        `Unable to load attempts: ${attemptsError.message}`,
      );
    }

    const attemptsByMission = new Map<string, MissionAttemptRow[]>();
    for (const row of (attemptRows ?? []) as unknown as RawAttemptRow[]) {
      const missionItem = resolveEmbed(row.mission_items);
      const questionBank = resolveEmbed(row.question_bank);
      if (!missionItem) continue;

      const list = attemptsByMission.get(missionItem.mission_id) ?? [];
      list.push({
        isCorrect: row.is_correct,
        difficulty: questionBank?.difficulty ?? null,
        responseMs: row.response_ms,
      });
      attemptsByMission.set(missionItem.mission_id, list);
    }

    const missions: MissionMeta[] = (
      (missionRows ?? []) as RawMissionRow[]
    ).map((row) => ({
      missionId: row.id,
      missionDate: row.mission_date,
      status: row.status,
      completedAt: row.completed_at,
      questionCount: questionCountByMission.get(row.id) ?? 0,
    }));

    return { missions, attemptsByMission };
  }

  async getSkillNames(skillIds: string[]): Promise<Map<string, string>> {
    if (skillIds.length === 0) return new Map();

    const { data, error } = await this.supabase
      .from("skills")
      .select("id,name")
      .in("id", skillIds);

    if (error) {
      throw new ParentDashboardRepositoryError(
        `Unable to load skill names: ${error.message}`,
      );
    }

    return new Map(
      (data ?? []).map((row) => [row.id as string, row.name as string]),
    );
  }
}
