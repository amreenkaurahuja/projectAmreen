import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CoachCard } from "@/components/ai/coach-card";

const LEARNER_ID = "223e4567-e89b-12d3-a456-426614174000";

function jsonResponse(body: unknown, ok = true) {
  return {
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
  } as Response;
}

const aiResult = {
  headline: "Great progress this week!",
  message: "Keep practising a little every day.",
  strengths: ["Vocabulary"],
  focusAreas: ["Fractions"],
  nextSteps: ["Practise Fractions tomorrow."],
  source: "ai" as const,
  cached: false,
};

const fallbackResult = {
  ...aiResult,
  source: "fallback" as const,
};

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CoachCard", () => {
  it("shows the empty-state welcome message and never calls fetch for a brand-new learner", () => {
    render(
      <CoachCard learnerId={LEARNER_ID} audience="learner" hasData={false} />,
    );

    expect(screen.getByText(/Complete your first mission/)).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("shows a loading skeleton before the fetch resolves", () => {
    vi.mocked(fetch).mockReturnValue(new Promise(() => {}));

    render(
      <CoachCard learnerId={LEARNER_ID} audience="learner" hasData={true} />,
    );

    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("fetches the coach endpoint for the given learner and audience on mount", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(aiResult));

    render(
      <CoachCard learnerId={LEARNER_ID} audience="parent" hasData={true} />,
    );

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        `/api/learners/${LEARNER_ID}/coach?audience=parent`,
      );
    });
  });

  it("renders the AI-generated badge, headline, and message on success", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(aiResult));

    render(
      <CoachCard learnerId={LEARNER_ID} audience="learner" hasData={true} />,
    );

    expect(await screen.findByText("AI Generated")).toBeInTheDocument();
    expect(screen.getByText("Great progress this week!")).toBeInTheDocument();
    expect(
      screen.getByText("Keep practising a little every day."),
    ).toBeInTheDocument();
  });

  it("shows System Generated for a fallback response", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(fallbackResult));

    render(
      <CoachCard learnerId={LEARNER_ID} audience="learner" hasData={true} />,
    );

    expect(await screen.findByText("System Generated")).toBeInTheDocument();
  });

  it("shows strengths, focus areas, and recommendations for the parent audience only", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(aiResult));

    const { rerender } = render(
      <CoachCard learnerId={LEARNER_ID} audience="parent" hasData={true} />,
    );

    expect(await screen.findByText("Strengths")).toBeInTheDocument();
    expect(screen.getByText("Vocabulary")).toBeInTheDocument();
    expect(screen.getByText("Focus Areas")).toBeInTheDocument();
    expect(screen.getByText("Fractions")).toBeInTheDocument();
    expect(
      screen.getByText("Recommendations & Home Support"),
    ).toBeInTheDocument();

    rerender(
      <CoachCard learnerId={LEARNER_ID} audience="learner" hasData={true} />,
    );
    await screen.findByText("Great progress this week!");
    expect(screen.queryByText("Strengths")).not.toBeInTheDocument();
  });

  it("shows an error message when the request fails", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ error: "boom" }, false));

    render(
      <CoachCard learnerId={LEARNER_ID} audience="learner" hasData={true} />,
    );

    expect(
      await screen.findByText(/couldn't load today's coaching message/),
    ).toBeInTheDocument();
  });

  it("re-fetches with forceRefresh=true when the refresh button is clicked", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValue(jsonResponse(aiResult));

    render(
      <CoachCard learnerId={LEARNER_ID} audience="learner" hasData={true} />,
    );

    await screen.findByText("Great progress this week!");
    await user.click(screen.getByRole("button", { name: "Refresh" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenLastCalledWith(
        `/api/learners/${LEARNER_ID}/coach?audience=learner&forceRefresh=true`,
      );
    });
  });

  it("discards a stale in-flight response if the learner changes before it resolves", async () => {
    let resolveFirst: (value: Response) => void = () => {};
    const firstRequest = new Promise<Response>((resolve) => {
      resolveFirst = resolve;
    });
    const OTHER_LEARNER_ID = "323e4567-e89b-12d3-a456-426614174000";
    vi.mocked(fetch)
      .mockReturnValueOnce(firstRequest)
      .mockResolvedValueOnce(
        jsonResponse({ ...aiResult, headline: "Fresh headline" }),
      );

    const { rerender } = render(
      <CoachCard learnerId={LEARNER_ID} audience="learner" hasData={true} />,
    );
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

    // Simulates navigating to a different learner before the first
    // request settled — the effect's cleanup marks the first request
    // ignored and a new one starts for the new learner.
    rerender(
      <CoachCard
        learnerId={OTHER_LEARNER_ID}
        audience="learner"
        hasData={true}
      />,
    );
    await screen.findByText("Fresh headline");

    resolveFirst(jsonResponse({ ...aiResult, headline: "Stale headline" }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.getByText("Fresh headline")).toBeInTheDocument();
    expect(screen.queryByText("Stale headline")).not.toBeInTheDocument();
  });

  it("labels the refresh button 'Generate New Coaching' for the parent audience", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(aiResult));

    render(
      <CoachCard learnerId={LEARNER_ID} audience="parent" hasData={true} />,
    );

    expect(
      await screen.findByRole("button", { name: "Generate New Coaching" }),
    ).toBeInTheDocument();
  });
});
