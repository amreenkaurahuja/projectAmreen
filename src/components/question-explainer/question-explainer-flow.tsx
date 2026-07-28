"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type {
  ExplanationExitMethod,
  ExplanationStep,
} from "@/modules/question-explainer/explanation-event.types";
import type { LearningEventPublisher } from "@/modules/question-explainer/explanation-event-publisher";
import { defaultLearningEventPublisher } from "@/modules/question-explainer/default-learning-event-publisher";

// The public /api/v1/question-explanations response contract (see
// src/app/api/v1/question-explanations/route.ts) — duplicated here rather
// than imported from a server-only module, since this is a "use client"
// component and the API contract is the actual boundary this component is
// meant to depend on, not the server's internal types.
interface QuestionExplanationWorkedExample {
  problem: string;
  steps: string[];
  answer: string;
}

interface QuestionExplanationResponse {
  acknowledgement: string;
  mistakeExplanation: string;
  keyConcept: string;
  workedExample: QuestionExplanationWorkedExample;
  nextAction: { type: "linked-question" | "review-skill"; text: string };
}

interface ExplanationApiResult {
  source: "ai" | "fallback";
  cached: boolean;
  response: QuestionExplanationResponse;
  followUpQuestionId: string | null;
  generatedAt: string;
}

type Screen = "acknowledge" | "explain" | "example" | "next";

type FetchState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "loaded"; result: ExplanationApiResult };

const READING_MODE_STYLE: React.CSSProperties = {
  fontFamily: "Verdana, Arial, sans-serif",
  letterSpacing: "0.02em",
  lineHeight: 1.8,
};

// Every button gets an explicit, high-contrast focus ring rather than
// relying on the browser default (which some Tailwind/reset setups
// suppress, and which is too faint to reliably meet WCAG AA on a black
// button) — keyboard navigation must always be visibly obvious here.
const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-600";
const PRIMARY_BUTTON_CLASS = `mt-6 w-full rounded-xl bg-neutral-950 px-6 py-3 font-semibold text-white ${FOCUS_RING}`;
const SECONDARY_BUTTON_CLASS = `rounded-full border px-3 py-1 text-xs font-medium hover:bg-neutral-50 ${FOCUS_RING}`;

// TDS-008 §6 — the component's own state names stay implementation detail;
// this is the one place they're mapped onto the public event vocabulary.
const STEP_EVENT_NAME: Record<Screen, ExplanationStep> = {
  acknowledge: "acknowledge",
  explain: "explain",
  example: "worked_example",
  next: "next_step",
};

/**
 * LDS-001's four-screen progressive learning flow: acknowledge the mistake
 * (already-known data, instant) -> explain the key concept (fetched) ->
 * worked example -> transition. One screen, one job, one primary action —
 * no competing buttons, no sidebars (LDS-001 Principle 7).
 *
 * Deliberately does not render `response.mistakeExplanation` anywhere:
 * LDS-001's own Screen 1 mockup is explicit that the acknowledge screen
 * shows "nothing else" beyond the answer comparison already visible on the
 * Review Mistakes list — that structured red/green comparison already *is*
 * the mistake explanation in its lowest-cognitive-load form, so the AI
 * text field naming the same thing again would be exactly the "explanation
 * + worked example + encouragement all fighting for attention" LDS-001
 * argues against.
 *
 * TDS-008 Stage 6.1: publishes educational-milestone events through
 * `publisher` (default: a no-op — see explanation-event-publisher.ts).
 * Every `publisher.publish(...)` call below is fire-and-forget and never
 * gates or delays a state transition; the four-screen flow above behaves
 * identically whether a real publisher is wired in or not (AP-1).
 *
 * TDS-008 Stage 6.3A: each event gets its own `eventId` via
 * `crypto.randomUUID()` at the exact point it's constructed below — this
 * is the one and only place an event's identity is ever assigned (§10.8).
 *
 * TDS-008 Stage 6.3C: `publisher` defaults to
 * `defaultLearningEventPublisher` — the no-op or the real HTTP publisher,
 * chosen by `isQuestionExplainerMetricsEnabled()` — rather than always
 * the no-op. An explicitly supplied `publisher` (every existing test)
 * still always wins; this only changes what an *unwired* caller gets.
 */
