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
import type { LearningEvent } from "@/modules/question-explainer/explanation-event.types";
import type { LearningEventPublisher } from "@/modules/question-explainer/explanation-event-publisher";

// TDS-008 Stage 6.3C — this file's whole purpose is to observe the
// *default* publisher with NEXT_PUBLIC_QUESTION_EXPLAINER_METRICS_ENABLED
// set to "true" before the flag-dependent modules are ever imported.
// isQuestionExplainerMetricsEnabled() is read once, at module load, inside
// default-learning-event-publisher.ts — so the env var must be set before
// that module (transitively pulled in by question-explainer-flow.tsx) is
// imported for the first time. Each Vitest test file gets its own isolated
// module registry (vitest.config.ts has no isolate:false override), so
// setting it here — and using a dynamic import instead of a static one —
// is sufficient; there's no need for vi.resetModules() (which would also
// force a second React module instance and break rendering).

const ATTEMPT_ID = "223e4567-e89b-12d3-a456-426614174000";

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
  generatedAt: "2026-07-28T00:00:00.000Z",
};

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 500) {
  return { ok, status, json: async () => body } as Response;
}

let QuestionExplainerFlow: typeof QuestionExplainerFlowType;
let previousFlagValue: string | undefined;

beforeAll(async () => {
  previousFlagValue =
    process.env.NEXT_PUBLIC_QUESTION_EXPLAINER_METRICS_ENABLED;
  process.env.NEXT_PUBLIC_QUESTION_EXPLAINER_METRICS_ENABLED = "true";
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

function renderFlow(publisher?: LearningEventPublisher) {
  return render(
    <QuestionExplainerFlow
      attemptId={ATTEMPT_ID}
      selectedOptionLabel="54"
      correctOptionLabel="60"
      publisher={publisher}
    />,
  );
}

describe("QuestionExplainerFlow with metrics enabled (default publisher = HTTP)", () => {
  it("delivers real events to /api/v1/learning-events with eventId, sessionId, eventType and occurredAt intact, one attempt per event", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      void init;
      if (url === "/api/v1/question-explanations") {
        return Promise.resolve(jsonResponse(API_RESULT));
      }
      if (url === "/api/v1/learning-events") {
        return Promise.resolve(jsonResponse({}, true, 201));
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderFlow(); // no explicit publisher — exercises the flag-selected default

    await user.click(
      screen.getByRole("button", { name: "Why did I get this wrong?" }),
    );
    await user.click(screen.getByRole("button", { name: "Why?" }));
    await screen.findByText("75% means three quarters.");
    await user.click(screen.getByRole("button", { name: "Let's see one" }));
    await user.click(screen.getByRole("button", { name: "Now you try" }));
    await user.click(screen.getByRole("button", { name: "Done" }));

    const learningEventCalls = fetchMock.mock.calls.filter(
      ([url]) => url === "/api/v1/learning-events",
    );
    // opened, step_viewed x4 (acknowledge/explain/worked_example/next_step),
    // completed — one delivery attempt per event.
    expect(learningEventCalls).toHaveLength(6);

    const sentEvents = learningEventCalls.map(
      ([, init]) => JSON.parse(init!.body as string) as LearningEvent,
    );
    const sessionIds = new Set(sentEvents.map((event) => event.sessionId));
    const eventIds = new Set(sentEvents.map((event) => event.eventId));
    expect(sessionIds.size).toBe(1); // one session
    expect(eventIds.size).toBe(sentEvents.length); // every eventId distinct
    for (const event of sentEvents) {
      expect(event.attemptId).toBe(ATTEMPT_ID);
      expect(typeof event.occurredAt).toBe("string");
      expect(new Date(event.occurredAt).toString()).not.toBe("Invalid Date");
    }
    expect(sentEvents.map((event) => event.eventType)).toEqual([
      "explanation_opened",
      "step_viewed",
      "step_viewed",
      "step_viewed",
      "step_viewed",
      "explanation_completed",
    ]);
  });

  it("keeps the learner flow intact when every /api/v1/learning-events call fails — no error UI, no retry, no unhandled rejection", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/v1/question-explanations") {
        return Promise.resolve(jsonResponse(API_RESULT));
      }
      if (url === "/api/v1/learning-events") {
        return Promise.reject(new Error("delivery unavailable"));
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

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
    expect(learningEventCalls).toHaveLength(6); // still one attempt each, no retry
  });

  it("still uses an explicitly supplied publisher instead of the HTTP default, even with metrics enabled", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        throw new Error("fetch should never be called for this test");
      }),
    );
    const events: LearningEvent[] = [];
    const customPublisher: LearningEventPublisher = {
      publish: (event) => {
        events.push(event);
      },
    };

    renderFlow(customPublisher);

    await user.click(
      screen.getByRole("button", { name: "Why did I get this wrong?" }),
    );

    expect(events.length).toBeGreaterThan(0);
    expect(fetch).not.toHaveBeenCalled();
  });
});
