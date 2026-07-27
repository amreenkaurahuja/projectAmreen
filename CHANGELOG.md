# Changelog

All notable changes to this project are documented here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/), grouped by shipped milestone rather than by individual commit — see `docs/ReleaseNotes.md` for the more detailed, chronological version, and `git log` for full commit history.

## Unreleased

### Changed — Release 0.6 hardening (Sprint 1.5, post-completion-audit)

- Removed `LEARNER_PROMPT_VERSION`/`PARENT_PROMPT_VERSION` — two unused exports that had suggested the prompt builders owned their own version identity, when only `coach/context-builder.ts`'s `PROMPT_VERSION` constant actually does (found by a completion audit, SDS-002). No behavior change — the working cache-invalidation mechanism (`promptVersion` embedded in the hashed DTO) was already correct; this removes the misleading duplication around it.
- Added prompt-injection regression tests (`ai-prompts.test.ts`) — the untrusted-data mitigation existed with no test guarding it; now covers both audiences' system prompts and verifies adversarial learner/skill data can't break out of its JSON string.
- `docs/ReleaseReadiness.md` — a one-page release-gate matrix (Architecture/Database/Security/Performance/AI/Testing/Documentation/Operations), filled in for Release 0.6.
- `docs/Roadmap.md` — added Rule 13: no new feature work while a Testing/Documentation/Security/Architecture category is below ✅ in the readiness matrix.

### Changed — AI Platform foundation hardening

- `shared/ai-config.ts` (`readAiConfigFromEnv`/`AiConfig`) and `shared/feature-flags.ts` (`isAiEnabled`/`isCoachEnabledForAudience`) consolidate generation parameters (temperature, max tokens, timeout) and env-var flag reads into two single-purpose modules — no behavior change, `gemini-provider.ts` and `gateway-factory.ts` now read from these instead of duplicating constants/`process.env` reads. See `docs/AI_PLATFORM.md` → "Configuration and Feature Flags" for what was and wasn't added, and why (no barrel exports, no umbrella error class — both deliberately kept consistent with existing project convention rather than introduced for this module alone).

### Added — AI Platform (Phase 5.4, Parts 1–3)

- `src/modules/ai/` — a full, provider-agnostic AI coaching platform: the `LearnerCoachingContext` DTO and its strict Zod validation, a `ContextBuilder` that assembles one from the existing `ParentDashboardService`/`MissionCompletionService` (no duplicated calculations), versioned learner/parent prompt builders, a `Gemini`-backed `AiGateway` implementation (`@google/genai`, isolated to a single `providers/gemini-provider.ts` file), a two-stage response validator (shape) and grounding validator (content — every claimed strength/focus-area/next-step and every number the response states must trace back to the DTO; banned diagnostic/comparative/predictive/ranking language; no excessive study-time advice; no percentages for the learner audience; an 80/160-word budget), and a deterministic non-AI `fallback-coach.ts`.
- `ai_coaching_messages` table (`0010_phase5_ai_learning_coach.sql`) — caches one accepted AI response per learner/audience/context-hash, with `ON CONFLICT`-safe handling for concurrent requests (a losing insert re-reads the winning row instead of erroring).
- `AiCoachService` (`coach/ai-coach.service.ts`) — the single orchestrator: build+validate DTO → hash → cache lookup → Gemini on a miss → validate → ground → persist → fall back at any failure point (disabled, missing credentials, timeout, 429, malformed JSON, failed validation/grounding all degrade to the deterministic fallback; only a genuine ownership error propagates).
- `GET /api/learners/[learnerId]/coach?audience=learner|parent` — the platform's first real caller. Returns `{headline, message, strengths, focusAreas, nextSteps, source, cached}`; never returns a provider error. No page renders it yet — this is backend/API only.
- `AI_ENABLED`/`AI_PROVIDER`/`GEMINI_API_KEY`/`AI_COACH_MODEL` (server-only) now actually gate behavior via `gateway/gateway-factory.ts`'s `createAiGatewayFromEnv` — previously documented but unread.

### Added — operational hardening (proposed after Part 3, added immediately)

- `shared/budget-manager.ts`'s `BudgetManager` — an estimated daily/monthly AI-usage tracker with a circuit breaker: once estimated monthly cost reaches `AI_MONTHLY_BUDGET_GBP` (default £10), every request degrades to the deterministic fallback until the next calendar month. In-memory/per-process (documented limitation, not a substitute for the provider's own billing alerts).
- `shared/provider-health.ts`'s `ProviderHealthTracker` — a rolling window of the last 50 Gemini calls, recorded by `gemini-provider.ts`, exposing status (`healthy`/`degraded`/`down`), average latency, timeout rate, and last success time for future ops monitoring.
- Layered feature flags: `AI_ENABLED` (platform-wide master switch) plus `AI_COACH_ENABLED`/`AI_LEARNER_ENABLED`/`AI_PARENT_ENABLED` (coach feature, per audience) — replacing the single `AI_COACH_ENABLED` flag, so the coach (and any future second AI feature) can be rolled out independently without a redeploy.

## v0.5.0 — Learning Intelligence (Mastery, Adaptive Missions, Parent Dashboard)

A single release boundary covering Phases 5.1–5.3: the deterministic learning-intelligence foundation — mastery scoring, adaptive mission generation, and the Parent Intelligence Dashboard — all non-AI, all independently tested. Everything after this (AI coaching, gamification, exam readiness) builds on this foundation rather than changing it; see `docs/Architecture.md` → "AI Platform (Phase 5.4)" and "Planned: `learning-intelligence` facade" for the architectural decisions made ahead of that next stage.

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