export function QuestionExplainerFlow({
  attemptId,
  selectedOptionLabel,
  correctOptionLabel,
  publisher = defaultLearningEventPublisher,
}: {
  attemptId: string;
  selectedOptionLabel: string;
  correctOptionLabel: string;
  publisher?: LearningEventPublisher;
}) {
  const [open, setOpen] = useState(false);
  const [screen, setScreen] = useState<Screen>("acknowledge");
  const [fetchState, setFetchState] = useState<FetchState | null>(null);
  const [readingMode, setReadingMode] = useState(false);
  // Session-only, not persisted — a completed-this-session affordance per
  // the Stage 5 review's request for closure before the learner picks a
  // next activity, not a new analytics/backend concern (LDS-001
  // clarification, Release 0.7). Only set true by reaching Screen 4 and
  // clicking "Done" — closing early (Escape, backdrop, the ✕, or an error)
  // never marks the explanation reviewed.
  const [completed, setCompleted] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const headingId = useId();

  // TDS-008 §5/§10: one mounted flow instance = one metrics session, whose
  // lifetime exactly matches openFlow()..close()/finish() — refs, not
  // state, since none of these should ever trigger a re-render on their
  // own and every one of them must read as "current" from inside a
  // useEffect cleanup (unmount) without going stale.
  const sessionIdRef = useRef("");
  const openedAtRef = useRef(0);
  const sessionCompletedRef = useRef(false);
  const lastStepRef = useRef<ExplanationStep>("acknowledge");
  const isOpenRef = useRef(false);

  function resetDialogState() {
    setOpen(false);
    isOpenRef.current = false;
    setScreen("acknowledge");
    setFetchState(null);
    triggerRef.current?.focus();
  }

  const close = useCallback(
    (exitMethod: ExplanationExitMethod) => {
      if (!sessionCompletedRef.current) {
        publisher.publish({
          eventId: crypto.randomUUID(),
          eventType: "explanation_abandoned",
          attemptId,
          sessionId: sessionIdRef.current,
          lastStep: lastStepRef.current,
          exitMethod,
          durationMs: Date.now() - openedAtRef.current,
          occurredAt: new Date().toISOString(),
        });
      }
      resetDialogState();
    },
    [attemptId, publisher],
  );

  function openFlow() {
    sessionIdRef.current = crypto.randomUUID();
    openedAtRef.current = Date.now();
    sessionCompletedRef.current = false;
    lastStepRef.current = "acknowledge";
    isOpenRef.current = true;
    setOpen(true);
    setScreen("acknowledge");

    publisher.publish({
      eventId: crypto.randomUUID(),
      eventType: "explanation_opened",
      attemptId,
      sessionId: sessionIdRef.current,
      occurredAt: new Date().toISOString(),
    });
    publisher.publish({
      eventId: crypto.randomUUID(),
      eventType: "step_viewed",
      attemptId,
      sessionId: sessionIdRef.current,
      step: "acknowledge",
      occurredAt: new Date().toISOString(),
    });
  }

  function finish() {
    sessionCompletedRef.current = true;
    publisher.publish({
      eventId: crypto.randomUUID(),
      eventType: "explanation_completed",
      attemptId,
      sessionId: sessionIdRef.current,
      durationMs: Date.now() - openedAtRef.current,
      occurredAt: new Date().toISOString(),
    });
    setCompleted(true);
    resetDialogState();
  }

  function viewStep(screenName: Screen) {
    lastStepRef.current = STEP_EVENT_NAME[screenName];
    publisher.publish({
      eventId: crypto.randomUUID(),
      eventType: "step_viewed",
      attemptId,
      sessionId: sessionIdRef.current,
      step: STEP_EVENT_NAME[screenName],
      occurredAt: new Date().toISOString(),
    });
  }

  async function requestExplanation() {
    setScreen("explain");
    setFetchState({ status: "loading" });
    try {
      const response = await fetch("/api/v1/question-explanations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ attemptId, audience: "learner" }),
      });
      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }
      const result = (await response.json()) as ExplanationApiResult;
      setFetchState({ status: "loaded", result });
      // "explain" is only genuinely viewed once there's something to read —
      // not the moment the loading skeleton appears (LDS-002 §5.2).
      viewStep("explain");
    } catch {
      setFetchState({ status: "error" });
    }
  }

  // Escape closes; Tab is trapped inside the dialog while it's open — this
  // codebase has no existing dialog primitive to reuse (see LDS-001 Stage 5
  // research), so this is a small, self-contained implementation rather
  // than a new generic <Dialog> component (ARS-001 §10 — no abstraction
  // before a second consumer needs one).
  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        close("escape");
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, close]);

  // Moves focus to the new screen's content on open and on every screen
  // transition, so a screen-reader user is told what changed (LDS-001
  // Principle 3 — never ask the learner to hold more than one screen's
  // worth of information in mind at once; this is the accessibility
  // equivalent of that for anyone not reading visually).
  useEffect(() => {
    if (open) contentRef.current?.focus();
  }, [open, screen, fetchState?.status]);

  // TDS-008 §5.4 exitMethod "unmount": the learner navigates away (e.g. the
  // review page's dashboard link) while the flow is still open. Reads refs
  // only, deliberately — a stale closure here is fine because every value
  // read is a ref, never state, so this always sees the latest values at
  // the moment the component actually unmounts, regardless of when this
  // effect itself last ran. "navigation" (a full browser-level unload) is
  // out of scope for Stage 6.1 — it needs navigator.sendBeacon, which is a
  // delivery-mechanism decision that belongs to Stage 6.3, not the
  // publisher boundary.
  useEffect(() => {
    return () => {
      if (isOpenRef.current && !sessionCompletedRef.current) {
        publisher.publish({
          eventId: crypto.randomUUID(),
          eventType: "explanation_abandoned",
          attemptId,
          sessionId: sessionIdRef.current,
          lastStep: lastStepRef.current,
          exitMethod: "unmount",
          durationMs: Date.now() - openedAtRef.current,
          occurredAt: new Date().toISOString(),
        });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          ref={triggerRef}
          type="button"
          onClick={openFlow}
          className={`rounded-xl border px-4 py-2 text-sm font-semibold hover:bg-neutral-50 ${FOCUS_RING}`}
        >
          Why did I get this wrong?
        </button>
        {completed && (
          <span className="inline-flex items-center gap-1 text-sm font-medium text-green-700">
            <span aria-hidden="true">✓</span> Reviewed
          </span>
        )}
      </div>

      {open && (
        // The backdrop closes on click; the dialog itself stops that click
        // from bubbling, so clicking inside never closes it.
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/50 p-4"
          onClick={() => close("backdrop")}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={headingId}
            onClick={(event) => event.stopPropagation()}
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl bg-white p-6 shadow-xl"
          >
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setReadingMode((value) => !value)}
                aria-pressed={readingMode}
                className={SECONDARY_BUTTON_CLASS}
              >
                {readingMode ? "Standard text" : "Easier to read"}
              </button>
              <button
                type="button"
                onClick={() => close("close_button")}
                aria-label="Close explanation"
                className={SECONDARY_BUTTON_CLASS}
              >
                ✕
              </button>
            </div>

            <div
              ref={contentRef}
              tabIndex={-1}
              className="mt-4 transition-opacity duration-150 outline-none motion-reduce:transition-none"
              style={readingMode ? READING_MODE_STYLE : undefined}
            >
              {screen === "acknowledge" && (
                <>
                  <h2 id={headingId} className="text-2xl font-bold">
                    <span aria-hidden="true">❌</span> Not quite
                  </h2>
                  <div className="mt-4 grid gap-2 text-base">
                    <p className="rounded-xl bg-red-50 px-4 py-3 text-red-700">
                      You answered: <strong>{selectedOptionLabel}</strong>
                    </p>
                    <p className="rounded-xl bg-green-50 px-4 py-3 text-green-700">
                      Correct answer: <strong>{correctOptionLabel}</strong>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={requestExplanation}
                    className={PRIMARY_BUTTON_CLASS}
                  >
                    Why?
                  </button>
                </>
              )}

              {screen === "explain" && (
                <div aria-live="polite">
                  {fetchState?.status === "loading" && (
                    <div
                      role="status"
                      aria-label="Loading explanation"
                      className="animate-pulse space-y-3"
                    >
                      <div className="h-4 w-1/3 rounded bg-neutral-200" />
                      <div className="h-4 w-full rounded bg-neutral-200" />
                      <div className="h-4 w-2/3 rounded bg-neutral-200" />
                    </div>
                  )}
                  {fetchState?.status === "error" && (
                    <>
                      <h2 id={headingId} className="text-2xl font-bold">
                        Hmm
                      </h2>
                      <p className="mt-3 text-neutral-700">
                        We couldn&apos;t load this explanation right now. Please
                        try again shortly.
                      </p>
                      <button
                        type="button"
                        onClick={() => close("error")}
                        className={`mt-6 rounded-xl border px-4 py-2 text-sm font-semibold hover:bg-neutral-50 ${FOCUS_RING}`}
                      >
                        Close
                      </button>
                    </>
                  )}
                  {fetchState?.status === "loaded" && (
                    <>
                      <h2 id={headingId} className="text-2xl font-bold">
                        Why?
                      </h2>
                      <p className="mt-2 text-sm text-neutral-600">
                        {fetchState.result.response.acknowledgement}
                      </p>
                      <p className="mt-4 text-lg leading-relaxed text-neutral-800">
                        {fetchState.result.response.keyConcept}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          viewStep("example");
                          setScreen("example");
                        }}
                        className={PRIMARY_BUTTON_CLASS}
                      >
                        Let&apos;s see one
                      </button>
                    </>
                  )}
                </div>
              )}

              {screen === "example" && fetchState?.status === "loaded" && (
                <>
                  <h2 id={headingId} className="text-2xl font-bold">
                    Let&apos;s see one
                  </h2>
                  <p className="mt-3 text-lg font-semibold text-neutral-900">
                    {fetchState.result.response.workedExample.problem}
                  </p>
                  <ol className="mt-4 space-y-3">
                    {fetchState.result.response.workedExample.steps.map(
                      (step, index) => (
                        <li key={index} className="rounded-xl border p-3">
                          <span className="text-sm font-semibold text-neutral-500">
                            Step {index + 1}
                          </span>
                          <p className="mt-1 text-base text-neutral-800">
                            {step}
                          </p>
                        </li>
                      ),
                    )}
                  </ol>
                  <p className="mt-4 rounded-xl bg-green-50 px-4 py-3 text-green-700">
                    Answer:{" "}
                    <strong>
                      {fetchState.result.response.workedExample.answer}
                    </strong>
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      viewStep("next");
                      setScreen("next");
                    }}
                    className={PRIMARY_BUTTON_CLASS}
                  >
                    Now you try
                  </button>
                </>
              )}

              {screen === "next" && fetchState?.status === "loaded" && (
                <>
                  <h2 id={headingId} className="text-2xl font-bold">
                    Now you try
                  </h2>
                  <p className="mt-3 text-lg text-neutral-800">
                    {fetchState.result.response.nextAction.text}
                  </p>
                  <button
                    type="button"
                    onClick={finish}
                    className={PRIMARY_BUTTON_CLASS}
                  >
                    Done
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
