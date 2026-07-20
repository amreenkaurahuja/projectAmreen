import { describe, expect, it, vi } from "vitest";
import { SupabaseMissionRepository } from "@/modules/missions/mission.repository";

describe("mission repository", () => {
  it("counts answered and correct attempts through mission_items", async () => {
    const supabase = {
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: { id: "parent-1" } },
          error: null,
        })),
      },
      from: vi.fn((table: string) => {
        if (table === "missions") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({
                    data: {
                      id: "mission-1",
                      learner_id: "learner-1",
                      mission_date: "2026-07-20",
                      status: "ready",
                      estimated_minutes: 20,
                    },
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

    const repository = new SupabaseMissionRepository(supabase as never);
    const mission = await repository.findTodaysMission("learner-1");

    expect(mission?.answeredCount).toBe(2);
    expect(mission?.correctCount).toBe(1);
  });
});
