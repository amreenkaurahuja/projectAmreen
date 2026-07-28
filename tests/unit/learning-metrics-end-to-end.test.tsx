import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { QuestionExplainerFlow as QuestionExplainerFlowType } from "@/components/question-explainer/question-explainer-flow";
import { SupabaseQuestionExplainerMetricsRepository } from "@/modules/question-explainer/question-explainer-metrics.repository";
import { calculateQuestionExplainerMetrics } from "@/modules/question-explainer/question-explainer-metrics.service";
import {
  createFakeLearningEventsTable,
  createFakeSupabaseClient,
} from "./helpers/fake-learning-events-supabase";

// TDS-008 Stage 6.5 — end-to-end narrative verification of the complete
// pipeline: QuestionExplainerFlow -> publisher selection -> HTTP delivery
// -> validation -> persistence -> reporting repository -> calculation
// service. The only faked boundary is the database/network; every piece
// of application code in between (the real POST route handler, the real
// Zod schema, the real delivery service, the real repositories, the real
// calculation service) runs unmodified. Metrics enabled throughout this
// file — see learning-metrics-end-to-end-disabled.test.tsx for the
// disabled-flag narrative (a separate file, per the same env/dynamic-
// import isolation constraint established in Stage 6.3C).

const ATTEMPT_ID = "223e4567-e89b-12d3-a456-426614174000";
const LEARNER_ID = "323e4567-e89b-12d3-a456-426614174000";

const API_RESULT = {
  source: "ai" as const,
  cached: false,
  response: {
    acknowledgement: "Good try!",
    mistakeExplanation: 'You chose "54". The correct answer is "60".',
    keyConcept: "75% means three quarters.",
    workedExample: {
      problem: "Find 75% of 40.",
      steps: ["40 divided by 4 is 10.", "10 times 3 is 30."],
      answer: "30",
    },
    nextAction: {
      type: "review-skill" as const,
      text: "Try another question on percentages soon.",
    },
  },
  followUpQuestionId: null,
  generatedAt: "2026-01-15T10:00:00.000Z",
};

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 500) {
  return { ok, status, json: async () => body } as Response;
}

let QuestionExplainerFlow: typeof QuestionExplainerFlowType;
let POST: (
  request: Request,
  context: { params: Promise<Record<string, never>> },
) => Promise<Response>;
let previousFlagValue: string | undefined;

let currentClient: ReturnType<typeof createFakeSupabaseClient>;
let currentLearnerId: string | null;

beforeAll(async () => {
  previousFlagValue =
    process.env.NEXT_PUBLIC_QUESTION_EXPLAINER_METRICS_ENABLED;
  process.env.NEXT_PUBLIC_QUESTION_EXPLAINER_METRICS_ENABLED = "true";

  vi.doMock("@/lib/supabase/server", () => ({
    createClient: vi.fn(async () => currentClient),
  }));
  vi.doMock("@/modules/question-explainer/explainer.repository", async () => {
    const actual = await vi.importActual<
      typeof import("@/modules/question-explainer/explainer.repository")
    >("@/modules/question-explainer/explainer.repository");
    return {
      ...actual,
      SupabaseQuestionExplainerRepository: class {
        getLearnerIdForAttempt = async () => currentLearnerId;
      },
    };
  });

  ({ QuestionExplainerFlow } =
    await import("@/components/question-explainer/question-explainer-flow"));
  ({ POST } = await import("@/app/api/v1/learning-events/route"));
});

afterAll(() => {
  process.env.NEXT_PUBLIC_QUESTION_EXPLAINER_METRICS_ENABLED =
    previousFlagValue;
});

