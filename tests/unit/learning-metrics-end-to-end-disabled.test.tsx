import {
  afterAll,
  afterEach,
  beforeAll,
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

// TDS-008 Stage 6.5, Scenario D — metrics disabled: educational behaviour
// must be unchanged, no request to /api/v1/learning-events at all, and
// therefore nothing to report. A separate file from
// learning-metrics-end-to-end.test.tsx for the same reason established in
// Stage 6.3C — the flag is read once at module load, so each flag state
// needs its own isolated file/module registry.

const ATTEMPT_ID = "223e4567-e89b-12d3-a456-426614174000";
const LEARNER_ID = "323e4567-e89b-12d3-a456-426614174000";

let QuestionExplainerFlow: typeof QuestionExplainerFlowType;
let previousFlagValue: string | undefined;

beforeAll(async () => {
  previousFlagValue =
    process.env.NEXT_PUBLIC_QUESTION_EXPLAINER_METRICS_ENABLED;
  process.env.NEXT_PUBLIC_QUESTION_EXPLAINER_METRICS_ENABLED = "false";
  ({ QuestionExplainerFlow } =
    await import("@/components/question-explainer/question-explainer-flow"));
});

afterAll(() => {
  process.env.NEXT_PUBLIC_QUESTION_EXPLAINER_METRICS_ENABLED =
    previousFlagValue;
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

describe("D. Metrics disabled — educational behaviour unchanged, nothing persisted", () => {
  it("completes the full learner flow with zero requests to /api/v1/learning-events", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/v1/learning-events") {
        throw new Error("must not be called while metrics are disabled");
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderFlow();

    const trigger = screen.getByRole("button", {
      name: "Why did I get this wrong?",
    });
    await user.click(trigger);
    expect(screen.getByText(/Not quite/)).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(trigger).toHaveFocus();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports empty metrics for a learner who has never had an event persisted", async () => {
    const table = createFakeLearningEventsTable();
    const client = createFakeSupabaseClient(table);
    const repository = new SupabaseQuestionExplainerMetricsRepository(
      client as never,
    );

    const events = await repository.getEventsForLearner(LEARNER_ID);
    const metrics = calculateQuestionExplainerMetrics(events);

    expect(events).toEqual([]);
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
