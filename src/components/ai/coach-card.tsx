"use client";

import { useEffect, useState } from "react";
import type { Audience } from "@/modules/ai/coach/coach.types";

interface CoachResult {
  headline: string;
  message: string;
  strengths: string[];
  focusAreas: string[];
  nextSteps: string[];
  source: "ai" | "fallback";
  cached: boolean;
}

type CardState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "loaded"; result: CoachResult };

const HEADINGS: Record<Audience, string> = {
  learner: "⭐ Today's Coach",
  parent: "AI Learning Summary",
};

const REFRESH_LABELS: Record<Audience, string> = {
  learner: "Refresh",
  parent: "Generate New Coaching",
};

/**
 * Fetches GET /api/learners/[learnerId]/coach client-side rather than
 * server-rendering it with the rest of the page: a cache miss can take up
 * to a couple of seconds (a real Gemini call), and this card is the only
 * thing that should wait on that — not the mission card, subjects, or
 * anything else already rendered above it. A brand-new learner
 * (`hasData: false`) never triggers a request at all — see the empty-state
 * branch below.
 */
export function CoachCard({
  learnerId,
  audience,
  hasData,
}: {
  learnerId: string;
  audience: Audience;
  hasData: boolean;
}) {
  const [state, setState] = useState<CardState>({ status: "loading" });
  const [refreshNonce, setRefreshNonce] = useState(0);

  // Fetches on mount/prop change (initial load) and again whenever
  // handleRefreshClick bumps refreshNonce. The `ignored` guard follows
  // React's own recommended pattern for effects that fetch data: it
  // discards a stale response if the effect re-runs (or the component
  // unmounts) before the request settles, and every setState call happens
  // after an `await`, asynchronously relative to the effect itself.
  useEffect(() => {
    if (!hasData) return;
    let ignored = false;

    async function requestCoach() {
      try {
        const params = new URLSearchParams({ audience });
        if (refreshNonce > 0) params.set("forceRefresh", "true");
        const response = await fetch(
          `/api/learners/${learnerId}/coach?${params.toString()}`,
        );
        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }
        const result = (await response.json()) as CoachResult;
        if (!ignored) setState({ status: "loaded", result });
      } catch {
        if (!ignored) setState({ status: "error" });
      }
    }

    void requestCoach();
    return () => {
      ignored = true;
    };
  }, [hasData, learnerId, audience, refreshNonce]);

  function handleRefreshClick() {
    setState({ status: "loading" });
    setRefreshNonce((n) => n + 1);
  }

  const heading = HEADINGS[audience];

  if (!hasData) {
    return (
      <section aria-labelledby="coach-heading" className="mt-9">
        <h2 id="coach-heading" className="text-xl font-semibold">
          {heading}
        </h2>
        <p className="mt-4 rounded-2xl border p-5 text-neutral-600">
          Welcome! Complete your first mission and we&apos;ll begin
          personalising your learning journey.
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby="coach-heading" className="mt-9">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="coach-heading" className="text-xl font-semibold">
          {heading}
        </h2>
        {state.status === "loaded" && (
          <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-700">
            {state.result.source === "ai" ? "AI Generated" : "System Generated"}
          </span>
        )}
      </div>

      <div className="mt-4 rounded-2xl border p-5">
        {state.status === "loading" && (
          <div
            role="status"
            aria-label="Loading coaching message"
            className="animate-pulse space-y-3"
          >
            <div className="h-4 w-1/3 rounded bg-neutral-200" />
            <div className="h-4 w-full rounded bg-neutral-200" />
            <div className="h-4 w-2/3 rounded bg-neutral-200" />
          </div>
        )}

        {state.status === "error" && (
          <p className="text-neutral-600">
            We couldn&apos;t load today&apos;s coaching message. Please try
            again shortly.
          </p>
        )}

        {state.status === "loaded" && (
          <>
            <p className="text-lg font-semibold">{state.result.headline}</p>
            <p className="mt-2 text-neutral-700">{state.result.message}</p>

            {audience === "parent" && (
              <div className="mt-4 space-y-4">
                <CoachList title="Strengths" items={state.result.strengths} />
                <CoachList
                  title="Focus Areas"
                  items={state.result.focusAreas}
                />
                <CoachList
                  title="Recommendations & Home Support"
                  items={state.result.nextSteps}
                />
              </div>
            )}

            <button
              type="button"
              onClick={handleRefreshClick}
              className="mt-5 rounded-xl border px-4 py-2 text-sm font-semibold hover:bg-neutral-50"
            >
              {REFRESH_LABELS[audience]}
            </button>
          </>
        )}
      </div>
    </section>
  );
}

function CoachList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="text-sm font-medium text-neutral-500">{title}</p>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-neutral-700">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
