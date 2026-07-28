# LDS-001 Clarifications — Stage 5, Learner Experience

Formal amendments to LDS-001 (Learning Design Specification, Release 0.7 Stage 5), recorded as they're decided rather than left as undocumented judgment calls in the implementation.

## Clarification 1 — Screen 4's "Done" button is not a compromise

**Context:** LDS-001's own mockup shows Screen 4 as `[Start]` leading directly into answering a live follow-up question. The current implementation shows the next-action text and a **Done** button that closes the flow, since a live, single-question answer-and-grade experience doesn't exist yet (today the app only grades within a full 16-question mission) — building it would be a new educational capability (question rendering, answer submission, grading, retry behaviour, transition back into the learning flow), not a presentation change, and Stage 5's brief explicitly excludes new educational logic.

**Decision:**

> Screen 4 should transition the learner toward the next learning activity. If a standalone adaptive question player does not yet exist, presenting the next action and ending the explanation flow is an acceptable implementation. When the standalone question player exists, Screen 4 naturally becomes "Now you try. Find 75% of 20. [Start]." Until then, "Done" is the correct implementation, not a compromise.

**Why:** one stage introduces one class of change — Release 0.7 has consistently kept persistence, API, and UI as separate stages; folding a live question-player subsystem into a UI stage would violate that same discipline it was just praised for following.

**How to apply:** do not treat Screen 4's current behaviour as a gap to close opportunistically in a later stage. Build a standalone adaptive single-question player only when it's independently justified (e.g. as its own capability, following the same PRS/TDS/Stage-gate process every other capability in this release has), and only then does Screen 4's `[Start]` button become live.

## Clarification 2 — Closure after completing an explanation

**Decision:** after Screen 4 closes via **Done**, the Review Mistakes list should mark that mistake's explanation as completed for the remainder of the session — giving the learner closure before choosing the next activity.

**Implementation:** `QuestionExplainerFlow` tracks a session-only (not persisted) `completed` flag, set only when the learner reaches Screen 4 and clicks **Done** — not by Escape, the ✕ close button, a backdrop click, or an error state. When set, a small "✓ Reviewed" badge appears next to that mistake's trigger button and remains even if the flow is reopened and closed early afterward.

**Why not persisted:** this is a within-session UI affordance, not a new analytics or backend concern — persisting "has this learner reviewed this mistake" durably would be new educational/product logic (tracking, possibly influencing future behaviour), which is exactly the class of change Stage 5 is scoped to exclude. If a durable version is wanted later, it should go through the same PRS/TDS process as everything else in this release, not be added quietly inside a UI stage.
