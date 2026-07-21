import { describe, expect, it, vi } from "vitest";
import {
  MissionAccessError,
  MissionDuplicateError,
  MissionRepositoryError,
  SupabaseMissionRepository,
} from "@/modules/missions/mission.repository";

function authenticatedSupabase(userId = "parent-1") {
  return {
    getUser: vi.fn(async () => ({
      data: { user: { id: userId } },
      error: null,
    })),
  };
}

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

  it("returns null when there is no mission for today", async () => {
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

    const repository = new SupabaseMissionRepository(supabase as never);
    const mission = await repository.findTodaysMission("learner-1");

    expect(mission).toBeNull();
  });

  it("throws when the missions query fails", async () => {
    const supabase = {
      auth: authenticatedSupabase(),
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: null,
                error: { message: "boom" },
              })),
            })),
          })),
        })),
      })),
    };

    const repository = new SupabaseMissionRepository(supabase as never);

    await expect(repository.findTodaysMission("learner-1")).rejects.toThrow(
      MissionRepositoryError,
    );
  });
});

describe("mission repository: ensureLearnerOwned", () => {
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

    const repository = new SupabaseMissionRepository(supabase as never);

    await expect(
      repository.ensureLearnerOwned("learner-1"),
    ).resolves.toBeUndefined();
  });

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

    const repository = new SupabaseMissionRepository(supabase as never);

    await expect(repository.ensureLearnerOwned("learner-1")).rejects.toThrow(
      MissionAccessError,
    );
  });

  it("throws a repository error when the ownership query fails", async () => {
    const supabase = {
      auth: authenticatedSupabase(),
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: null,
                error: { message: "boom" },
              })),
            })),
          })),
        })),
      })),
    };

    const repository = new SupabaseMissionRepository(supabase as never);

    await expect(repository.ensureLearnerOwned("learner-1")).rejects.toThrow(
      MissionRepositoryError,
    );
  });
});

describe("mission repository: getAuthenticatedUserId", () => {
  it("throws when there is no authenticated user", async () => {
    const supabase = {
      auth: {
        getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
      },
    };

    const repository = new SupabaseMissionRepository(supabase as never);

    await expect(repository.getAuthenticatedUserId()).rejects.toThrow(
      MissionAccessError,
    );
  });
});

describe("mission repository: createMission", () => {
  const items = [
    {
      id: "a",
      questionId: "q-1",
      position: 1,
      subjectSlug: "mathematics" as const,
    },
  ];

  it("creates the mission and its items", async () => {
    const missionsInsert = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(async () => ({
          data: {
            id: "mission-1",
            learner_id: "learner-1",
            mission_date: "2026-07-21",
            status: "ready",
            estimated_minutes: 20,
          },
          error: null,
        })),
      })),
    }));
    const itemsInsert = vi.fn(async () => ({ error: null }));
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "missions") return { insert: missionsInsert };
        if (table === "mission_items") return { insert: itemsInsert };
        throw new Error(`Unexpected table: ${table}`);
      }),
    };

    const repository = new SupabaseMissionRepository(supabase as never);
    const mission = await repository.createMission(
      "learner-1",
      "2026-07-21",
      20,
      items,
    );

    expect(mission.missionId).toBe("mission-1");
    expect(mission.completedAt).toBeNull();
    expect(mission.answeredCount).toBe(0);
  });

  it("throws MissionDuplicateError on a mission insert race", async () => {
    const missionsInsert = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(async () => ({
          data: null,
          error: { code: "23505", message: "duplicate" },
        })),
      })),
    }));
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "missions") return { insert: missionsInsert };
        throw new Error(`Unexpected table: ${table}`);
      }),
    };

    const repository = new SupabaseMissionRepository(supabase as never);

    await expect(
      repository.createMission("learner-1", "2026-07-21", 20, items),
    ).rejects.toThrow(MissionDuplicateError);
  });

  it("throws a generic repository error when the mission insert fails for another reason", async () => {
    const missionsInsert = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(async () => ({
          data: null,
          error: { code: "23000", message: "boom" },
        })),
      })),
    }));
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "missions") return { insert: missionsInsert };
        throw new Error(`Unexpected table: ${table}`);
      }),
    };

    const repository = new SupabaseMissionRepository(supabase as never);

    await expect(
      repository.createMission("learner-1", "2026-07-21", 20, items),
    ).rejects.toThrow(MissionRepositoryError);
  });

  it("throws MissionDuplicateError when inserting items races", async () => {
    const missionsInsert = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(async () => ({
          data: {
            id: "mission-1",
            learner_id: "learner-1",
            mission_date: "2026-07-21",
            status: "ready",
            estimated_minutes: 20,
          },
          error: null,
        })),
      })),
    }));
    const itemsInsert = vi.fn(async () => ({
      error: { code: "23505", message: "duplicate" },
    }));
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "missions") return { insert: missionsInsert };
        if (table === "mission_items") return { insert: itemsInsert };
        throw new Error(`Unexpected table: ${table}`);
      }),
    };

    const repository = new SupabaseMissionRepository(supabase as never);

    await expect(
      repository.createMission("learner-1", "2026-07-21", 20, items),
    ).rejects.toThrow(MissionDuplicateError);
  });

  it("throws a generic repository error when inserting items fails for another reason", async () => {
    const missionsInsert = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(async () => ({
          data: {
            id: "mission-1",
            learner_id: "learner-1",
            mission_date: "2026-07-21",
            status: "ready",
            estimated_minutes: 20,
          },
          error: null,
        })),
      })),
    }));
    const itemsInsert = vi.fn(async () => ({
      error: { code: "23000", message: "boom" },
    }));
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "missions") return { insert: missionsInsert };
        if (table === "mission_items") return { insert: itemsInsert };
        throw new Error(`Unexpected table: ${table}`);
      }),
    };

    const repository = new SupabaseMissionRepository(supabase as never);

    await expect(
      repository.createMission("learner-1", "2026-07-21", 20, items),
    ).rejects.toThrow(MissionRepositoryError);
  });
});
