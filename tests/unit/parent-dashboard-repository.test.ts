import { describe, expect, it, vi } from "vitest";
import {
  ParentDashboardAccessError,
  ParentDashboardRepositoryError,
  SupabaseParentDashboardRepository,
} from "@/modules/parent-dashboard/dashboard.repository";

function authenticatedSupabase(userId = "parent-1") {
  return {
    getUser: vi.fn(async () => ({
      data: { user: { id: userId } },
      error: null,
    })),
  };
}

describe("SupabaseParentDashboardRepository.assertLearnerOwned", () => {
  it("rejects when the learner does not belong to the authenticated parent", async () => {
    const supabase = {
      auth: authenticatedSupabase(),
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

    const repository = new SupabaseParentDashboardRepository(supabase as never);

    await expect(repository.assertLearnerOwned("learner-1")).rejects.toThrow(
      ParentDashboardAccessError,
    );
  });

  it("resolves when the learner belongs to the authenticated parent", async () => {
    const supabase = {
      auth: authenticatedSupabase(),
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: { id: "learner-1" },
                error: null,
              })),
            })),
          })),
        })),
      })),
    };

    const repository = new SupabaseParentDashboardRepository(supabase as never);
    await expect(
      repository.assertLearnerOwned("learner-1"),
    ).resolves.toBeUndefined();
  });
});

describe("SupabaseParentDashboardRepository.getCompletedMissionDates", () => {
  it("returns only the mission_date column, mapped to strings", async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(async () => ({
              data: [
                { mission_date: "2026-07-20" },
                { mission_date: "2026-07-21" },
              ],
              error: null,
            })),
          })),
        })),
      })),
    };

    const repository = new SupabaseParentDashboardRepository(supabase as never);
    const dates = await repository.getCompletedMissionDates("learner-1");
    expect(dates).toEqual(["2026-07-20", "2026-07-21"]);
  });

  it("throws ParentDashboardRepositoryError on a query failure", async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(async () => ({ data: null, error: { message: "boom" } })),
          })),
        })),
      })),
    };

    const repository = new SupabaseParentDashboardRepository(supabase as never);
    await expect(
      repository.getCompletedMissionDates("learner-1"),
    ).rejects.toThrow(ParentDashboardRepositoryError);
  });
});

describe("SupabaseParentDashboardRepository.getRecentMissionData", () => {
  it("returns an empty result when the learner has no missions", async () => {
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "missions") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => ({
                  limit: vi.fn(async () => ({ data: [], error: null })),
                })),
              })),
            })),
          };
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
    };

    const repository = new SupabaseParentDashboardRepository(supabase as never);
    const result = await repository.getRecentMissionData("learner-1");
    expect(result.missions).toEqual([]);
    expect(result.attemptsByMission.size).toBe(0);
  });

  it("aggregates question counts and attempts per mission", async () => {
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "missions") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => ({
                  limit: vi.fn(async () => ({
                    data: [
                      {
                        id: "mission-1",
                        mission_date: "2026-07-21",
                        status: "completed",
                        completed_at: "2026-07-21T12:00:00.000Z",
                      },
                    ],
                    error: null,
                  })),
                })),
              })),
            })),
          };
        }
        if (table === "mission_items") {
          return {
            select: vi.fn(() => ({
              in: vi.fn(async () => ({
                data: [
                  { id: "item-1", mission_id: "mission-1" },
                  { id: "item-2", mission_id: "mission-1" },
                ],
                error: null,
              })),
            })),
          };
        }
        if (table === "question_attempts") {
          return {
            select: vi.fn(() => ({
              in: vi.fn(async () => ({
                data: [
                  {
                    is_correct: true,
                    response_ms: 1000,
                    question_bank: { difficulty: 2 },
                    mission_items: { mission_id: "mission-1" },
                  },
                  {
                    is_correct: false,
                    response_ms: 2000,
                    question_bank: { difficulty: 3 },
                    mission_items: { mission_id: "mission-1" },
                  },
                ],
                error: null,
              })),
            })),
          };
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
    };

    const repository = new SupabaseParentDashboardRepository(supabase as never);
    const result = await repository.getRecentMissionData("learner-1");

    expect(result.missions).toHaveLength(1);
    expect(result.missions[0]).toEqual({
      missionId: "mission-1",
      missionDate: "2026-07-21",
      status: "completed",
      completedAt: "2026-07-21T12:00:00.000Z",
      questionCount: 2,
    });

    const attempts = result.attemptsByMission.get("mission-1");
    expect(attempts).toHaveLength(2);
    expect(attempts).toEqual([
      { isCorrect: true, difficulty: 2, responseMs: 1000 },
      { isCorrect: false, difficulty: 3, responseMs: 2000 },
    ]);
  });
});

describe("SupabaseParentDashboardRepository.getSkillNames", () => {
  it("returns an empty map without querying when given no skill ids", async () => {
    const from = vi.fn();
    const supabase = { from };
    const repository = new SupabaseParentDashboardRepository(supabase as never);

    const names = await repository.getSkillNames([]);
    expect(names.size).toBe(0);
    expect(from).not.toHaveBeenCalled();
  });

  it("maps skill ids to names", async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          in: vi.fn(async () => ({
            data: [
              { id: "skill-1", name: "Fractions" },
              { id: "skill-2", name: "Inference" },
            ],
            error: null,
          })),
        })),
      })),
    };

    const repository = new SupabaseParentDashboardRepository(supabase as never);
    const names = await repository.getSkillNames(["skill-1", "skill-2"]);

    expect(names.get("skill-1")).toBe("Fractions");
    expect(names.get("skill-2")).toBe("Inference");
  });
});
