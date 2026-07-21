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
    in: vi.fn(async () => result),
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

function buildMissionItems() {
  return Array.from({ length: 16 }, (_, index) => ({
    id: `item-${index + 1}`,
    position: index + 1,
    question_bank: {
      id: `question-${index + 1}`,
      prompt: `Prompt ${index + 1}`,
      explanation: `Explanation ${index + 1}`,
      subjects: { name: "Mathematics", slug: "mathematics" },
      topics: null,
      question_options: [
        { id: `${index + 1}-a`, label: "A", is_correct: true, sort_order: 1 },
        { id: `${index + 1}-b`, label: "B", is_correct: false, sort_order: 2 },
      ],
    },
  }));
}

function mockSupabase(
  overrides: {
    learnersData?: unknown;
    missionsData?: unknown;
    missionItemsData?: unknown;
  } = {},
) {
  const learnerRow = {
    id: LEARNER_ID,
    display_name: "Amelia",
  };
  const missionRow = {
    id: MISSION_ID,
    learner_id: LEARNER_ID,
    mission_date: "2026-07-21",
    status: "ready",
    estimated_minutes: 20,
    completed_at: null,
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
          return builder({
            data:
              "learnersData" in overrides ? overrides.learnersData : learnerRow,
            error: null,
          });
        case "missions":
          return builder({
            data:
              "missionsData" in overrides ? overrides.missionsData : missionRow,
            error: null,
          });
        case "mission_items":
          return builder({
            data:
              "missionItemsData" in overrides
                ? overrides.missionItemsData
                : buildMissionItems(),
            error: null,
          });
        case "question_attempts":
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

describe("/learner/mission page", () => {
  it("redirects to create a learner when the parent has none", async () => {
    mockSupabase({ learnersData: null });
    const { default: MissionPage } = await import("@/app/learner/mission/page");

    const error = await MissionPage({
      searchParams: Promise.resolve({}),
    }).catch((e: unknown) => e);

    expect(digestOf(error)).toContain("/parent/learners/new");
  });

  it("redirects to the parent's first learner when none is specified", async () => {
    mockSupabase();
    const { default: MissionPage } = await import("@/app/learner/mission/page");

    const error = await MissionPage({
      searchParams: Promise.resolve({}),
    }).catch((e: unknown) => e);

    expect(digestOf(error)).toContain(`/learner/mission?learner=${LEARNER_ID}`);
  });

  it("redirects to the parent dashboard when the learner is not owned", async () => {
    mockSupabase({ learnersData: null });
    const { default: MissionPage } = await import("@/app/learner/mission/page");

    const error = await MissionPage({
      searchParams: Promise.resolve({ learner: LEARNER_ID }),
    }).catch((e: unknown) => e);

    expect(digestOf(error)).toContain("/parent/dashboard");
  });

  it("redirects to the correct mission id when the URL's mission id is stale", async () => {
    mockSupabase();
    const { default: MissionPage } = await import("@/app/learner/mission/page");

    const error = await MissionPage({
      searchParams: Promise.resolve({
        learner: LEARNER_ID,
        mission: "923e4567-e89b-12d3-a456-426614174999",
      }),
    }).catch((e: unknown) => e);

    expect(digestOf(error)).toContain(
      `/learner/mission?learner=${LEARNER_ID}&mission=${MISSION_ID}`,
    );
  });

  it("renders question 1 of 16 for a fresh mission", async () => {
    mockSupabase();
    const { default: MissionPage } = await import("@/app/learner/mission/page");

    const element = await MissionPage({
      searchParams: Promise.resolve({
        learner: LEARNER_ID,
        mission: MISSION_ID,
      }),
    });
    render(element);

    expect(screen.getByText("Question 1 of 16")).toBeInTheDocument();
    expect(screen.getByText("Prompt 1")).toBeInTheDocument();
  });
});
