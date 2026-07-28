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

// TDS-008 Stage 6.3C — the mirror of
// question-explainer-flow-metrics-enabled.test.tsx: proves the default
// stays the no-op publisher (no network request at all) when the flag is
// absent or malformed, not just when it's explicitly "false". Uses a
// dynamic import for the same reason as that file — the flag is read once
// at module load inside default-learning-event-publisher.ts, so it must
// be set (here: deliberately left malformed) before that module's first
// import in this file's isolated registry.

const ATTEMPT_ID = "223e4567-e89b-12d3-a456-426614174000";

let QuestionExplainerFlow: typeof QuestionExplainerFlowType;
let previousFlagValue: string | undefined;

beforeAll(async () => {
  previousFlagValue =
    process.env.NEXT_PUBLIC_QUESTION_EXPLAINER_METRICS_ENABLED;
  // Deliberately malformed, not simply absent — proves "absent or invalid"
  // both resolve to disabled, not just the unset case.
  process.env.NEXT_PUBLIC_QUESTION_EXPLAINER_METRICS_ENABLED = "1";
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

describe("QuestionExplainerFlow with metrics flag malformed/absent (default publisher = no-op)", () => {
  it("makes no request to /api/v1/learning-events across a full learner interaction", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(() =>
      Promise.reject(new Error("fetch should not be called at all")),
    );
    vi.stubGlobal("fetch", fetchMock);

    renderFlow();

    await user.click(
      screen.getByRole("button", { name: "Why did I get this wrong?" }),
    );
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("behaves exactly like before Stage 6.3C — no learner-visible difference from the no-op default", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("should not be reached"))),
    );

    renderFlow();

    const trigger = screen.getByRole("button", {
      name: "Why did I get this wrong?",
    });
    await user.click(trigger);
    expect(screen.getByText(/Not quite/)).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(trigger).toHaveFocus();
  });
});
