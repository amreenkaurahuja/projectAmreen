import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QuestionExplainerFlow } from "@/components/question-explainer/question-explainer-flow";

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

function renderFlow() {
  return render(
    <QuestionExplainerFlow
      attemptId={ATTEMPT_ID}
      selectedOptionLabel="54"
      correctOptionLabel="60"
    />,
  );
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("QuestionExplainerFlow", () => {
  it("renders only the trigger button until opened, without calling fetch", () => {
    renderFlow();

    expect(
      screen.getByRole("button", { name: "Why did I get this wrong?" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("opens on Screen 1 (acknowledge) with already-known data, no fetch yet", async () => {
    const user = userEvent.setup();
    renderFlow();

    await user.click(
      screen.getByRole("button", { name: "Why did I get this wrong?" }),
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText(/Not quite/)).toBeInTheDocument();
    expect(screen.getByText("54")).toBeInTheDocument();
    expect(screen.getByText("60")).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fetches only when 'Why?' is clicked, posting attemptId and audience: learner", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValue(jsonResponse(API_RESULT));
    renderFlow();

    await user.click(
      screen.getByRole("button", { name: "Why did I get this wrong?" }),
    );
    await user.click(screen.getByRole("button", { name: "Why?" }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/question-explanations",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ attemptId: ATTEMPT_ID, audience: "learner" }),
      }),
    );
  });

  it("shows a loading state while the explanation is being fetched", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockReturnValue(new Promise(() => {}));
    renderFlow();

    await user.click(
      screen.getByRole("button", { name: "Why did I get this wrong?" }),
    );
    await user.click(screen.getByRole("button", { name: "Why?" }));

    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("walks through all four screens in order", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValue(jsonResponse(API_RESULT));
    renderFlow();

    await user.click(
      screen.getByRole("button", { name: "Why did I get this wrong?" }),
    );
    await user.click(screen.getByRole("button", { name: "Why?" }));

    expect(
      await screen.findByText("75% means three quarters."),
    ).toBeInTheDocument();
    expect(screen.getByText("Good try!")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Let's see one" }));
    expect(screen.getByText("Find 75% of 40.")).toBeInTheDocument();
    expect(screen.getByText("40 divided by 4 is 10.")).toBeInTheDocument();
    expect(screen.getByText("10 times 3 is 30.")).toBeInTheDocument();
    expect(screen.getByText("30")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Now you try" }));
    expect(
      screen.getByText("Try another question on percentages soon."),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("Reviewed")).toBeInTheDocument();
  });

  it("does not show 'Reviewed' when the flow is closed before completion", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValue(jsonResponse(API_RESULT));
    renderFlow();

    await user.click(
      screen.getByRole("button", { name: "Why did I get this wrong?" }),
    );
    await user.click(screen.getByRole("button", { name: "Why?" }));
    await screen.findByText("75% means three quarters.");
    await user.keyboard("{Escape}");

    expect(screen.queryByText("Reviewed")).not.toBeInTheDocument();
  });

  it("keeps showing 'Reviewed' after reopening and closing early again", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValue(jsonResponse(API_RESULT));
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

    await user.click(
      screen.getByRole("button", { name: "Why did I get this wrong?" }),
    );
    await user.click(screen.getByRole("button", { name: "Close explanation" }));

    expect(screen.getByText("Reviewed")).toBeInTheDocument();
  });

  it("returns focus to the trigger button on close", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValue(jsonResponse(API_RESULT));
    renderFlow();

    const trigger = screen.getByRole("button", {
      name: "Why did I get this wrong?",
    });
    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "Close explanation" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    renderFlow();

    await user.click(
      screen.getByRole("button", { name: "Why did I get this wrong?" }),
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes when the backdrop is clicked, but not when the dialog content is clicked", async () => {
    const user = userEvent.setup();
    renderFlow();

    await user.click(
      screen.getByRole("button", { name: "Why did I get this wrong?" }),
    );
    const dialog = screen.getByRole("dialog");

    await user.click(dialog);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    // The backdrop is the dialog's positioning parent — click it directly.
    await user.click(dialog.parentElement!);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows an error state and a way to close if the request fails", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ error: "boom" }, false));
    renderFlow();

    await user.click(
      screen.getByRole("button", { name: "Why did I get this wrong?" }),
    );
    await user.click(screen.getByRole("button", { name: "Why?" }));

    expect(
      await screen.findByText(/couldn't load this explanation/),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("toggles reading mode without changing the content", async () => {
    const user = userEvent.setup();
    renderFlow();

    await user.click(
      screen.getByRole("button", { name: "Why did I get this wrong?" }),
    );
    const toggle = screen.getByRole("button", { name: "Easier to read" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");

    await user.click(toggle);
    expect(
      screen.getByRole("button", { name: "Standard text" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/Not quite/)).toBeInTheDocument();
  });

  it("is a properly labelled, modal dialog", async () => {
    const user = userEvent.setup();
    renderFlow();

    await user.click(
      screen.getByRole("button", { name: "Why did I get this wrong?" }),
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-labelledby");
    const labelledBy = dialog.getAttribute("aria-labelledby");
    expect(document.getElementById(labelledBy!)).toHaveTextContent("Not quite");
  });

  it("resets back to screen 1 on re-open after a previous close", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValue(jsonResponse(API_RESULT));
    renderFlow();

    const trigger = screen.getByRole("button", {
      name: "Why did I get this wrong?",
    });
    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "Why?" }));
    await screen.findByText("75% means three quarters.");
    await user.click(screen.getByRole("button", { name: "Close explanation" }));

    await user.click(trigger);
    expect(screen.getByText(/Not quite/)).toBeInTheDocument();
    expect(
      screen.queryByText("75% means three quarters."),
    ).not.toBeInTheDocument();
  });
});
