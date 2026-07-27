import { describe, expect, it, vi } from "vitest";
import {
  FollowUpQuestionSelector,
  FollowUpSelectorRepositoryError,
  pickClosestDifficultyCandidate,
  SupabaseFollowUpQuestionRepository,
  type FollowUpCandidate,
  type FollowUpQuestionRepository,
} from "@/modules/adaptive-learning/follow-up-selector";

const REF = new Date("2026-07-21T00:00:00.000Z");

describe("pickClosestDifficultyCandidate", () => {
  it("returns null for an empty candidate list", () => {
    expect(pickClosestDifficultyCandidate([], 3)).toBeNull();
  });

  it("picks the candidate closest to the target difficulty", () => {
    const candidates: FollowUpCandidate[] = [
      { questionId: "q-easy", difficulty: 1 },
      { questionId: "q-match", difficulty: 3 },
      { questionId: "q-hard", difficulty: 5 },
    ];
    expect(pickClosestDifficultyCandidate(candidates, 3)?.questionId).toBe(
      "q-match",
    );
  });

  it("prefers the easier candidate on a tied distance", () => {
    const candidates: FollowUpCandidate[] = [
      { questionId: "q-harder", difficulty: 4 },
      { questionId: "q-easier", difficulty: 2 },
    ];
    expect(pickClosestDifficultyCandidate(candidates, 3)?.questionId).toBe(
      "q-easier",
    );
  });

  it("is deterministic (lowest questionId) when difficulty and distance both tie", () => {
    const candidates: FollowUpCandidate[] = [
      { questionId: "q-b", difficulty: 3 },
      { questionId: "q-a", difficulty: 3 },
    ];
    expect(pickClosestDifficultyCandidate(candidates, 3)?.questionId).toBe(
      "q-a",
    );
  });
});

function buildRepository(
  overrides: Partial<FollowUpQuestionRepository> = {},
): FollowUpQuestionRepository {
  return {
    loadEligibleCandidates: vi.fn(async () => []),
    ...overrides,
  };
}

describe("FollowUpQuestionSelector.selectFollowUpQuestion", () => {
  it("returns null when the repository has no eligible candidates", async () => {
    const selector = new FollowUpQuestionSelector(buildRepository());
    const result = await selector.selectFollowUpQuestion({
      learnerId: "learner-1",
      skillId: "skill-1",
      excludeQuestionIds: ["question-1"],
      targetDifficulty: 2,
      referenceTimestamp: REF,
    });
    expect(result).toBeNull();
  });

  it("returns the closest-difficulty candidate the repository supplies", async () => {
    const repository = buildRepository({
      loadEligibleCandidates: vi.fn(async () => [
        { questionId: "question-2", difficulty: 1 },
        { questionId: "question-3", difficulty: 2 },
      ]),
    });
    const selector = new FollowUpQuestionSelector(repository);

    const result = await selector.selectFollowUpQuestion({
      learnerId: "learner-1",
      skillId: "skill-1",
      excludeQuestionIds: ["question-1"],
      targetDifficulty: 2,
      referenceTimestamp: REF,
    });

    expect(result).toEqual({ questionId: "question-3" });
  });

  it("passes skillId, excludeQuestionIds, learnerId and a cooldown-window start to the repository", async () => {
    const repository = buildRepository();
    const selector = new FollowUpQuestionSelector(repository);

    await selector.selectFollowUpQuestion({
      learnerId: "learner-1",
      skillId: "skill-1",
      excludeQuestionIds: ["question-1"],
      targetDifficulty: 2,
      referenceTimestamp: REF,
    });

    expect(repository.loadEligibleCandidates).toHaveBeenCalledWith({
      skillId: "skill-1",
      excludeQuestionIds: ["question-1"],
      learnerId: "learner-1",
      cooldownSinceIso: expect.any(String),
    });
    const call = (repository.loadEligibleCandidates as ReturnType<typeof vi.fn>)
      .mock.calls[0][0];
    expect(new Date(call.cooldownSinceIso).getTime()).toBeLessThan(
      REF.getTime(),
    );
  });
});

