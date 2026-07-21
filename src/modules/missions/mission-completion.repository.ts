import type { SupabaseClient } from "@supabase/supabase-js";
import { MissionRepositoryError } from "./mission.repository";

export interface MissionCompletionRepository {
  getLearnerDisplayName(learnerId: string): Promise<string | null>;
}

export class SupabaseMissionCompletionRepository implements MissionCompletionRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async getLearnerDisplayName(learnerId: string): Promise<string | null> {
    const { data, error } = await this.supabase
      .from("learners")
      .select("display_name")
      .eq("id", learnerId)
      .maybeSingle();

    if (error) {
      throw new MissionRepositoryError(
        `Unable to load learner: ${error.message}`,
      );
    }

    return data?.display_name ?? null;
  }
}
