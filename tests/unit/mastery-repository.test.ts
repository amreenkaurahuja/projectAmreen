import { describe, expect, it, vi } from "vitest";
import { createInitialMasteryState } from "@/modules/learning-profile/mastery-calculator";
import {
  MasteryAccessError,
  MasteryConcurrencyConflictError,
  MasteryRepositoryError,
  SupabaseMasteryRepository,
} from "@/modules/learning-profile/mastery.repository";

describe("SupabaseMasteryRepository.getQuestionCurriculumMetadata", () => {
  it("uses question_bank.skill_id directly when it is set", async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({
              data: {
                subject_id: "subject-1",
                topic_id: "topic-1",
                skill_id: "skill-1",
                difficulty: 4,
              },
              error: null,
            })),
          })),
        })),
      })),
    };

    const repository = new SupabaseMasteryRepository(supabase as never);
    const metadata =
      await repository.getQuestionCurriculumMetadata("question-1");

    expect(metadata).toEqual({
      skillId: "skill-1",
      subjectId: "subject-1",
      topicId: "topic-1",
      difficulty: 4,
    });
  });

  it("falls back to the topic's sole active skill when skill_id is null", async () => {
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "question_bank") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: {
                    subject_id: "subject-1",
                    topic_id: "topic-1",
                    skill_id: null,
                    difficulty: 2,
                  },
                  error: null,
                })),
              })),
            })),
          };
        }
        if (table === "skills") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(async () => ({
                  data: [{ id: "skill-fallback" }],
                  error: null,
                })),
              })),
            })),
          };
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
    };

    const repository = new SupabaseMasteryRepository(supabase as never);
    const metadata =
      await repository.getQuestionCurriculumMetadata("question-1");

    expect(metadata?.skillId).toBe("skill-fallback");
  });

  it("cannot resolve a skill when the topic has no active skills", async () => {
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "question_bank") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: {
                    subject_id: "subject-1",
                    topic_id: "topic-1",
                    skill_id: null,
                    difficulty: 2,
                  },
                  error: null,
                })),
              })),
            })),
          };
        }
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(async () => ({ data: [], error: null })),
            })),
          })),
        };
      }),
    };

    const repository = new SupabaseMasteryRepository(supabase as never);
    const metadata =
      await repository.getQuestionCurriculumMetadata("question-1");

    expect(metadata).toBeNull();
  });

  it("cannot resolve a skill when the topic has more than one active skill", async () => {
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "question_bank") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: {
                    subject_id: "subject-1",
                    topic_id: "topic-1",
                    skill_id: null,
                    difficulty: 2,
                  },
                  error: null,
                })),
              })),
            })),
          };
        }
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(async () => ({
                data: [{ id: "skill-a" }, { id: "skill-b" }],
                error: null,
              })),
            })),
          })),
        };
      }),
    };

    const repository = new SupabaseMasteryRepository(supabase as never);
    const metadata =
      await repository.getQuestionCurriculumMetadata("question-1");

    expect(metadata).toBeNull();
  });

  it("returns null when the question does not exist", async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: null, error: null })),
          })),
        })),
      })),
    };

    const repository = new SupabaseMasteryRepository(supabase as never);
    expect(
      await repository.getQuestionCurriculumMetadata("missing"),
    ).toBeNull();
  });

  it("cannot resolve a skill when the question has neither skill_id nor topic_id", async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({
              data: {
                subject_id: "subject-1",
                topic_id: null,
                skill_id: null,
                difficulty: 2,
              },
              error: null,
            })),
          })),
        })),
      })),
    };

    const repository = new SupabaseMasteryRepository(supabase as never);
    expect(
      await repository.getQuestionCurriculumMetadata("question-1"),
    ).toBeNull();
  });
});

describe("SupabaseMasteryRepository.claimAttemptForMastery", () => {
  it("returns true when the attempt was unclaimed and is now claimed", async () => {
    const supabase = {
      from: vi.fn(() => ({
        update: vi.fn(() => ({
          eq: vi.fn(() => ({
            is: vi.fn(() => ({
              select: vi.fn(async () => ({
                data: [{ id: "attempt-1" }],
                error: null,
              })),
            })),
          })),
        })),
      })),
    };

    const repository = new SupabaseMasteryRepository(supabase as never);
    expect(await repository.claimAttemptForMastery("attempt-1")).toBe(true);
  });

  it("returns false when the attempt was already claimed", async () => {
    const supabase = {
      from: vi.fn(() => ({
        update: vi.fn(() => ({
          eq: vi.fn(() => ({
            is: vi.fn(() => ({
              select: vi.fn(async () => ({ data: [], error: null })),
            })),
          })),
        })),
      })),
    };

    const repository = new SupabaseMasteryRepository(supabase as never);
    expect(await repository.claimAttemptForMastery("attempt-1")).toBe(false);
  });
});

describe("SupabaseMasteryRepository.insertMasteryRow / updateMasteryRow", () => {
  const state = createInitialMasteryState();

  it("throws MasteryConcurrencyConflictError on a unique-constraint race during insert", async () => {
    const supabase = {
      from: vi.fn(() => ({
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(async () => ({
              data: null,
              error: { code: "23505", message: "duplicate" },
            })),
          })),
        })),
      })),
    };

    const repository = new SupabaseMasteryRepository(supabase as never);

    await expect(
      repository.insertMasteryRow({
        learnerId: "learner-1",
        skillId: "skill-1",
        subjectId: "subject-1",
        topicId: null,
        state,
      }),
    ).rejects.toThrow(MasteryConcurrencyConflictError);
  });

  it("throws a generic repository error on a non-conflict insert failure", async () => {
    const supabase = {
      from: vi.fn(() => ({
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(async () => ({
              data: null,
              error: { code: "23000", message: "boom" },
            })),
          })),
        })),
      })),
    };

    const repository = new SupabaseMasteryRepository(supabase as never);

    await expect(
      repository.insertMasteryRow({
        learnerId: "learner-1",
        skillId: "skill-1",
        subjectId: "subject-1",
        topicId: null,
        state,
      }),
    ).rejects.toThrow(MasteryRepositoryError);
  });

  it("throws MasteryConcurrencyConflictError when the optimistic update check fails", async () => {
    const supabase = {
      from: vi.fn(() => ({
        update: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              select: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: null, error: null })),
              })),
            })),
          })),
        })),
      })),
    };

    const repository = new SupabaseMasteryRepository(supabase as never);

    await expect(
      repository.updateMasteryRow({
        id: "mastery-1",
        expectedUpdatedAt: "2026-07-21T00:00:00.000Z",
        state,
      }),
    ).rejects.toThrow(MasteryConcurrencyConflictError);
  });
});

describe("SupabaseMasteryRepository.assertLearnerOwned", () => {
  it("rejects when the learner does not belong to the authenticated parent", async () => {
    const supabase = {
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: { id: "parent-1" } },
          error: null,
        })),
      },
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: null, error: null })),
            })),
          })),
        })),
      })),
    };

    const repository = new SupabaseMasteryRepository(supabase as never);

    await expect(repository.assertLearnerOwned("learner-1")).rejects.toThrow(
      MasteryAccessError,
    );
  });
});
