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
    const upsert = vi.fn(async () => ({ error: null }));
    const supabase = {
      from: vi.fn(() => ({ upsert })),
    };

    const repository = new SupabaseMissionPlayerRepository(supabase as never);
    await repository.upsertAttempt({
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
