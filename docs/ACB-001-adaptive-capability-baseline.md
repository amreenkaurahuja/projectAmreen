# ACB-001 — Adaptive Capability Baseline

**Status**: Accepted
**Date**: 2026-07-28
**Scope**: Stage 0 audit of adaptive-learning, mastery, review-scheduling, and parent-facing recommendation capabilities as they exist at `v0.7.0-rc.1`

## Purpose

This document records the verified adaptive-learning capabilities present in Project Amreen immediately following Release 0.7 (`v0.7.0-rc.1`). It is evidence-based and intentionally descriptive. It defines the baseline against which future product requirements (beginning with PRS-008) should be evaluated. It does not propose new functionality or prescribe implementation approaches.

A future contributor should be able to read this document and answer "what exists today?" without any influence from what a later release intends to build. Product intent belongs in the PRS that follows; technical design belongs in the TDS that follows that.

## 1. Capability inventory

| Capability                           | Exists  | Quality | Limitation                                                                                                                                                                                                                                                                                                                     | Opportunity                                                                                               |
| ------------------------------------ | ------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| Weak-skill targeting                 | ✅      | Mature  | Category weighting is hardcoded and static — `weakSkill: 7, reviewDue: 4, curriculumCoverage: 3, challenge: 2` (16 slots), identical for every learner, every day, never adjusted by outcome                                                                                                                                   | Adaptive/dynamic weighting driven by how well the current allocation is actually working for that learner |
| Mastery-driven difficulty            | ✅      | Mature  | Difficulty bands are fixed thresholds (mastery 0/40/60/80) used only as a soft ranking tiebreaker, never a hard filter; entirely blind to anything happening within the current session                                                                                                                                        | Difficulty that responds to live signals, not just the standing mastery score                             |
| Review scheduling (`next_review_at`) | ✅ (v1) | Basic   | A fixed lookup table (mastery band → 1/3/7/14/30 days), not a spaced-repetition/forgetting-curve model — no increasing intervals per successful review, no per-skill review history beyond the current score                                                                                                                   | A genuine forgetting/spaced-repetition model                                                              |
| Incorrect-streak tracking            | ✅      | Basic   | Tracked and correctly computed, but feeds only a same-transaction mastery-score penalty. Structurally invisible to mission generation — the selector's own data shape (`RawMasteryRow`) does not include the field, so it cannot influence question selection even in principle                                                | A live intervention trigger                                                                               |
| Parent recommendations               | ✅      | Mature  | Single-dimensional by design: five independent rules, each reasoning over exactly one signal (mastery score / review-due date / mastery-vs-confidence gap / aggregate response time) on one skill or a simple aggregate — no rule crosses two skills, and none cross a skill signal with a question-format/presentation factor | Multi-factor educational reasoning                                                                        |
| Mission generation                   | ✅      | Mature  | Daily only. The one "beyond today" view (a parent-dashboard preview) is explicitly non-persistent and one-way — it re-derives a preview from the same selector logic, but nothing is ever written, and the real generator never reads the preview back                                                                         | Forward-looking, persisted planning                                                                       |

## 2. Evidence-flow map

```
Question attempt
      │
      ▼
Mastery update (one deterministic function)
      │
      ├──▶ Review scheduling (next_review_at)  ──────────┐
      │                                                    │
      └──▶ Incorrect-streak update  ─── dead end            │
           (feeds only this update's own mastery penalty;   │
            invisible to everything downstream)             │
                                                              ▼
                                                    learner_skill_mastery
                                                     (mastery_score, next_review_at,
                                                      total_attempts persisted)
                                                         │              │
                                                         ▼              ▼
                                              Mission selection   Parent dashboard
                                              (reads mastery_score,  (reads mastery_score,
                                               total_attempts,       next_review_at,
                                               next_review_at)       confidence_score →
                                                                      recommendations)

learning_events (question-explainer only) — isolated pipeline, no link in or out.
  Not just observational by design: it currently has zero wired consumers anywhere
  in the app. The reporting repository/calculation service exist but nothing calls them.

Parent dashboard → mission selection: no real link. The dashboard's "tomorrow" preview
  independently re-runs the selector for display; it never influences the actual generator.
```

## 3. Diagnostic findings

**3.1 — The incorrect-streak signal cannot reach mission generation without new plumbing, not just a flag flip.** `current_incorrect_streak` is computed and persisted correctly, but the data type the adaptive selector reads (`RawMasteryRow`, `candidate-builder.ts`) does not carry the field at all. Any capability that wants mission generation to react to a recent bad run needs to extend that data shape before any decision logic can use it.

**3.2 — A narrow precedent for in-the-moment difficulty adjustment already exists.** The question-explainer's follow-up-question selector picks one question, one difficulty step down from the question just missed, same skill only. It does not consult mastery score, incorrect streak, or any other signal, and it operates outside the daily mission generator entirely. It is a real but narrowly-scoped existing pattern for "difficulty responds to what just happened."

**3.3 — Both existing pipelines currently go directly from a raw deterministic signal to their final output, with no intermediate representation of _why_.** The adaptive selector evaluates a signal (e.g. `masteryScore < 60`) and immediately assigns a mission category — there is no persisted or transient object describing the interpretation behind that assignment. The recommendation engine goes further and combines the decision and its audience-specific wording in a single `{ type, message }` value — the parent-facing sentence _is_ the decision, with nothing separating "what was concluded" from "how it was phrased for a parent." These are two independent instances of the same absence, observed in two unrelated subsystems built at different times.

**3.4 — The learning-metrics reporting read-model (Stage 6.4B) has no live consumer.** `SupabaseQuestionExplainerMetricsRepository` and `calculateQuestionExplainerMetrics` exist, are fully tested, and are wired to real persisted data, but no route, page, or script in the application currently calls them. Whether behavioural interaction data should ever inform educational decisions remains open architecturally, not just as a matter of product scope — no code path exists today that would need to be reconciled with such a decision either way.

**3.5 — No persisted multi-day planning concept exists anywhere in the schema.** Every table in `supabase/migrations/` was reviewed; none represents a plan, schedule, or sequence spanning more than one `mission_date`.

## 4. What this document does not claim

This baseline does not assert that any of the limitations above should be resolved, in what order, or by what mechanism. It does not define new domain concepts, propose an architecture, or estimate effort. Those are the responsibility of the PRS and TDS documents that reference this baseline as evidence.