beforeEach(() => {
  currentClient = createFakeSupabaseClient(createFakeLearningEventsTable());
  currentLearnerId = LEARNER_ID;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderFlow() {
  return render(
    <QuestionExplainerFlow
      attemptId={ATTEMPT_ID}
      selectedOptionLabel="54"
      correctOptionLabel="60"
    />,
  );
}

/** Reads back through the real reporting repository + calculation service, against the same fake table the write path used. */
async function getReportedMetrics() {
  const repository = new SupabaseQuestionExplainerMetricsRepository(
    currentClient as never,
  );
  const events = await repository.getEventsForLearner(LEARNER_ID);
  return calculateQuestionExplainerMetrics(events);
}

/** Routes /api/v1/learning-events through the real POST handler (real validation, real delivery service, real repository, the fake table as its only faked dependency); /api/v1/question-explanations returns a canned response, since that route's own behaviour isn't this stage's concern. */
function stubFetchThroughRealHandlers(
  options: { learningEventsFail?: boolean } = {},
) {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (url === "/api/v1/question-explanations") {
      return Promise.resolve(jsonResponse(API_RESULT));
    }
    if (url === "/api/v1/learning-events") {
      if (options.learningEventsFail) {
        return Promise.reject(new Error("simulated delivery failure"));
      }
      const request = new Request("http://localhost/api/v1/learning-events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: init!.body as string,
      });
      return POST(request, { params: Promise.resolve({}) });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("A. Successful explanation — open, view every step, complete", () => {
  it("persists all six events and reports them correctly", async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetchThroughRealHandlers();
    renderFlow();

    await user.click(
      screen.getByRole("button", { name: "Why did I get this wrong?" }),
    );
    await user.click(screen.getByRole("button", { name: "Why?" }));
    await screen.findByText("75% means three quarters.");
    await user.click(screen.getByRole("button", { name: "Let's see one" }));
    await user.click(screen.getByRole("button", { name: "Now you try" }));
    await user.click(screen.getByRole("button", { name: "Done" }));

    expect(screen.getByText("Reviewed")).toBeInTheDocument();

    const learningEventCalls = fetchMock.mock.calls.filter(
      ([url]) => url === "/api/v1/learning-events",
    );
    expect(learningEventCalls).toHaveLength(6);
    expect(currentClient).toBeDefined();

    const metrics = await getReportedMetrics();
    expect(metrics.explanationsOpened).toBe(1);
    expect(metrics.explanationsCompleted).toBe(1);
    expect(metrics.explanationsAbandoned).toBe(0);
    expect(metrics.completionRate).toBe(1);
    expect(metrics.abandonmentRate).toBe(0);
    expect(metrics.stepProgression).toEqual({
      acknowledge: 1,
      explain: 1,
      worked_example: 1,
      next_step: 1,
    });
    expect(metrics.medianElapsedFlowTimeMs).toBeGreaterThanOrEqual(0);
  });

  it("persists a distinct eventId per event and one shared sessionId", async () => {
    const user = userEvent.setup();
    const table = createFakeLearningEventsTable();
    currentClient = createFakeSupabaseClient(table);
    stubFetchThroughRealHandlers();
    renderFlow();

    await user.click(
      screen.getByRole("button", { name: "Why did I get this wrong?" }),
    );
    await user.click(screen.getByRole("button", { name: "Why?" }));
    await screen.findByText("75% means three quarters.");
    await user.click(screen.getByRole("button", { name: "Let's see one" }));
    await user.click(screen.getByRole("button", { name: "Now you try" }));
    await user.click(screen.getByRole("button", { name: "Done" }));

    expect(table.rows).toHaveLength(6);
    const eventIds = new Set(table.rows.map((row) => row.event_id));
    const sessionIds = new Set(table.rows.map((row) => row.session_id));
    expect(eventIds.size).toBe(6);
    expect(sessionIds.size).toBe(1);
  });
});

describe("B. Abandoned explanation — open, reach a later step, abandon", () => {
  it("persists and reports the abandonment with the correct step and duration", async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetchThroughRealHandlers();
    renderFlow();

    await user.click(
      screen.getByRole("button", { name: "Why did I get this wrong?" }),
    );
    await user.click(screen.getByRole("button", { name: "Why?" }));
    await screen.findByText("75% means three quarters.");
    await user.click(screen.getByRole("button", { name: "Let's see one" }));
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText("Reviewed")).not.toBeInTheDocument();

    const learningEventCalls = fetchMock.mock.calls.filter(
      ([url]) => url === "/api/v1/learning-events",
    );
    // opened, step_viewed(acknowledge), step_viewed(explain),
    // step_viewed(worked_example), abandoned
    expect(learningEventCalls).toHaveLength(5);

    const metrics = await getReportedMetrics();
    expect(metrics.explanationsOpened).toBe(1);
    expect(metrics.explanationsCompleted).toBe(0);
    expect(metrics.explanationsAbandoned).toBe(1);
    expect(metrics.abandonmentByStep).toEqual({ worked_example: 1 });
    expect(metrics.medianElapsedFlowTimeMs).toBeGreaterThanOrEqual(0);
  });
});

describe("C. Delivery failure — metrics enabled, every learning-events request fails", () => {
  it("completes the learner flow normally with no persistence, no retry, no learner-visible error", async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetchThroughRealHandlers({
      learningEventsFail: true,
    });
    renderFlow();

    await user.click(
      screen.getByRole("button", { name: "Why did I get this wrong?" }),
    );
    await user.click(screen.getByRole("button", { name: "Why?" }));
    await screen.findByText("75% means three quarters.");
    await user.click(screen.getByRole("button", { name: "Let's see one" }));
    await user.click(screen.getByRole("button", { name: "Now you try" }));
    await user.click(screen.getByRole("button", { name: "Done" }));

    expect(screen.getByText("Reviewed")).toBeInTheDocument();
    expect(screen.queryByText(/couldn't load/)).not.toBeInTheDocument();

    const learningEventCalls = fetchMock.mock.calls.filter(
      ([url]) => url === "/api/v1/learning-events",
    );
    expect(learningEventCalls).toHaveLength(6); // one attempt per event, no retry

    const metrics = await getReportedMetrics();
    expect(metrics).toEqual({
      explanationsOpened: 0,
      explanationsCompleted: 0,
      explanationsAbandoned: 0,
      completionRate: 0,
      abandonmentRate: 0,
      abandonmentByStep: {},
      stepProgression: {},
      medianElapsedFlowTimeMs: null,
      p90ElapsedFlowTimeMs: null,
    });
  });
});
