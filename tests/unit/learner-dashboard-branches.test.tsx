import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const LEARNER_ID = "223e4567-e89b-12d3-a456-426614174000";
const MISSION_ID = "323e4567-e89b-12d3-a456-426614174000";

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
    in: vi.fn(() => chain),
    single: vi.fn(async () => result),
    maybeSingle: vi.fn(async () => result),
    then: (
      resolve: (value: QueryResult) => void,
      reject?: (reason: unknown) => void,
    ) => Promise.resolve(result).then(resolve, reject),
  };
  return chain;
}

function digestOf(error: unknown): string {
  return error && typeof error === "object" && "digest" in error
    ? String((error as { digest: unknown }).digest)
    : "";
}

function mockSupabase(
  overrides: {
    learnersData?: unknown;
    learnersSequence?: unknown[];
    progressData?: unknown;
    missionsData?: unknown;
    itemsAnswered?: number;
  } = {},
) {
  const learnerRow =
    "learnersData" in overrides
      ? overrides.learnersData
      : {
          id: LEARNER_ID,
          display_name: "Amelia",
          school_year: 5,
          exam_target: "11+",
        };
  const answered = overrides.itemsAnswered ?? 0;
  const itemIds = Array.from({ length: 16 }, (_, i) => `item-${i + 1}`);
  let learnersCallCount = 0;

  const supabase = {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: "parent-1" } },
        error: null,
      })),
    },
    from: vi.fn((table: string) => {
      switch (table) {
        case "learners": {
          if (overrides.learnersSequence) {
            // Both the mission service's and the mastery service's ownership
            // checks query "learners" independently — once the sequence's
            // explicit entries are exhausted, later calls reuse the last one
            // rather than reading past the end of the array.
            const index = Math.min(
              learnersCallCount,
              overrides.learnersSequence.length - 1,
            );
            const data = overrides.learnersSequence[index];
            learnersCallCount += 1;
            return builder({ data, error: null });
          }
          return builder({ data: learnerRow, error: null });
        }
        case "subjects":
          return builder({
            data: [
              {
                id: "subject-1",
                slug: "mathematics",
                name: "Mathematics",
                description: "Number and arithmetic.",
                icon: "➗",
                sort_order: 10,
              },
            ],
            error: null,
          });
        case "learner_subject_progress":
          return builder({
            data:
              "progressData" in overrides
                ? overrides.progressData
                : [{ subject_id: "subject-1", progress_percent: 40 }],
            error: null,
          });
        case "missions":
          return builder({
            data:
              "missionsData" in overrides
                ? overrides.missionsData
                : {
                    id: MISSION_ID,
                    learner_id: LEARNER_ID,
                    mission_date: "2026-07-21",
                    status: "in_progress",
                    estimated_minutes: 20,
                    completed_at: null,
                  },
            error: null,
          });
        case "mission_items":
          return builder({ data: itemIds.map((id) => ({ id })), error: null });
        case "question_attempts":
          return builder({
            data: itemIds.slice(0, answered).map((id) => ({
              mission_item_id: id,
              is_correct: true,
            })),
            error: null,
          });
        case "learner_skill_mastery":
          return builder({ data: [], error: null });
        default:
          throw new Error(`Unexpected table: ${table}`);
      }
    }),
  };

  vi.doMock("@/lib/supabase/server", () => ({
    createClient: vi.fn(async () => supabase),
  }));
}

beforeEach(() => {
  vi.resetModules();
});

describe("/learner/dashboard page branches", () => {
  it("redirects to create a learner when the parent has none", async () => {
    mockSupabase({ learnersData: null });
    const { default: LearnerDashboard } =
      await import("@/app/learner/dashboard/page");

    const error = await LearnerDashboard({
      searchParams: Promise.resolve({}),
    }).catch((e: unknown) => e);

    expect(digestOf(error)).toContain("/parent/learners/new");
  });

  it("redirects to the parent's first learner when none is specified", async () => {
    mockSupabase({ learnersData: { id: LEARNER_ID } });
    const { default: LearnerDashboard } =
      await import("@/app/learner/dashboard/page");

    const error = await LearnerDashboard({
      searchParams: Promise.resolve({}),
    }).catch((e: unknown) => e);

    expect(digestOf(error)).toContain(
      `/learner/dashboard?learner=${LEARNER_ID}`,
    );
  });

  it("404s when the learner profile is missing but ownership still resolves", async () => {
    // The profile select (`.single()`) and the mission service's ownership
    // check (`.maybeSingle()`) both query `learners`, but independently —
    // this simulates the profile row being gone while ownership still
    // resolves, to exercise the page's own `if (!profile) notFound()` guard
    // rather than the ownership check winning the Promise.all race.
    mockSupabase({ learnersSequence: [null, { id: LEARNER_ID }] });
    const { default: LearnerDashboard } =
      await import("@/app/learner/dashboard/page");

    const error = await LearnerDashboard({
      searchParams: Promise.resolve({ learner: LEARNER_ID }),
    }).catch((e: unknown) => e);

    expect(digestOf(error)).toContain("NEXT_HTTP_ERROR_FALLBACK;404");
  });

  it("shows Start Mission, overall progress, and subject cards when nothing is answered yet", async () => {
    mockSupabase({ itemsAnswered: 0 });
    const { default: LearnerDashboard } =
      await import("@/app/learner/dashboard/page");

    const element = await LearnerDashboard({
      searchParams: Promise.resolve({ learner: LEARNER_ID }),
    });
    render(element);

    expect(screen.getByText(/Start Mission/)).toBeInTheDocument();
    expect(screen.getByText("40%")).toBeInTheDocument();
    expect(screen.getByText("Mathematics")).toBeInTheDocument();
    expect(screen.queryByText(/Resume Mission/)).not.toBeInTheDocument();
    expect(
      screen.getByText(/personalised for your learning/i),
    ).toBeInTheDocument();
  });

  it("shows Resume Mission and progress once some questions are answered", async () => {
    mockSupabase({ itemsAnswered: 4 });
    const { default: LearnerDashboard } =
      await import("@/app/learner/dashboard/page");

    const element = await LearnerDashboard({
      searchParams: Promise.resolve({ learner: LEARNER_ID }),
    });
    render(element);

    expect(screen.getByText(/Resume Mission/)).toBeInTheDocument();
    expect(screen.getByText(/4 answered/)).toBeInTheDocument();
  });
});
