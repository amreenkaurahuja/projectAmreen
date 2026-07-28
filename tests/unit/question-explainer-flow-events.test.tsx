import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QuestionExplainerFlow } from "@/components/question-explainer/question-explainer-flow";
import type { LearningEventPublisher } from "@/modules/question-explainer/explanation-event-publisher";
import type { LearningEvent } from "@/modules/question-explainer/explanation-event.types";

// TDS-008 Stage 6.1 — publisher boundary wiring. These tests only assert
// what LearningEvent gets published and when; the learner-facing behaviour
// of the flow itself is already covered (and must stay green unmodified)
// by tests/unit/question-explainer-flow.test.tsx.

const ATTEMPT_ID = "223e4567-e89b-12d3-a456-426614174000";

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 500) {
  return { ok, status, json: async () => body } as Response;
}

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

function createRecordingPublisher() {
  const events: LearningEvent[] = [];
  const publisher: LearningEventPublisher = {
    publish: vi.fn((event: LearningEvent) => {
      events.push(event);
    }),
  };
  return { publisher, events };
}

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

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("QuestionExplainerFlow learning event publishing", () => {
  it("publishes explanation_opened and step_viewed(acknowledge) on open, with a shared sessionId", async () => {
    const user = userEvent.setup();
    const { publisher, events } = createRecordingPublisher();
    renderFlow(publisher);

    await user.click(
      screen.getByRole("button", { name: "Why did I get this wrong?" }),
    );

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      eventType: "explanation_opened",
      attemptId: ATTEMPT_ID,
    });
    expect(events[1]).toMatchObject({
      eventType: "step_viewed",
      step: "acknowledge",
      attemptId: ATTEMPT_ID,
    });
    expect(events[0]!.sessionId).toBeTruthy();
    expect(events[1]!.sessionId).toBe(events[0]!.sessionId);
  });

  it("publishes step_viewed(explain) only once the explanation has loaded, not while loading", async () => {
    const user = userEvent.setup();
    const { publisher, events } = createRecordingPublisher();
    let resolveFetch!: (value: Response) => void;
    vi.mocked(fetch).mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      }),
    );
    renderFlow(publisher);

    await user.click(
      screen.getByRole("button", { name: "Why did I get this wrong?" }),
    );
    await user.click(screen.getByRole("button", { name: "Why?" }));

    expect(
      events.filter((event) => event.eventType === "step_viewed"),
    ).toHaveLength(1); // only "acknowledge" so far

    resolveFetch(jsonResponse(API_RESULT));
    await screen.findByText("75% means three quarters.");

    const stepViewed = events.filter(
      (event) => event.eventType === "step_viewed",
    );
    expect(stepViewed).toHaveLength(2);
    expect(stepViewed[1]).toMatchObject({ step: "explain" });
  });

  it("publishes step_viewed with the public event names for worked_example and next_step", async () => {
    const user = userEvent.setup();
    const { publisher, events } = createRecordingPublisher();
    vi.mocked(fetch).mockResolvedValue(jsonResponse(API_RESULT));
    renderFlow(publisher);

    await user.click(
      screen.getByRole("button", { name: "Why did I get this wrong?" }),
    );
    await user.click(screen.getByRole("button", { name: "Why?" }));
    await screen.findByText("75% means three quarters.");

    await user.click(screen.getByRole("button", { name: "Let's see one" }));
    await user.click(screen.getByRole("button", { name: "Now you try" }));

    const steps = events
      .filter((event) => event.eventType === "step_viewed")
      .map((event) => (event.eventType === "step_viewed" ? event.step : null));
    expect(steps).toEqual([
      "acknowledge",
      "explain",
      "worked_example",
      "next_step",
    ]);
  });

  it("publishes explanation_completed (and no abandoned event) when Done is clicked", async () => {
    const user = userEvent.setup();
    const { publisher, events } = createRecordingPublisher();
    vi.mocked(fetch).mockResolvedValue(jsonResponse(API_RESULT));
    renderFlow(publisher);

    await user.click(
      screen.getByRole("button", { name: "Why did I get this wrong?" }),
    );
    await user.click(screen.getByRole("button", { name: "Why?" }));
    await screen.findByText("75% means three quarters.");
    await user.click(screen.getByRole("button", { name: "Let's see one" }));
    await user.click(screen.getByRole("button", { name: "Now you try" }));
    await user.click(screen.getByRole("button", { name: "Done" }));

    const completed = events.filter(
      (event) => event.eventType === "explanation_completed",
    );
    const abandoned = events.filter(
      (event) => event.eventType === "explanation_abandoned",
    );
    expect(completed).toHaveLength(1);
    expect(completed[0]).toMatchObject({ attemptId: ATTEMPT_ID });
    expect(completed[0]!.durationMs).toBeGreaterThanOrEqual(0);
    expect(abandoned).toHaveLength(0);
  });

  it.each([
    [
      "escape",
      async (user: ReturnType<typeof userEvent.setup>) =>
        user.keyboard("{Escape}"),
    ],
    [
      "close_button",
      async (user: ReturnType<typeof userEvent.setup>) =>
        user.click(screen.getByRole("button", { name: "Close explanation" })),
    ],
    [
      "backdrop",
      async (user: ReturnType<typeof userEvent.setup>) =>
        user.click(screen.getByRole("dialog").parentElement!),
    ],
  ])(
    "publishes explanation_abandoned with exitMethod %s and lastStep acknowledge when closed before fetching",
    async (exitMethod, triggerClose) => {
      const user = userEvent.setup();
      const { publisher, events } = createRecordingPublisher();
      renderFlow(publisher);

      await user.click(
        screen.getByRole("button", { name: "Why did I get this wrong?" }),
      );
      await triggerClose(user);

      const abandoned = events.filter(
        (event) => event.eventType === "explanation_abandoned",
      );
      expect(abandoned).toHaveLength(1);
      expect(abandoned[0]).toMatchObject({
        exitMethod,
        lastStep: "acknowledge",
        attemptId: ATTEMPT_ID,
      });
    },
  );

  it("publishes explanation_abandoned with exitMethod error and lastStep acknowledge when the request fails", async () => {
    const user = userEvent.setup();
    const { publisher, events } = createRecordingPublisher();
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ error: "boom" }, false));
    renderFlow(publisher);

    await user.click(
      screen.getByRole("button", { name: "Why did I get this wrong?" }),
    );
    await user.click(screen.getByRole("button", { name: "Why?" }));
    await screen.findByText(/couldn't load this explanation/);
    await user.click(screen.getByRole("button", { name: "Close" }));

    const abandoned = events.filter(
      (event) => event.eventType === "explanation_abandoned",
    );
    expect(abandoned).toHaveLength(1);
    // The error screen never shows real educational content, so "explain"
    // was never actually viewed — lastStep correctly stays "acknowledge".
    expect(abandoned[0]).toMatchObject({
      exitMethod: "error",
      lastStep: "acknowledge",
    });
  });

  it("publishes explanation_abandoned with exitMethod unmount when the component unmounts mid-flow", async () => {
    const user = userEvent.setup();
    const { publisher, events } = createRecordingPublisher();
    vi.mocked(fetch).mockResolvedValue(jsonResponse(API_RESULT));
    const { unmount } = renderFlow(publisher);

    await user.click(
      screen.getByRole("button", { name: "Why did I get this wrong?" }),
    );
    await user.click(screen.getByRole("button", { name: "Why?" }));
    await screen.findByText("75% means three quarters.");

    unmount();

    const abandoned = events.filter(
      (event) => event.eventType === "explanation_abandoned",
    );
    expect(abandoned).toHaveLength(1);
    expect(abandoned[0]).toMatchObject({
      exitMethod: "unmount",
      lastStep: "explain",
    });
  });

  it("does not publish explanation_abandoned on unmount after a completed session", async () => {
    const user = userEvent.setup();
    const { publisher, events } = createRecordingPublisher();
    vi.mocked(fetch).mockResolvedValue(jsonResponse(API_RESULT));
    const { unmount } = renderFlow(publisher);

    await user.click(
      screen.getByRole("button", { name: "Why did I get this wrong?" }),
    );
    await user.click(screen.getByRole("button", { name: "Why?" }));
    await screen.findByText("75% means three quarters.");
    await user.click(screen.getByRole("button", { name: "Let's see one" }));
    await user.click(screen.getByRole("button", { name: "Now you try" }));
    await user.click(screen.getByRole("button", { name: "Done" }));

    unmount();

    const abandoned = events.filter(
      (event) => event.eventType === "explanation_abandoned",
    );
    expect(abandoned).toHaveLength(0);
  });

  it("does not publish explanation_abandoned on unmount when the flow was never opened", () => {
    const { publisher, events } = createRecordingPublisher();
    const { unmount } = renderFlow(publisher);

    unmount();

    expect(events).toHaveLength(0);
  });

  it("does not double-publish opened/step_viewed(acknowledge) across re-renders while open", async () => {
    const user = userEvent.setup();
    const { publisher, events } = createRecordingPublisher();
    const { rerender } = renderFlow(publisher);

    await user.click(
      screen.getByRole("button", { name: "Why did I get this wrong?" }),
    );
    expect(events).toHaveLength(2);

    rerender(
      <QuestionExplainerFlow
        attemptId={ATTEMPT_ID}
        selectedOptionLabel="54"
        correctOptionLabel="60"
        publisher={publisher}
      />,
    );

    expect(events).toHaveLength(2);
  });

  it("starts a fresh sessionId on each new open, and each session's events share only that session's id", async () => {
    const user = userEvent.setup();
    const { publisher, events } = createRecordingPublisher();
    renderFlow(publisher);

    await user.click(
      screen.getByRole("button", { name: "Why did I get this wrong?" }),
    );
    await user.keyboard("{Escape}");
    const firstSessionEvents = [...events];
    const firstSessionId = firstSessionEvents[0]!.sessionId;

    await user.click(
      screen.getByRole("button", { name: "Why did I get this wrong?" }),
    );
    const secondSessionEvents = events.slice(firstSessionEvents.length);
    const secondSessionId = secondSessionEvents[0]!.sessionId;

    expect(secondSessionId).not.toBe(firstSessionId);
    expect(
      firstSessionEvents.every((event) => event.sessionId === firstSessionId),
    ).toBe(true);
    expect(
      secondSessionEvents.every((event) => event.sessionId === secondSessionId),
    ).toBe(true);
  });

  it("behaves identically to an unwired flow when no publisher prop is passed (default no-op)", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValue(jsonResponse(API_RESULT));
    renderFlow(); // no publisher prop at all

    await user.click(
      screen.getByRole("button", { name: "Why did I get this wrong?" }),
    );
    await user.click(screen.getByRole("button", { name: "Why?" }));
    await screen.findByText("75% means three quarters.");
    await user.click(screen.getByRole("button", { name: "Let's see one" }));
    await user.click(screen.getByRole("button", { name: "Now you try" }));
    await user.click(screen.getByRole("button", { name: "Done" }));

    expect(screen.getByText("Reviewed")).toBeInTheDocument();
  });
});
