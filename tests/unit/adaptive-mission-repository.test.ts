import { describe, expect, it, vi } from "vitest";
import {
  AdaptiveDataRepositoryError,
  SupabaseAdaptiveDataRepository,
} from "@/modules/adaptive-learning/adaptive-mission.repository";

describe("SupabaseAdaptiveDataRepository.loadCandidateData", () => {
  function buildSupabase(overrides: {
    questionRows?: unknown[];
    questionError?: unknown;
    masteryRows?: unknown[];
    attemptRows?: unknown[];
    subjectRows?: unknown[];
  }) {
    return {
      from: vi.fn((table: string) => {
        if (table === "question_bank") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(async () => ({
                data: overrides.questionRows ?? [],
                error: overrides.questionError ?? null,
              })),
            })),
          };
        }
        if (table === "learner_skill_mastery") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(async () => ({
                data: overrides.masteryRows ?? [],
                error: null,
              })),
            })),
          };
        }
        if (table === "question_attempts") {
          return {
            select: vi.fn(() => ({
              gte: vi.fn(() => ({
                eq: vi.fn(async () => ({
                  data: overrides.attemptRows ?? [],
                  error: null,
                })),
              })),
            })),
          };
        }
        if (table === "subjects") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(async () => ({
                  data: overrides.subjectRows ?? [],
                  error: null,
                })),
              })),
            })),
          };
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
    };
  }

  it("loads and normalises candidates, mastery, recent attempts and subjects", async () => {
    const supabase = buildSupabase({
      questionRows: [
        {
          id: "q1",
          subject_id: "subject-1",
          topic_id: "topic-1",
          skill_id: "skill-1",
          difficulty: 3,
          subjects: { slug: "mathematics" },
        },
      ],
      masteryRows: [
        {
          skill_id: "skill-1",
          subject_id: "subject-1",
          mastery_score: 40,
          total_attempts: 5,
          next_review_at: null,
        },
      ],
      attemptRows: [
        { question_id: "q1", answered_at: "2026-07-15T00:00:00.000Z" },
      ],
      subjectRows: [{ slug: "mathematics" }, { slug: "english" }],
    });

    const repository = new SupabaseAdaptiveDataRepository(supabase as never);
    const data = await repository.loadCandidateData(
      "learner-1",
      "2026-07-14T00:00:00.000Z",
    );

    expect(data.candidates).toEqual([
      {
        questionId: "q1",
        subjectId: "subject-1",
        subjectSlug: "mathematics",
        topicId: "topic-1",
        skillId: "skill-1",
        difficulty: 3,
      },
    ]);
    expect(data.masteryBySkill.get("skill-1")?.masteryScore).toBe(40);
    expect(data.recentAttemptsByQuestion.get("q1")).toBe(
      "2026-07-15T00:00:00.000Z",
    );
    expect(data.activeSubjectSlugs).toEqual(["mathematics", "english"]);
  });

  it("throws AdaptiveDataRepositoryError when the question query fails", async () => {
    const supabase = buildSupabase({ questionError: { message: "boom" } });
    const repository = new SupabaseAdaptiveDataRepository(supabase as never);

    await expect(
      repository.loadCandidateData("learner-1", "2026-07-14T00:00:00.000Z"),
    ).rejects.toThrow(AdaptiveDataRepositoryError);
  });
});
