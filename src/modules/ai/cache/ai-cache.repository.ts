import type { SupabaseClient } from "@supabase/supabase-js";
import type { Audience } from "../coach/coach.types";

export class AiCacheRepositoryError extends Error {}
/** Thrown on a unique-constraint conflict (learner_id, audience, context_hash) — a concurrent request already cached this exact context. */
export class AiCacheDuplicateError extends AiCacheRepositoryError {}

/** The coaching content itself — the same shape whether it came from the AI or the deterministic fallback. */
export interface CoachMessageContent {
  headline: string;
  message: string;
  strengths: string[];
  focusAreas: string[];
  nextSteps: string[];
  source: "ai" | "fallback";
}

/** A cache row's content plus the provider/model that produced it — kept internal to the AI platform for logging, never part of the public coach API response. */
export interface CachedCoachEntry extends CoachMessageContent {
  provider: string;
  model: string;
}

export interface SaveCoachEntryParams {
  learnerId: string;
  audience: Audience;
  contextHash: string;
  schemaVersion: string;
  promptVersion: string;
  provider: string;
  model: string;
  content: CoachMessageContent;
  expiresAt: string;
}

export interface AiCacheRepository {
  /** Null on a miss — expired rows are treated as a miss, not returned. */
  find(params: {
    learnerId: string;
    audience: Audience;
    contextHash: string;
  }): Promise<CachedCoachEntry | null>;
  /** Throws AiCacheDuplicateError on a concurrent insert of the same (learner_id, audience, context_hash) — the caller should re-`find` to get the winning row rather than treat this as a failure. */
  save(params: SaveCoachEntryParams): Promise<CachedCoachEntry>;
}

interface CoachingMessageRow {
  provider: string;
  model: string;
  headline: string;
  message: string;
  strengths: string[];
  focus_areas: string[];
  next_steps: string[];
  source: "ai" | "fallback";
}

const SELECT_COLUMNS =
  "provider,model,headline,message,strengths,focus_areas,next_steps,source";

function toEntry(row: CoachingMessageRow): CachedCoachEntry {
  return {
    provider: row.provider,
    model: row.model,
    headline: row.headline,
    message: row.message,
    strengths: row.strengths,
    focusAreas: row.focus_areas,
    nextSteps: row.next_steps,
    source: row.source,
  };
}

export class SupabaseAiCacheRepository implements AiCacheRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async find(params: {
    learnerId: string;
    audience: Audience;
    contextHash: string;
  }): Promise<CachedCoachEntry | null> {
    const { data, error } = await this.supabase
      .from("ai_coaching_messages")
      .select(SELECT_COLUMNS)
      .eq("learner_id", params.learnerId)
      .eq("audience", params.audience)
      .eq("context_hash", params.contextHash)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (error) {
      throw new AiCacheRepositoryError(
        `Unable to look up cached coaching message: ${error.message}`,
      );
    }

    return data ? toEntry(data as CoachingMessageRow) : null;
  }

  async save(params: SaveCoachEntryParams): Promise<CachedCoachEntry> {
    const { data, error } = await this.supabase
      .from("ai_coaching_messages")
      .insert({
        learner_id: params.learnerId,
        audience: params.audience,
        context_hash: params.contextHash,
        schema_version: params.schemaVersion,
        prompt_version: params.promptVersion,
        provider: params.provider,
        model: params.model,
        headline: params.content.headline,
        message: params.content.message,
        strengths: params.content.strengths,
        focus_areas: params.content.focusAreas,
        next_steps: params.content.nextSteps,
        source: params.content.source,
        expires_at: params.expiresAt,
      })
      .select(SELECT_COLUMNS)
      .single();

    if (error) {
      if (error.code === "23505") {
        throw new AiCacheDuplicateError(
          "A coaching message for this exact learning snapshot was already cached",
        );
      }
      throw new AiCacheRepositoryError(
        `Unable to save coaching message: ${error.message}`,
      );
    }

    return toEntry(data as CoachingMessageRow);
  }
}
