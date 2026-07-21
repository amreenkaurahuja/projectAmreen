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

function mockSupabase(masteryRows: unknown[]) {
  const learnerRow = {
    id: LEARNER_ID,
    display_name: "Amelia",
    school_year: 5,
    exam_target: "11+",
  };

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
        case "subjects":
          return builder({ data: [], error: null });
        case "learner_subject_progress":
          return builder({ data: [], error: null });
        case "missions":
          return builder({
            data: {
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
          return builder({ data: [], error: null });
        case "question_attempts":
          return builder({ data: [], error: null });
        case "learner_skill_mastery":
          return builder({ data: masteryRows, error: null });
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

describe("/learner/dashboard learning profile section", () => {
  it("shows the empty-state message when the learner has no mastery data", async () => {
    mockSupabase([]);
    const { default: LearnerDashboard } =
      await import("@/app/learner/dashboard/page");

    const element = await LearnerDashboard({
      searchParams: Promise.resolve({ learner: LEARNER_ID }),
    });
    render(element);

    expect(
      screen.getByText(
        "Complete your first mission to start building your learning profile.",
      ),
    ).toBeInTheDocument();
  });

  it("shows the learning profile stats once mastery data exists", async () => {
    const now = new Date("2026-07-21T00:00:00.000Z");
    mockSupabase([
      {
        id: "mastery-1",
        learner_id: LEARNER_ID,
        skill_id: "skill-1",
        subject_id: "subject-1",
        topic_id: "topic-1",
        mastery_score: 80,
        confidence_score: 70,
        total_attempts: 10,
        correct_attempts: 8,
        incorrect_attempts: 2,
        average_response_ms: 12_000,
        last_response_ms: 10_000,
        current_streak: 3,
        best_streak: 5,
        current_incorrect_streak: 0,
        last_attempt_correct: true,
        last_practised_at: now.toISOString(),
        next_review_at: new Date(now.getTime() - 1000).toISOString(),
        updated_at: now.toISOString(),
        skills: { name: "Long Division" },
        subjects: { name: "Mathematics" },
      },
      {
        id: "mastery-2",
        learner_id: LEARNER_ID,
        skill_id: "skill-2",
        subject_id: "subject-2",
        topic_id: "topic-2",
        mastery_score: 30,
        confidence_score: 20,
        total_attempts: 5,
        correct_attempts: 1,
        incorrect_attempts: 4,
        average_response_ms: 25_000,
        last_response_ms: 25_000,
        current_streak: 0,
        best_streak: 1,
        current_incorrect_streak: 2,
        last_attempt_correct: false,
        last_practised_at: now.toISOString(),
        next_review_at: null,
        updated_at: now.toISOString(),
        skills: { name: "Comprehension" },
        subjects: { name: "English" },
      },
    ]);
    const { default: LearnerDashboard } =
      await import("@/app/learner/dashboard/page");

    const element = await LearnerDashboard({
      searchParams: Promise.resolve({ learner: LEARNER_ID }),
    });
    render(element);

    expect(screen.getByText("Learning Profile")).toBeInTheDocument();
    expect(screen.getByText("Overall Mastery")).toBeInTheDocument();
    expect(screen.getByText("Mathematics")).toBeInTheDocument();
    expect(screen.getByText("English")).toBeInTheDocument();
    expect(screen.getByText("Skills Due for Review")).toBeInTheDocument();
    expect(
      screen.queryByText(
        "Complete your first mission to start building your learning profile.",
      ),
    ).not.toBeInTheDocument();
  });
});
