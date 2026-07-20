// Regression coverage for a production crash: a malformed `learner` query
// param (e.g. a hand-edited URL) is not a valid UUID, so Postgrest rejects
// it and the mission service throws on that error. On /learner/dashboard
// this throw happened inside an uncaught Promise.all, producing a raw 500
// ("This page couldn't load"). Each learner-scoped page must now validate
// the id and fail gracefully (redirect/notFound) before any Supabase query
// that could throw on invalid input runs.
import { beforeEach, describe, expect, it, vi } from "vitest";

const INVALID_LEARNER_ID = "<id>";

function mockSupabase() {
  const from = vi.fn(() => {
    throw new Error(
      "supabase.from() should not be called before the invalid id is rejected",
    );
  });

  vi.doMock("@/lib/supabase/server", () => ({
    createClient: vi.fn(async () => ({
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: { id: "parent-1" } },
          error: null,
        })),
      },
      from,
    })),
  }));

  return { from };
}

function digestOf(error: unknown): string {
  return error && typeof error === "object" && "digest" in error
    ? String((error as { digest: unknown }).digest)
    : "";
}

beforeEach(() => {
  vi.resetModules();
});

describe("learner-scoped pages reject a malformed learner id before querying Supabase", () => {
  it("/learner/dashboard calls notFound() instead of crashing", async () => {
    const { from } = mockSupabase();
    const { default: LearnerDashboard } =
      await import("@/app/learner/dashboard/page");

    const error = await LearnerDashboard({
      searchParams: Promise.resolve({ learner: INVALID_LEARNER_ID }),
    }).catch((e: unknown) => e);

    expect(digestOf(error)).toContain("NEXT_HTTP_ERROR_FALLBACK;404");
    expect(from).not.toHaveBeenCalled();
  });

  it("/learner/mission redirects to /parent/dashboard instead of crashing", async () => {
    const { from } = mockSupabase();
    const { default: MissionPage } = await import("@/app/learner/mission/page");

    const error = await MissionPage({
      searchParams: Promise.resolve({ learner: INVALID_LEARNER_ID }),
    }).catch((e: unknown) => e);

    const digest = digestOf(error);
    expect(digest).toContain("NEXT_REDIRECT");
    expect(digest).toContain("/parent/dashboard");
    expect(from).not.toHaveBeenCalled();
  });

  it("/learner/subjects/[slug] calls notFound() instead of crashing", async () => {
    const { from } = mockSupabase();
    const { default: SubjectPage } =
      await import("@/app/learner/subjects/[slug]/page");

    const error = await SubjectPage({
      params: Promise.resolve({ slug: "mathematics" }),
      searchParams: Promise.resolve({ learner: INVALID_LEARNER_ID }),
    }).catch((e: unknown) => e);

    expect(digestOf(error)).toContain("NEXT_HTTP_ERROR_FALLBACK;404");
    expect(from).not.toHaveBeenCalled();
  });
});
