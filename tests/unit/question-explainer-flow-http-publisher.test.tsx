import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QuestionExplainerFlow } from "@/components/question-explainer/question-explainer-flow";
import { httpLearningEventPublisher } from "@/modules/question-explainer/http-learning-event-publisher";

// TDS-008 Stage 6.3B — proves the concrete, real HTTP publisher (not a
// test double) can fail outright without the Question Explainer flow
// noticing. Stage 6.1's tests cover the no-op default; these cover the
// live delivery path's actual failure boundary (AP-1).

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

function renderFlow() {
  return render(
    <QuestionExplainerFlow
      attemptId={ATTEMPT_ID}
      selectedOptionLabel="54"
      correctOptionLabel="60"
      publisher={httpLearningEventPublisher}
    />,
  );
}

async function flushMicrotasks() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("QuestionExplainerFlow wired to the real HTTP publisher", () => {
  it("completes the full learner flow even when every /api/v1/learning-events call fails", async () => {
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

    const learningEventCalls = fetchMock.mock.calls.filter(
      ([url]) => url === "/api/v1/learning-events",
    );
    // opened, step_viewed(acknowledge), step_viewed(explain),
    // step_viewed(worked_example), step_viewed(next_step), completed — one
    // delivery attempt per event, no retry despite every one failing.
    expect(learningEventCalls).toHaveLength(6);
  });

  it("closing early still works normally when metrics delivery fails", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(() => Promise.reject(new Error("offline")));
    vi.stubGlobal("fetch", fetchMock);

    renderFlow();

    await user.click(
      screen.getByRole("button", { name: "Why did I get this wrong?" }),
    );
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await flushMicrotasks();
    // opened + step_viewed(acknowledge) + abandoned — still exactly one
    // attempt per event, and the dialog closed normally regardless.
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
