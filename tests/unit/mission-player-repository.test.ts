import { describe, expect, it, vi } from "vitest";
import { MissionAccessError } from "@/modules/missions/mission.repository";
import { SupabaseMissionPlayerRepository } from "@/modules/missions/mission-player.repository";

function authenticatedAs(userId: string) {
  return {
    getUser: vi.fn(async () => ({
      data: { user: { id: userId } },
      error: null,
    })),
  };
}

describe("SupabaseMissionPlayerRepository.assertLearnerOwned", () => {
  it("rejects when the learner does not belong to the authenticated parent", async () => {
    const supabase = {
      auth: authenticatedAs("parent-1"),
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

    const repository = new SupabaseMissionPlayerRepository(supabase as never);

    await expect(repository.assertLearnerOwned("learner-1")).rejects.toThrow(
      MissionAccessError,
    );
  });
});

describe("SupabaseMissionPlayerRepository.getMissionRecord", () => {
  it("scopes the lookup to both mission id and learner id", async () => {
    const eqLearner = vi.fn(() => ({
      maybeSingle: vi.fn(async () => ({
        data: {
          id: "mission-1",
          learner_id: "learner-1",
          mission_date: "2026-07-20",
          status: "ready",
          estimated_minutes: 20,
          completed_at: null,
        },
        error: null,
      })),
    }));
    const eqMission = vi.fn(() => ({ eq: eqLearner }));
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({ eq: eqMission })),
      })),
    };

    const repository = new SupabaseMissionPlayerRepository(supabase as never);
    const mission = await repository.getMissionRecord("mission-1", "learner-1");

    expect(eqMission).toHaveBeenCalledWith("id", "mission-1");
    expect(eqLearner).toHaveBeenCalledWith("learner_id", "learner-1");
    expect(mission?.missionId).toBe("mission-1");
  });
});

describe("SupabaseMissionPlayerRepository.upsertAttempt", () => {
  it("upserts on mission_item_id so a repeated answer updates the same row", async () => {
    const single = vi.fn(async () => ({
      data: { id: "attempt-1", answered_at: "2026-07-21T00:00:00.000Z" },
      error: null,
    }));
    const select = vi.fn(() => ({ single }));
    const upsert = vi.fn(() => ({ select }));
    const supabase = {
      from: vi.fn(() => ({ upsert })),
    };

    const repository = new SupabaseMissionPlayerRepository(supabase as never);
    const result = await repository.upsertAttempt({
      missionItemId: "item-1",
      questionId: "question-1",
      optionId: "option-1",
      isCorrect: true,
      responseMs: 1200,
    });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        mission_item_id: "item-1",
        selected_option_id: "option-1",
      }),
      { onConflict: "mission_item_id" },
    );
    expect(result).toEqual({
      attemptId: "attempt-1",
      answeredAt: "2026-07-21T00:00:00.000Z",
    });
  });
});

describe("SupabaseMissionPlayerRepository.getMissionItems", () => {
  // Regression coverage for a production bug where an attempt that
  // genuinely existed (verified directly against the database) never
  // showed up in the app: embedding question_attempts inside the
  // mission_items select relies on PostgREST resolving the RLS policy
  // through a generated LATERAL join, which silently returned an empty
  // embed even though the same policy, evaluated as a flat SQL join,
  // correctly granted access. Fetching attempts as a separate query
  // sidesteps that and must not regress back to an embedded select.
  it("fetches question_attempts as a separate query, not embedded in the mission_items select", async () => {
    const missionItemsSelect = vi.fn<(query: string) => unknown>(() => ({
      eq: vi.fn(() => ({
        order: vi.fn(async () => ({
          data: [
            {
              id: "item-1",
              position: 1,
              question_bank: {
                id: "question-1",
                prompt: "Prompt 1",
                explanation: "Explanation 1",
                subjects: { name: "Mathematics", slug: "mathematics" },
                topics: null,
                question_options: [
                  { id: "opt-1a", label: "A", is_correct: true, sort_order: 1 },
                  {
                    id: "opt-1b",
                    label: "B",
                    is_correct: false,
                    sort_order: 2,
                  },
                ],
              },
            },
            {
              id: "item-2",
              position: 2,
              question_bank: {
                id: "question-2",
                prompt: "Prompt 2",
                explanation: "Explanation 2",
                subjects: { name: "Mathematics", slug: "mathematics" },
                topics: null,
                question_options: [
                  { id: "opt-2a", label: "A", is_correct: true, sort_order: 1 },
                ],
              },
            },
          ],
          error: null,
        })),
      })),
    }));

    const attemptsIn = vi.fn(async () => ({
      data: [
        {
          mission_item_id: "item-1",
          selected_option_id: "opt-1a",
          is_correct: true,
          response_ms: 1000,
        },
      ],
      error: null,
    }));
    const attemptsSelect = vi.fn(() => ({ in: attemptsIn }));

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "mission_items") {
          return { select: missionItemsSelect };
        }
        if (table === "question_attempts") {
          return { select: attemptsSelect };
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
    };

    const repository = new SupabaseMissionPlayerRepository(supabase as never);
    const items = await repository.getMissionItems("mission-1");

    // The mission_items select must not ask PostgREST to embed
    // question_attempts — that's the exact shape that broke under RLS.
    expect(missionItemsSelect.mock.calls[0]?.[0]).not.toContain(
      "question_attempts",
    );

    expect(attemptsSelect).toHaveBeenCalled();
    expect(attemptsIn).toHaveBeenCalledWith("mission_item_id", [
      "item-1",
      "item-2",
    ]);

    expect(items[0].attempt).toEqual({
      selectedOptionId: "opt-1a",
      isCorrect: true,
      responseMs: 1000,
    });
    expect(items[1].attempt).toBeNull();
  });

  it("skips the attempts query when there are no mission items", async () => {
    const missionItemsSelect = vi.fn(() => ({
      eq: vi.fn(() => ({
        order: vi.fn(async () => ({ data: [], error: null })),
      })),
    }));
    const from = vi.fn((table: string) => {
      if (table === "mission_items") {
        return { select: missionItemsSelect };
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    const repository = new SupabaseMissionPlayerRepository({
      from,
    } as never);

    const items = await repository.getMissionItems("mission-1");

    expect(items).toEqual([]);
    expect(from).not.toHaveBeenCalledWith("question_attempts");
  });
});

describe("SupabaseMissionPlayerRepository.countAttempts", () => {
  it("counts answered and correct attempts through mission_items", async () => {
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "mission_items") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                data: [{ id: "item-1" }, { id: "item-2" }, { id: "item-3" }],
                error: null,
              })),
            })),
          };
        }
        if (table === "question_attempts") {
          return {
            select: vi.fn(() => ({
              in: vi.fn(() => ({
                data: [
                  { mission_item_id: "item-1", is_correct: true },
                  { mission_item_id: "item-2", is_correct: false },
                ],
                error: null,
              })),
            })),
          };
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
    };

    const repository = new SupabaseMissionPlayerRepository(supabase as never);
    const counts = await repository.countAttempts("mission-1");

    expect(counts).toEqual({
      answeredCount: 2,
      correctCount: 1,
      totalQuestions: 3,
    });
  });
});
