import { beforeEach, describe, expect, it, vi } from "vitest";

function chain(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(async () => result),
    single: vi.fn(async () => result),
  };
  return builder;
}

beforeEach(() => {
  vi.resetModules();
});

describe("getCurriculumSubjects", () => {
  it("returns active subjects ordered by sort_order", async () => {
    const subjects = [
      { id: "1", slug: "mathematics", name: "Mathematics", sort_order: 10 },
    ];
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: vi.fn(async () => ({
        from: vi.fn(() => chain({ data: subjects, error: null })),
      })),
    }));

    const { getCurriculumSubjects } =
      await import("@/lib/curriculum/catalogue");
    const result = await getCurriculumSubjects();

    expect(result).toEqual(subjects);
  });

  it("returns an empty array when there is no data", async () => {
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: vi.fn(async () => ({
        from: vi.fn(() => chain({ data: null, error: null })),
      })),
    }));

    const { getCurriculumSubjects } =
      await import("@/lib/curriculum/catalogue");
    const result = await getCurriculumSubjects();

    expect(result).toEqual([]);
  });

  it("throws when the query fails", async () => {
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: vi.fn(async () => ({
        from: vi.fn(() => chain({ data: null, error: { message: "boom" } })),
      })),
    }));

    const { getCurriculumSubjects } =
      await import("@/lib/curriculum/catalogue");

    await expect(getCurriculumSubjects()).rejects.toThrow(
      "Unable to load subjects: boom",
    );
  });
});

describe("getCurriculumSubject", () => {
  it("sorts topics and skills by sort_order", async () => {
    const subject = {
      id: "1",
      slug: "mathematics",
      name: "Mathematics",
      description: "",
      icon: "➗",
      sort_order: 10,
      topics: [
        {
          id: "t2",
          slug: "arithmetic",
          sort_order: 20,
          skills: [
            { id: "s2", code: "B", sort_order: 20 },
            { id: "s1", code: "A", sort_order: 10 },
          ],
        },
        { id: "t1", slug: "number", sort_order: 10, skills: [] },
      ],
    };
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: vi.fn(async () => ({
        from: vi.fn(() => chain({ data: subject, error: null })),
      })),
    }));

    const { getCurriculumSubject } = await import("@/lib/curriculum/catalogue");
    const result = await getCurriculumSubject("mathematics");

    expect(result?.topics.map((t) => t.id)).toEqual(["t1", "t2"]);
    expect(result?.topics[1]?.skills.map((s) => s.id)).toEqual(["s1", "s2"]);
  });

  it("returns null when the subject is not found", async () => {
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: vi.fn(async () => ({
        from: vi.fn(() => chain({ data: null, error: null })),
      })),
    }));

    const { getCurriculumSubject } = await import("@/lib/curriculum/catalogue");

    expect(await getCurriculumSubject("nope")).toBeNull();
  });

  it("returns null when the query errors", async () => {
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: vi.fn(async () => ({
        from: vi.fn(() => chain({ data: null, error: { message: "boom" } })),
      })),
    }));

    const { getCurriculumSubject } = await import("@/lib/curriculum/catalogue");

    expect(await getCurriculumSubject("mathematics")).toBeNull();
  });
});
