import { describe, expect, it, vi } from "vitest";
import {
  AiCacheDuplicateError,
  AiCacheRepositoryError,
  SupabaseAiCacheRepository,
} from "@/modules/ai/cache/ai-cache.repository";

const row = {
  provider: "gemini",
  model: "gemini-2.5-flash",
  headline: "Great progress!",
  message: "You're doing well.",
  strengths: ["Vocabulary"],
  focus_areas: ["Fractions"],
  next_steps: ["Practise Fractions tomorrow."],
  source: "ai" as const,
};

describe("SupabaseAiCacheRepository.find", () => {
  it("returns null on a miss", async () => {
    const gt = vi.fn(() => ({
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    }));
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({ eq: vi.fn(() => ({ gt })) })),
          })),
        })),
      })),
    };

    const repository = new SupabaseAiCacheRepository(supabase as never);
    const result = await repository.find({
      learnerId: "learner-1",
      audience: "parent",
      contextHash: "hash-1",
    });

    expect(result).toBeNull();
  });

  it("maps a hit into a CachedCoachEntry, filtering by expires_at server-side", async () => {
    const gt = vi.fn(() => ({
      maybeSingle: vi.fn(async () => ({ data: row, error: null })),
    }));
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({ eq: vi.fn(() => ({ gt })) })),
          })),
        })),
      })),
    };

    const repository = new SupabaseAiCacheRepository(supabase as never);
    const result = await repository.find({
      learnerId: "learner-1",
      audience: "parent",
      contextHash: "hash-1",
    });

    expect(result).toEqual({
      provider: "gemini",
      model: "gemini-2.5-flash",
      headline: "Great progress!",
      message: "You're doing well.",
      strengths: ["Vocabulary"],
      focusAreas: ["Fractions"],
      nextSteps: ["Practise Fractions tomorrow."],
      source: "ai",
    });
    expect(gt).toHaveBeenCalledWith("expires_at", expect.any(String));
  });

  it("throws AiCacheRepositoryError on a query error", async () => {
    const gt = vi.fn(() => ({
      maybeSingle: vi.fn(async () => ({
        data: null,
        error: { message: "boom" },
      })),
    }));
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({ eq: vi.fn(() => ({ gt })) })),
          })),
        })),
      })),
    };

    const repository = new SupabaseAiCacheRepository(supabase as never);
    await expect(
      repository.find({
        learnerId: "learner-1",
        audience: "parent",
        contextHash: "hash-1",
      }),
    ).rejects.toThrow(AiCacheRepositoryError);
  });
});

describe("SupabaseAiCacheRepository.save", () => {
  const saveParams = {
    learnerId: "learner-1",
    audience: "parent" as const,
    contextHash: "hash-1",
    schemaVersion: "1.0",
    promptVersion: "coach-v1",
    provider: "gemini",
    model: "gemini-2.5-flash",
    content: {
      headline: "Great progress!",
      message: "You're doing well.",
      strengths: ["Vocabulary"],
      focusAreas: ["Fractions"],
      nextSteps: ["Practise Fractions tomorrow."],
      source: "ai" as const,
    },
    expiresAt: "2026-07-25T00:00:00.000Z",
  };

  it("inserts and returns the saved entry", async () => {
    const single = vi.fn(async () => ({ data: row, error: null }));
    const insert = vi.fn(() => ({ select: vi.fn(() => ({ single })) }));
    const supabase = { from: vi.fn(() => ({ insert })) };

    const repository = new SupabaseAiCacheRepository(supabase as never);
    const result = await repository.save(saveParams);

    expect(result.source).toBe("ai");
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        learner_id: "learner-1",
        audience: "parent",
        context_hash: "hash-1",
        focus_areas: ["Fractions"],
        next_steps: ["Practise Fractions tomorrow."],
      }),
    );
  });

  it("throws AiCacheDuplicateError on a unique-constraint conflict (23505)", async () => {
    const single = vi.fn(async () => ({
      data: null,
      error: { code: "23505", message: "duplicate" },
    }));
    const insert = vi.fn(() => ({ select: vi.fn(() => ({ single })) }));
    const supabase = { from: vi.fn(() => ({ insert })) };

    const repository = new SupabaseAiCacheRepository(supabase as never);
    await expect(repository.save(saveParams)).rejects.toThrow(
      AiCacheDuplicateError,
    );
  });

  it("throws AiCacheRepositoryError on any other database error", async () => {
    const single = vi.fn(async () => ({
      data: null,
      error: { code: "23503", message: "fk violation" },
    }));
    const insert = vi.fn(() => ({ select: vi.fn(() => ({ single })) }));
    const supabase = { from: vi.fn(() => ({ insert })) };

    const repository = new SupabaseAiCacheRepository(supabase as never);
    await expect(repository.save(saveParams)).rejects.toThrow(
      AiCacheRepositoryError,
    );
  });
});
