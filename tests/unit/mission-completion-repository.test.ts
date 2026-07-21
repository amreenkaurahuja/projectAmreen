import { describe, expect, it, vi } from "vitest";
import { MissionRepositoryError } from "@/modules/missions/mission.repository";
import { SupabaseMissionCompletionRepository } from "@/modules/missions/mission-completion.repository";

describe("SupabaseMissionCompletionRepository.getLearnerDisplayName", () => {
  it("returns the learner's display name", async () => {
    const eq = vi.fn(() => ({
      maybeSingle: vi.fn(async () => ({
        data: { display_name: "Amelia" },
        error: null,
      })),
    }));
    const supabase = {
      from: vi.fn(() => ({ select: vi.fn(() => ({ eq })) })),
    };

    const repository = new SupabaseMissionCompletionRepository(
      supabase as never,
    );
    const name = await repository.getLearnerDisplayName("learner-1");

    expect(name).toBe("Amelia");
    expect(eq).toHaveBeenCalledWith("id", "learner-1");
  });

  it("returns null when the learner has no matching row", async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: null, error: null })),
          })),
        })),
      })),
    };

    const repository = new SupabaseMissionCompletionRepository(
      supabase as never,
    );
    const name = await repository.getLearnerDisplayName("learner-1");

    expect(name).toBeNull();
  });

  it("throws a MissionRepositoryError when the query fails", async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({
              data: null,
              error: { message: "boom" },
            })),
          })),
        })),
      })),
    };

    const repository = new SupabaseMissionCompletionRepository(
      supabase as never,
    );

    await expect(repository.getLearnerDisplayName("learner-1")).rejects.toThrow(
      MissionRepositoryError,
    );
  });
});