function buildSupabase(overrides: {
  questionRows?: unknown[];
  questionError?: unknown;
  recentRows?: unknown[];
  recentError?: unknown;
}) {
  const questionBankSelect = vi.fn(() => ({
    eq: vi.fn(() => ({
      eq: vi.fn(async () => ({
        data: overrides.questionRows ?? [],
        error: overrides.questionError ?? null,
      })),
    })),
  }));
  const attemptsSelect = vi.fn(() => ({
    gte: vi.fn(() => ({
      eq: vi.fn(() => ({
        in: vi.fn(async () => ({
          data: overrides.recentRows ?? [],
          error: overrides.recentError ?? null,
        })),
      })),
    })),
  }));

  return {
    from: vi.fn((table: string) => {
      if (table === "question_bank") return { select: questionBankSelect };
      if (table === "question_attempts") return { select: attemptsSelect };
      throw new Error(`Unexpected table: ${table}`);
    }),
    attemptsSelect,
  };
}

describe("SupabaseFollowUpQuestionRepository.loadEligibleCandidates", () => {
  it("excludes the given questionIds and anything answered inside the cooldown window", async () => {
    const supabase = buildSupabase({
      questionRows: [
        { id: "question-1", difficulty: 2 },
        { id: "question-2", difficulty: 3 },
        { id: "question-3", difficulty: 1 },
      ],
      recentRows: [{ question_id: "question-2" }],
    });
    const repository = new SupabaseFollowUpQuestionRepository(
      supabase as never,
    );

    const candidates = await repository.loadEligibleCandidates({
      skillId: "skill-1",
      excludeQuestionIds: ["question-1"],
      learnerId: "learner-1",
      cooldownSinceIso: "2026-07-14T00:00:00.000Z",
    });

    expect(candidates).toEqual([{ questionId: "question-3", difficulty: 1 }]);
  });

  it("skips the recent-attempts query entirely when every candidate is already excluded", async () => {
    const supabase = buildSupabase({
      questionRows: [{ id: "question-1", difficulty: 2 }],
    });
    const repository = new SupabaseFollowUpQuestionRepository(
      supabase as never,
    );

    const candidates = await repository.loadEligibleCandidates({
      skillId: "skill-1",
      excludeQuestionIds: ["question-1"],
      learnerId: "learner-1",
      cooldownSinceIso: "2026-07-14T00:00:00.000Z",
    });

    expect(candidates).toEqual([]);
    expect(supabase.attemptsSelect).not.toHaveBeenCalled();
  });

  it("defaults a null difficulty to 1", async () => {
    const supabase = buildSupabase({
      questionRows: [{ id: "question-1", difficulty: null }],
    });
    const repository = new SupabaseFollowUpQuestionRepository(
      supabase as never,
    );

    const candidates = await repository.loadEligibleCandidates({
      skillId: "skill-1",
      excludeQuestionIds: [],
      learnerId: "learner-1",
      cooldownSinceIso: "2026-07-14T00:00:00.000Z",
    });

    expect(candidates).toEqual([{ questionId: "question-1", difficulty: 1 }]);
  });

  it("throws FollowUpSelectorRepositoryError when the question_bank query fails", async () => {
    const supabase = buildSupabase({ questionError: { message: "boom" } });
    const repository = new SupabaseFollowUpQuestionRepository(
      supabase as never,
    );

    await expect(
      repository.loadEligibleCandidates({
        skillId: "skill-1",
        excludeQuestionIds: [],
        learnerId: "learner-1",
        cooldownSinceIso: "2026-07-14T00:00:00.000Z",
      }),
    ).rejects.toThrow(FollowUpSelectorRepositoryError);
  });

  it("throws FollowUpSelectorRepositoryError when the recent-attempts query fails", async () => {
    const supabase = buildSupabase({
      questionRows: [{ id: "question-1", difficulty: 2 }],
      recentError: { message: "boom" },
    });
    const repository = new SupabaseFollowUpQuestionRepository(
      supabase as never,
    );

    await expect(
      repository.loadEligibleCandidates({
        skillId: "skill-1",
        excludeQuestionIds: [],
        learnerId: "learner-1",
        cooldownSinceIso: "2026-07-14T00:00:00.000Z",
      }),
    ).rejects.toThrow(FollowUpSelectorRepositoryError);
  });
});
