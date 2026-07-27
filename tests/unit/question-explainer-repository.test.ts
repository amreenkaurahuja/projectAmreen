import { describe, expect, it, vi } from "vitest";
import {
  ExplainerAccessError,
  ExplainerRepositoryError,
  SupabaseQuestionExplainerRepository,
} from "@/modules/question-explainer/explainer.repository";

const FULL_ATTEMPT_ROW = {
  id: "attempt-1",
  is_correct: false,
  question_id: "question-1",
  selected_option_id: "option-wrong",
  mission_items: {
    missions: { learner_id: "learner-1" },
    question_bank: {
      id: "question-1",
      prompt: "What is 75% of 80?",
      explanation: "75% is three quarters.",
      difficulty: 3,
      skill_id: "skill-1",
      subjects: { name: "Mathematics" },
      skills: { name: "Percentages" },
      question_options: [
        { id: "option-wrong", label: "54", is_correct: false },
        { id: "option-right", label: "60", is_correct: true },
      ],
    },
  },
};

function buildSupabase(overrides: {
  authUser?: { id: string } | null;
  authError?: unknown;
  ownershipRow?: unknown;
  ownershipError?: unknown;
  displayNameRow?: unknown;
  displayNameError?: unknown;
  attemptRow?: unknown;
  attemptError?: unknown;
}) {
  return {
    auth: {
      getUser: vi.fn(async () => ({
        data: {
          user:
            overrides.authUser === undefined
              ? { id: "parent-1" }
              : overrides.authUser,
        },
        error: overrides.authError ?? null,
      })),
    },
    from: vi.fn((table: string) => {
      if (table === "learners") {
        return {
          select: vi.fn((columns: string) => {
            if (columns === "id") {
              return {
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    maybeSingle: vi.fn(async () => ({
                      data:
                        overrides.ownershipRow === undefined
                          ? { id: "learner-1" }
                          : overrides.ownershipRow,
                      error: overrides.ownershipError ?? null,
                    })),
                  })),
                })),
              };
            }
            return {
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data:
                    overrides.displayNameRow === undefined
                      ? { display_name: "Amelia" }
                      : overrides.displayNameRow,
                  error: overrides.displayNameError ?? null,
                })),
              })),
            };
          }),
        };
      }
      if (table === "question_attempts") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data:
                  overrides.attemptRow === undefined
                    ? FULL_ATTEMPT_ROW
                    : overrides.attemptRow,
                error: overrides.attemptError ?? null,
              })),
            })),
          })),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
  };
}

describe("SupabaseQuestionExplainerRepository.assertLearnerOwned", () => {
  it("resolves when the learner is owned by the current user", async () => {
    const repository = new SupabaseQuestionExplainerRepository(
      buildSupabase({}) as never,
    );
    await expect(
      repository.assertLearnerOwned("learner-1"),
    ).resolves.toBeUndefined();
  });

  it("throws ExplainerAccessError when the learner isn't owned", async () => {
    const repository = new SupabaseQuestionExplainerRepository(
      buildSupabase({ ownershipRow: null }) as never,
    );
    await expect(repository.assertLearnerOwned("learner-1")).rejects.toThrow(
      ExplainerAccessError,
    );
  });

  it("throws ExplainerAccessError when there is no authenticated user", async () => {
    const repository = new SupabaseQuestionExplainerRepository(
      buildSupabase({ authUser: null }) as never,
    );
    await expect(repository.assertLearnerOwned("learner-1")).rejects.toThrow(
      ExplainerAccessError,
    );
  });

  it("throws ExplainerRepositoryError on a database error", async () => {
    const repository = new SupabaseQuestionExplainerRepository(
      buildSupabase({ ownershipError: { message: "boom" } }) as never,
    );
    await expect(repository.assertLearnerOwned("learner-1")).rejects.toThrow(
      ExplainerRepositoryError,
    );
  });
});

describe("SupabaseQuestionExplainerRepository.getLearnerDisplayName", () => {
  it("returns the display name", async () => {
    const repository = new SupabaseQuestionExplainerRepository(
      buildSupabase({}) as never,
    );
    expect(await repository.getLearnerDisplayName("learner-1")).toBe("Amelia");
  });

  it("returns null when the learner row is missing", async () => {
    const repository = new SupabaseQuestionExplainerRepository(
      buildSupabase({ displayNameRow: null }) as never,
    );
    expect(await repository.getLearnerDisplayName("learner-1")).toBeNull();
  });
});

describe("SupabaseQuestionExplainerRepository.getExplanationSource", () => {
  it("maps a full attempt row into ExplanationSourceData, matching the selected and correct option labels", async () => {
    const repository = new SupabaseQuestionExplainerRepository(
      buildSupabase({}) as never,
    );

    const source = await repository.getExplanationSource({
      learnerId: "learner-1",
      attemptId: "attempt-1",
    });

    expect(source).toEqual({
      attemptId: "attempt-1",
      isCorrect: false,
      questionId: "question-1",
      skillId: "skill-1",
      skillName: "Percentages",
      subjectName: "Mathematics",
      difficulty: 3,
      prompt: "What is 75% of 80?",
      learnerAnswerLabel: "54",
      correctAnswerLabel: "60",
      authoredExplanation: "75% is three quarters.",
    });
  });

  it("returns null when no attempt row is found", async () => {
    const repository = new SupabaseQuestionExplainerRepository(
      buildSupabase({ attemptRow: null }) as never,
    );
    expect(
      await repository.getExplanationSource({
        learnerId: "learner-1",
        attemptId: "attempt-1",
      }),
    ).toBeNull();
  });

  it("returns null when the attempt belongs to a different learner, without leaking its existence", async () => {
    const repository = new SupabaseQuestionExplainerRepository(
      buildSupabase({
        attemptRow: {
          ...FULL_ATTEMPT_ROW,
          mission_items: {
            ...FULL_ATTEMPT_ROW.mission_items,
            missions: { learner_id: "someone-elses-learner" },
          },
        },
      }) as never,
    );
    expect(
      await repository.getExplanationSource({
        learnerId: "learner-1",
        attemptId: "attempt-1",
      }),
    ).toBeNull();
  });

  it("throws ExplainerRepositoryError on a database error", async () => {
    const repository = new SupabaseQuestionExplainerRepository(
      buildSupabase({ attemptError: { message: "boom" } }) as never,
    );
    await expect(
      repository.getExplanationSource({
        learnerId: "learner-1",
        attemptId: "attempt-1",
      }),
    ).rejects.toThrow(ExplainerRepositoryError);
  });
});
