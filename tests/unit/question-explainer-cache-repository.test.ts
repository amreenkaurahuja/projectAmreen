import { describe, expect, it, vi } from "vitest";
import {
  ExplanationCacheDuplicateError,
  ExplanationCacheRepositoryError,
  SupabaseExplanationCacheRepository,
} from "@/modules/question-explainer/explanation-cache.repository";
import type { QuestionExplanationResponse } from "@/modules/question-explainer/explainer.types";

const RESPONSE: QuestionExplanationResponse = {
  acknowledgement: "Good try!",
  mistakeExplanation: 'You chose "54". The correct answer is "60".',
  keyConcept: "75% means three quarters.",
  workedExample: {
    problem: "Find 75% of 40.",
    steps: ["40 divided by 4 is 10.", "10 times 3 is 30."],
    answer: "30",
  },
  nextAction: { type: "review-skill", text: "Review percentages again soon." },
};

function buildSupabase(overrides: {
  findRow?: unknown;
  findError?: unknown;
  saveRow?: unknown;
  saveError?: unknown;
}) {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              gt: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data:
                    overrides.findRow === undefined
                      ? {
                          response_json: RESPONSE,
                          provider: "gemini",
                          model: "gemini-2.5-flash",
                        }
                      : overrides.findRow,
                  error: overrides.findError ?? null,
                })),
              })),
            })),
          })),
        })),
      })),
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(async () => ({
            data:
              overrides.saveRow === undefined
                ? {
                    response_json: RESPONSE,
                    provider: "gemini",
                    model: "gemini-2.5-flash",
                  }
                : overrides.saveRow,
            error: overrides.saveError ?? null,
          })),
        })),
      })),
    })),
  };
}

describe("SupabaseExplanationCacheRepository.find", () => {
  it("returns a cached entry on a hit", async () => {
    const repository = new SupabaseExplanationCacheRepository(
      buildSupabase({}) as never,
    );

    const entry = await repository.find({
      learnerId: "learner-1",
      audience: "learner",
      contextHash: "hash-1",
    });

    expect(entry).toEqual({
      response: RESPONSE,
      provider: "gemini",
      model: "gemini-2.5-flash",
    });
  });

  it("returns null on a miss (including an expired row, filtered at the query level)", async () => {
    const repository = new SupabaseExplanationCacheRepository(
      buildSupabase({ findRow: null }) as never,
    );

    const entry = await repository.find({
      learnerId: "learner-1",
      audience: "learner",
      contextHash: "hash-1",
    });

    expect(entry).toBeNull();
  });

  it("throws ExplanationCacheRepositoryError on a database error", async () => {
    const repository = new SupabaseExplanationCacheRepository(
      buildSupabase({ findError: { message: "boom" } }) as never,
    );

    await expect(
      repository.find({
        learnerId: "learner-1",
        audience: "learner",
        contextHash: "hash-1",
      }),
    ).rejects.toThrow(ExplanationCacheRepositoryError);
  });
});

describe("SupabaseExplanationCacheRepository.save", () => {
  it("saves and returns the entry", async () => {
    const repository = new SupabaseExplanationCacheRepository(
      buildSupabase({}) as never,
    );

    const entry = await repository.save({
      learnerId: "learner-1",
      attemptId: "attempt-1",
      audience: "learner",
      contextHash: "hash-1",
      promptVersion: "v1",
      schemaVersion: "question-explanation-context-v2",
      provider: "gemini",
      model: "gemini-2.5-flash",
      response: RESPONSE,
      expiresAt: new Date().toISOString(),
    });

    expect(entry).toEqual({
      response: RESPONSE,
      provider: "gemini",
      model: "gemini-2.5-flash",
    });
  });

  it("throws ExplanationCacheDuplicateError on a unique-constraint conflict (23505)", async () => {
    const repository = new SupabaseExplanationCacheRepository(
      buildSupabase({
        saveError: { code: "23505", message: "conflict" },
      }) as never,
    );

    await expect(
      repository.save({
        learnerId: "learner-1",
        attemptId: "attempt-1",
        audience: "learner",
        contextHash: "hash-1",
        promptVersion: "v1",
        schemaVersion: "question-explanation-context-v2",
        provider: "gemini",
        model: "gemini-2.5-flash",
        response: RESPONSE,
        expiresAt: new Date().toISOString(),
      }),
    ).rejects.toThrow(ExplanationCacheDuplicateError);
  });

  it("throws ExplanationCacheRepositoryError on any other database error", async () => {
    const repository = new SupabaseExplanationCacheRepository(
      buildSupabase({
        saveError: { code: "23503", message: "fk violation" },
      }) as never,
    );

    await expect(
      repository.save({
        learnerId: "learner-1",
        attemptId: "attempt-1",
        audience: "learner",
        contextHash: "hash-1",
        promptVersion: "v1",
        schemaVersion: "question-explanation-context-v2",
        provider: "gemini",
        model: "gemini-2.5-flash",
        response: RESPONSE,
        expiresAt: new Date().toISOString(),
      }),
    ).rejects.toThrow(ExplanationCacheRepositoryError);
  });
});
