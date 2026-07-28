import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ExplainerAudience,
  QuestionExplanationResponse,
} from "./explainer.types";

export class ExplanationCacheRepositoryError extends Error {}
/** Thrown on a unique-constraint conflict (learner_id, audience, context_hash) — a concurrent request already cached this exact context. */
export class ExplanationCacheDuplicateError extends ExplanationCacheRepositoryError {}

/**
 * Only ever the validated response JSON plus enough metadata to reason
 * about it operationally — never a prompt, never raw provider output. See
 * question-explainer.service.ts: only a successful, validated, grounded AI
 * response is ever saved here; the deterministic fallback is cheap enough
 * to recompute every time instead (mirrors ai/cache/ai-cache.repository.ts).
 */
export interface CachedExplanationEntry {
  response: QuestionExplanationResponse;
  provider: string;
  model: string;
}

export interface SaveExplanationParams {
  learnerId: string;
  attemptId: string;
  audience: ExplainerAudience;
  contextHash: string;
  promptVersion: string;
  schemaVersion: string;
  provider: string;
  model: string;
  response: QuestionExplanationResponse;
  expiresAt: string;
}

export interface ExplanationCacheRepository {
  /** Null on a miss — expired rows are treated as a miss, not returned. The repository only looks things up and persists them; it never validates, grounds, generates, or authorises (TDS-007 Stage 3's repository-responsibilities list). */
  find(params: {
    learnerId: string;
    audience: ExplainerAudience;
    contextHash: string;
  }): Promise<CachedExplanationEntry | null>;
  /** Throws ExplanationCacheDuplicateError on a concurrent insert of the same (learner_id, audience, context_hash) — the caller should re-`find` to get the winning row rather than treat this as a failure. */
  save(params: SaveExplanationParams): Promise<CachedExplanationEntry>;
}

interface QuestionExplanationRow {
  response_json: QuestionExplanationResponse;
  provider: string;
  model: string;
}

const SELECT_COLUMNS = "response_json,provider,model";

function toEntry(row: QuestionExplanationRow): CachedExplanationEntry {
  return {
    response: row.response_json,
    provider: row.provider,
    model: row.model,
  };
}

export class SupabaseExplanationCacheRepository implements ExplanationCacheRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async find(params: {
    learnerId: string;
    audience: ExplainerAudience;
    contextHash: string;
  }): Promise<CachedExplanationEntry | null> {
    const { data, error } = await this.supabase
      .from("question_explanations")
      .select(SELECT_COLUMNS)
      .eq("learner_id", params.learnerId)
      .eq("audience", params.audience)
      .eq("context_hash", params.contextHash)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (error) {
      throw new ExplanationCacheRepositoryError(
        `Unable to look up cached explanation: ${error.message}`,
      );
    }

    return data ? toEntry(data as unknown as QuestionExplanationRow) : null;
  }

  async save(params: SaveExplanationParams): Promise<CachedExplanationEntry> {
    const { data, error } = await this.supabase
      .from("question_explanations")
      .insert({
        learner_id: params.learnerId,
        attempt_id: params.attemptId,
        audience: params.audience,
        context_hash: params.contextHash,
        prompt_version: params.promptVersion,
        schema_version: params.schemaVersion,
        response_json: params.response,
        response_source: "ai",
        provider: params.provider,
        model: params.model,
        expires_at: params.expiresAt,
      })
      .select(SELECT_COLUMNS)
      .single();

    if (error) {
      if (error.code === "23505") {
        throw new ExplanationCacheDuplicateError(
          "An explanation for this exact attempt/audience/context was already cached",
        );
      }
      throw new ExplanationCacheRepositoryError(
        `Unable to save explanation: ${error.message}`,
      );
    }

    return toEntry(data as unknown as QuestionExplanationRow);
  }
}
