# DDS-001 — Documentation Development Standard

**Status**: Accepted
**Date**: 2026-07-28
**Scope**: Independent of any single release. Governs how new architectural concepts are admitted into Project Amreen's design going forward, starting with Release 0.8 and applying to every release after it.

## Purpose

Architectural concepts are long-lived and expensive to remove. DDS-001 establishes the minimum evidential standard required before introducing a new conceptual responsibility into the architecture. The goal is not to minimise abstraction, but to ensure that every abstraction earns its place through observable evidence and clearly defined ownership.

## 1. The Evidence Ladder

A new architectural concept should be traceable through seven rungs, in order. A concept that cannot be placed on a given rung with real evidence has not earned the rung above it.

1. **Observation** — a specific, concrete fact about the current system (a line of code, a data shape, a behaviour), not an opinion about it.
2. **Pattern** — the same kind of observation recurring in more than one place, independently.
3. **Architectural Seam** — the boundary in the system where the pattern shows something is currently unowned or fused together that doesn't have to be.
4. **Concept** — a name for what belongs at that seam.
5. **Responsibility** — a precise statement of what the concept owns and, as importantly, what it explicitly does not own.
6. **Invariant** — a rule that would be violated if the responsibility were compromised, stated so it can be checked.
7. **Implementation** — the concept's landing place in an actual design document.

### Worked example — Interpretation

1. **Observation** — three independent fusions of "what does this evidence mean" and "what should happen because of it," found by reading the current implementation: the adaptive selector's `masteryScore < 60 → weak_skill` categorisation; the recommendation engine's `confidenceGap >= 10 → recommend slowing down`, which also fuses in parent-facing wording via `{ type, message }`; and `computeNextReviewAt`'s `masteryScore < 40 → schedule review in 1 day` fixed-band lookup (ACB-001 §3.3).
2. **Pattern** — the same fusion, in three subsystems built at different times, none aware of the others. Not a one-off shortcut in a single function.
3. **Architectural Seam** — nowhere in the codebase does "what this evidence means" exist as a value in its own right; it is always collapsed directly into "what to do about it" at the point of computation.
4. **Concept** — Educational Interpretation: the act of assigning meaning to evidence, independent of any decision made from that meaning.
5. **Responsibility** — Interpretation owns turning raw evidence into a judgement (e.g. "this skill is weak"). It does not own what happens next — that is Educational Policy — and it does not own how a judgement is phrased for a learner or parent — that is Communication, beyond the Representation Boundary.
6. **Invariant** — Interpretation shall not own policy: an interpretation value must be able to exist and be inspected without any policy having yet been applied to it.
7. **Implementation** — Educational Intelligence Core (TDS-008A).

### Worked example — Sequencing

1. **Observation** — mission generation produces exactly one day at a time (ACB-001 capability inventory, "Mission generation: Daily only"); the parent dashboard's "tomorrow" preview independently re-runs the same daily selector for display and never persists or feeds back into it (ACB-001 evidence-flow map); no table in `supabase/migrations/` represents a plan, schedule, or sequence spanning more than one `mission_date` (ACB-001 §3.5).
2. **Pattern** — every existing attempt at reasoning "beyond today" is a one-way, non-persistent re-run of the same single-day logic, not a genuine extension of it. This shows up in generation and in the dashboard preview independently.
3. **Architectural Seam** — the boundary between "select today's questions" and "reason about a learner's trajectory across multiple days" is currently unowned; nothing in the system sits there.
4. **Concept** — Educational Sequencing: reasoning about the order and pacing of educational content across time, distinct from a single day's selection.
5. **Responsibility** — Sequencing owns multi-day/multi-session pacing decisions, consuming Educational Policy's per-skill decisions as input. It does not itself perform per-question selection.
6. **Invariant** — Sequencing shall not perform per-question selection directly; it operates only on Policy's output, never on raw evidence.
7. **Implementation** — Educational Intelligence Core (TDS-008A).

## 2. The Architectural Admission Rule

A proposed concept may be admitted into the architecture only once all four are true:

- **Observed** — grounded in specific, cited evidence from the current system, not intuition about how the system "should" work.
- **Repeated** — the pattern behind it appears more than once, independently.
- **Necessary** — it resolves a real seam identified in the codebase, not a hypothetical future one.
- **Ownable** — its responsibility can be stated precisely enough that a reviewer could say what it does _not_ own.

"It feels cleaner" and "we'll probably need it later" do not satisfy this rule on their own.

## 3. How to apply this document

When reviewing a proposed concept in a PRS, AR, or TDS: walk it up the ladder. If it cannot be placed on a rung with real evidence, it has not earned the rung above it, and the review should stop there rather than proceed on the assumption that later stages will retroactively justify it. This is what an architecture review checkpoint (e.g. an AR-0xx stage) is for.

## 4. Relationship to other documents

An Architecture Decision Record (ADR) records the outcome of applying this standard to a specific decision — what was decided, why, and what evidence supported it — as a historical record that does not change. This document defines the standard itself and is expected to remain the reference point across releases; a PRS or TDS proposing a new architectural concept should be able to cite the rung it has reached under this ladder.
