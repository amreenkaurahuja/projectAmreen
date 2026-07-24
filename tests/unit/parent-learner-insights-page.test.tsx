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
    in: vi.fn(() => chain),
    gte: vi.fn(() => chain),
    single: vi.fn(async () => result),
    maybeSingle: vi.fn(async () => result),
    then: (
      resolve: (value: QueryResult) => void,
      reject?: (reason: unknown) => void,
    ) => Promise.resolve(result).then(resolve, reject),
  };
  return chain;
}

function mockSupabase(
  overrides: {
    learnerData?: unknown;
    masteryRows?: unknown[];
    missionsData?: unknown[];
    missionItemsData?: unknown[];
    attemptsData?: unknown[];
    subjectsData?: unknown[];
    skillsData?: unknown[];
  } = {},
) {
  const learnerRow =
    "learnerData" in overrides
      ? overrides.learnerData
      : { id: LEARNER_ID, display_name: "Amelia" };

  const supabase = {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: "parent-1" } },
        error: null,
      })),
    },
    from: vi.fn((table: string) => {
      switch (table) {
        case "learners":
          return builder({ data: learnerRow, error: null });
        case "learner_skill_mastery":
          return builder({ data: overrides.masteryRows ?? [], error: null });
        case "missions":
          return builder({ data: overrides.missionsData ?? [], error: null });
        case "mission_items":
          return builder({
            data: overrides.missionItemsData ?? [],
            error: null,
          });
        case "question_attempts":
          return builder({ data: overrides.attemptsData ?? [], error: null });
        case "question_bank":
          return builder({ data: [], error: null });
        case "subjects":
          return builder({ data: overrides.subjectsData ?? [], error: null });
        case "skills":
          return builder({ data: overrides.skillsData ?? [], error: null });
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

describe("/parent/learners/[learnerId] page", () => {
  it("redirects to the parent dashboard for an invalid learner id", async () => {
    mockSupabase();
    const { default: Page } =
      await import("@/app/parent/learners/[learnerId]/page");

    const error = await Page({
      params: Promise.resolve({ learnerId: "not-a-uuid" }),
    }).catch((e: unknown) => e);

    expect(String((error as { digest?: string }).digest)).toContain(
      "/parent/dashboard",
    );
  });

  it("redirects to the parent dashboard when the learner is not owned", async () => {
    mockSupabase({ learnerData: null });
    const { default: Page } =
      await import("@/app/parent/learners/[learnerId]/page");

    const error = await Page({
      params: Promise.resolve({ learnerId: LEARNER_ID }),
    }).catch((e: unknown) => e);

    expect(String((error as { digest?: string }).digest)).toContain(
      "/parent/dashboard",
    );
  });

  it("shows the empty-state message for a learner with no mastery data", async () => {
    mockSupabase();
    const { default: Page } =
      await import("@/app/parent/learners/[learnerId]/page");

    const element = await Page({
      params: Promise.resolve({ learnerId: LEARNER_ID }),
    });
    render(element);

    expect(screen.getByText("Amelia")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Complete your first mission to start building learning insights.",
      ),
    ).toBeInTheDocument();
  });

  it("renders learning health, subjects, and session history for a learner with data", async () => {
    mockSupabase({
      masteryRows: [
        {
          id: "mastery-1",
          learner_id: LEARNER_ID,
          skill_id: "skill-1",
          subject_id: "subject-1",
          topic_id: "topic-1",
          mastery_score: 35,
          confidence_score: 30,
          total_attempts: 8,
          correct_attempts: 5,
          incorrect_attempts: 3,
          average_response_ms: 12_000,
          last_response_ms: 12_000,
          current_streak: 1,
          best_streak: 2,
          current_incorrect_streak: 0,
          last_attempt_correct: true,
          last_practised_at: "2026-07-21T00:00:00.000Z",
          next_review_at: null,
          updated_at: "2026-07-21T00:00:00.000Z",
          skills: { name: "Fractions" },
          subjects: { name: "Mathematics" },
        },
      ],
      missionsData: [
        {
          id: "mission-1",
          mission_date: "2026-07-21",
          status: "completed",
          completed_at: "2026-07-21T12:00:00.000Z",
        },
      ],
      missionItemsData: [{ id: "item-1", mission_id: "mission-1" }],
      attemptsData: [
        {
          is_correct: true,
          response_ms: 5000,
          question_bank: { difficulty: 2 },
          mission_items: { mission_id: "mission-1" },
        },
      ],
      subjectsData: [{ slug: "mathematics" }],
    });
    const { default: Page } =
      await import("@/app/parent/learners/[learnerId]/page");

    const element = await Page({
      params: Promise.resolve({ learnerId: LEARNER_ID }),
    });
    render(element);

    expect(screen.getByText("Overall Learning Health")).toBeInTheDocument();
    expect(screen.getByText("Mathematics")).toBeInTheDocument();
    expect(screen.getByText("Needs Practice")).toBeInTheDocument();
    expect(screen.getByText("Session history")).toBeInTheDocument();
  });
});
