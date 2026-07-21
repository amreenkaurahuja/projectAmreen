import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const LEARNER_ID = "223e4567-e89b-12d3-a456-426614174000";

interface QueryResult {
  data: unknown;
  error: unknown;
}

function builder(result: QueryResult) {
  const chain: Record<string, unknown> = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    single: vi.fn(async () => result),
    maybeSingle: vi.fn(async () => result),
  };
  return chain;
}

function digestOf(error: unknown): string {
  return error && typeof error === "object" && "digest" in error
    ? String((error as { digest: unknown }).digest)
    : "";
}

function mockAuth() {
  vi.doMock("@/lib/supabase/server", () => ({
    createClient: vi.fn(async () => ({
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: { id: "parent-1" } },
          error: null,
        })),
      },
      from: vi.fn(() => {
        throw new Error("from() should not be called in this scenario");
      }),
    })),
  }));
}

function mockLearnersQuery(result: QueryResult) {
  vi.doMock("@/lib/supabase/server", () => ({
    createClient: vi.fn(async () => ({
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: { id: "parent-1" } },
          error: null,
        })),
      },
      from: vi.fn(() => builder(result)),
    })),
  }));
}

beforeEach(() => {
  vi.resetModules();
});

describe("/learner/subjects/[slug] page", () => {
  it("redirects to create a learner when the parent has none", async () => {
    mockLearnersQuery({ data: null, error: null });
    const { default: SubjectPage } =
      await import("@/app/learner/subjects/[slug]/page");

    const error = await SubjectPage({
      params: Promise.resolve({ slug: "mathematics" }),
      searchParams: Promise.resolve({}),
    }).catch((e: unknown) => e);

    expect(digestOf(error)).toContain("/parent/learners/new");
  });

  it("redirects to the parent's first learner when none is specified", async () => {
    mockLearnersQuery({ data: { id: LEARNER_ID }, error: null });
    const { default: SubjectPage } =
      await import("@/app/learner/subjects/[slug]/page");

    const error = await SubjectPage({
      params: Promise.resolve({ slug: "mathematics" }),
      searchParams: Promise.resolve({}),
    }).catch((e: unknown) => e);

    expect(digestOf(error)).toContain(
      `/learner/subjects/mathematics?learner=${LEARNER_ID}`,
    );
  });

  it("404s on a malformed learner id", async () => {
    mockAuth();
    const { default: SubjectPage } =
      await import("@/app/learner/subjects/[slug]/page");

    const error = await SubjectPage({
      params: Promise.resolve({ slug: "mathematics" }),
      searchParams: Promise.resolve({ learner: "not-a-uuid" }),
    }).catch((e: unknown) => e);

    expect(digestOf(error)).toContain("NEXT_HTTP_ERROR_FALLBACK;404");
  });

  it("404s when the subject doesn't exist", async () => {
    mockLearnersQuery({
      data: { id: LEARNER_ID, display_name: "Amelia" },
      error: null,
    });
    vi.doMock("@/lib/curriculum/catalogue", () => ({
      getCurriculumSubject: vi.fn(async () => null),
    }));
    const { default: SubjectPage } =
      await import("@/app/learner/subjects/[slug]/page");

    const error = await SubjectPage({
      params: Promise.resolve({ slug: "not-a-subject" }),
      searchParams: Promise.resolve({ learner: LEARNER_ID }),
    }).catch((e: unknown) => e);

    expect(digestOf(error)).toContain("NEXT_HTTP_ERROR_FALLBACK;404");
  });

  it("renders the subject's topics and skills", async () => {
    mockLearnersQuery({
      data: { id: LEARNER_ID, display_name: "Amelia" },
      error: null,
    });
    vi.doMock("@/lib/curriculum/catalogue", () => ({
      getCurriculumSubject: vi.fn(async () => ({
        id: "subject-1",
        slug: "mathematics",
        name: "Mathematics",
        description: "Number and arithmetic.",
        icon: "➗",
        sort_order: 10,
        topics: [
          {
            id: "topic-1",
            slug: "arithmetic",
            name: "Arithmetic",
            description: "Add and subtract.",
            sort_order: 10,
            skills: [
              {
                id: "skill-1",
                code: "MATH-ARI-01",
                name: "Four-operation fluency",
                description: "Calculate accurately.",
                difficulty: 2,
              },
            ],
          },
        ],
      })),
    }));
    const { default: SubjectPage } =
      await import("@/app/learner/subjects/[slug]/page");

    const element = await SubjectPage({
      params: Promise.resolve({ slug: "mathematics" }),
      searchParams: Promise.resolve({ learner: LEARNER_ID }),
    });
    render(element);

    expect(screen.getByText("Mathematics")).toBeInTheDocument();
    expect(screen.getByText("Arithmetic")).toBeInTheDocument();
    expect(screen.getByText("Four-operation fluency")).toBeInTheDocument();
    expect(screen.getByText(/Amelia's dashboard/)).toBeInTheDocument();
  });
});
