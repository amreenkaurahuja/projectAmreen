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

function mockSupabaseForCompletedMission() {
  const learnerRow = {
    id: LEARNER_ID,
    display_name: "Amelia",
    school_year: 5,
    exam_target: "11+",
    parent_id: "parent-1",
  };
  const itemIds = Array.from({ length: 16 }, (_, i) => `item-${i + 1}`);

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
              mission_date: "2026-07-20",
              status: "completed",
              estimated_minutes: 20,
              completed_at: "2026-07-20T12:34:00.000Z",
            },
            error: null,
          });
        case "mission_items":
          return builder({
            data: itemIds.map((id) => ({ id })),
            error: null,
          });
        case "question_attempts":
          return builder({
            data: itemIds.map((id, index) => ({
              mission_item_id: id,
              is_correct: index < 15,
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

describe("learner dashboard: completed mission state", () => {
  it("shows score, accuracy, completion date, and Review Mission — not Resume Mission", async () => {
    mockSupabaseForCompletedMission();
    const { default: LearnerDashboard } =
      await import("@/app/learner/dashboard/page");

    const element = await LearnerDashboard({
      searchParams: Promise.resolve({ learner: LEARNER_ID }),
    });
    render(element);

    expect(screen.getByText(/Mission complete/)).toBeInTheDocument();
    expect(screen.getByText(/15\/16 correct/)).toBeInTheDocument();
    expect(screen.getByText(/94% accuracy/)).toBeInTheDocument();
    expect(screen.getByText(/^Completed /)).toBeInTheDocument();
    expect(screen.getByText(/Review Mission/)).toBeInTheDocument();
    expect(screen.queryByText(/Resume Mission/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Start Mission/)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/personalised for your learning/i),
    ).not.toBeInTheDocument();
  });
});
