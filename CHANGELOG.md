# Changelog

All notable changes to this project are documented here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/), grouped by shipped milestone rather than by individual commit — see `docs/ReleaseNotes.md` for the more detailed, chronological version, and `git log` for full commit history.

## v0.5.0 — Learning Intelligence (Mastery, Adaptive Missions, Parent Dashboard)

A single release boundary covering Phases 5.1–5.3: the deterministic learning-intelligence foundation — mastery scoring, adaptive mission generation, and the Parent Intelligence Dashboard — all non-AI, all independently tested. Everything after this (AI coaching, gamification, exam readiness) builds on this foundation rather than changing it; see `docs/Architecture.md` → "Planned: AI Gateway module" and "Planned: `learning-intelligence` facade" for the architectural decisions made ahead of that next stage.

### Added — mastery engine (Phase 5.1)

- Deterministic, explainable, non-AI mastery/confidence scoring per learner per skill (`learner_skill_mastery`), updated after every answered question.
- Per-skill review scheduling (`next_review_at`), recomputed from the updated mastery score after each attempt.
- Idempotent mastery processing hooked into answer submission — safe under retries and concurrent writes, and never fails the answer-submission request itself.
- Learner profile summary (overall mastery/accuracy, strongest/weakest subjects and skills, skills due for review) via `GET /api/learners/[learnerId]/mastery-summary`.
- A minimal "Learning Profile" section on `/learner/dashboard`.
- `scripts/backfill-learning-mastery.ts` (`npm run backfill:learning-mastery`) to compute mastery for questions answered before this feature existed.

### Added — adaptive mission generation (Phase 5.2)

- Deterministic, explainable adaptive daily mission generator (`src/modules/adaptive-learning/`) replacing the static 8/4/2/2 subject-interleave — questions chosen from weak skills, due reviews, curriculum coverage, and challenge, seeded per learner/date so the same inputs always produce the same mission.
- A balanced baseline mission path for learners with no mastery data yet.
- Recent-question cooldown (7 days by default), soft subject balancing, and mastery-driven difficulty targeting.
- `mission_items.selection_reason` and `missions.generation_strategy`/`generation_metadata` (`0009_phase5_adaptive_missions.sql`) for internal explainability — never exposed to the learner.
- A small "personalised for your learning" note on the dashboard's mission card.

### Added — Parent Intelligence Dashboard (Phase 5.3)

- Per-learner Parent Intelligence Dashboard (`/parent/learners/[learnerId]`, linked from `/parent/dashboard`): overall learning health (mastery, accuracy, questions answered, study time, streak, skills due for review), per-subject insights with qualitative labels (Excellent/Developing/Needs Practice), top-5 strongest/focus skills, a weekly progress table, session history with links back into the existing Review Mistakes screen, and a preview of tomorrow's likely mission focus (skill names only).
- A deterministic, rule-based recommendation engine (`src/modules/parent-dashboard/recommendation-engine.ts`) — no AI — returning up to 3 recommendations in a fixed priority order.
- Learning-streak calculation (current/longest/days learned this month) from completed mission history, computed consistently in UTC.
- `mastery-summary.ts`'s `pickTopSkills`/`buildSubjectSummaries` are now exported and reusable (with an optional `limit` for the former); `SubjectSummary` gained an `averageResponseMs` field — both reused by the new dashboard instead of being duplicated.
- No new tables for the dashboard — everything is derived from existing `learner_skill_mastery`/`missions`/`mission_items`/`question_attempts` data. See `docs/Architecture.md` → "Parent Intelligence Dashboard" for the metrics, recommendation rules, and known v1 limitations (the weekly "mastery change" and "total study time" figures are approximations pending a real `mastery_history` table).

### Removed

- The old static mission generator (`mission.generator.ts`, `mission.service.ts`) — fully superseded by the adaptive generator.

### Fixed

- `question_bank.skill_id` is now mandatory (`0008_backfill_question_skill.sql`), closing a gap where a topic gaining a second skill would have silently stopped mastery tracking for every question under it. `scripts/seedQuestions.ts` and `data/questions.json` now always supply it directly instead of relying on topic inference.

## v0.4.0 — First MVP milestone

### Added

- Mission generation
- Resume support
- Completion screen
- Review mistakes

### Fixed

- Resume starting at Question 1
- Dashboard progress
- Runtime environment validation

## v0.3.0 — Daily missions

- Deterministic daily mission generation: 16 questions per day, interleaved across Mathematics (8), English (4), Verbal Reasoning (2), Non-Verbal Reasoning (2), with no repeats.
- `missions` / `mission_items` / `question_attempts` schema, scoped end-to-end by Row Level Security.
- Server-side answer grading — the client never decides whether an answer is correct.
- Concurrency-safe "get or create today's mission."

## v0.2.0 — Curriculum foundation

- Curriculum catalogue (subjects, topics, skills, learning objectives), seeded with the initial 11+ content: 4 subjects, 16 topics, 16 skills.
- Per-learner, per-subject progress tracking.
- Curriculum browsing pages.

## v0.1.0 — Identity foundation

- Parent authentication (Supabase Auth).
- Parent-owned learner profiles, fully RLS-scoped.
- Repository scaffold: Next.js App Router, TypeScript, Tailwind, Vitest, Playwright, CI pipeline.
