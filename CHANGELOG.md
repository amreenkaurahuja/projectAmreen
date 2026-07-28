# Changelog

All notable changes to this project are documented here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/), grouped by shipped milestone rather than by individual commit — see `docs/ReleaseNotes.md` for the more detailed, chronological version, and `git log` for full commit history.

## v0.7.0 — AI Learning Companion (Question Explainer) & Learning Metrics

Two capabilities built on top of the AI Platform (v0.6.0), each following the project's document-driven governance cadence (PRS/TDS/LDS → staged implementation, with an architecture retrospective — `docs/ARS-001-release-0.7-retrospective.md` — between them): the Question Explainer, a per-mistake AI explanation reusing the AI Platform's gateway/budget/health/logger unchanged, and a passive, feature-flagged learning-metrics pipeline that observes how learners use it without ever influencing that experience (TDS-008).

### Added — Question Explainer (TDS-007/PS-007)

- `src/modules/question-explainer/` — deterministic eligibility/context/fallback (Stage 1), Gemini prompt builders/response schema/grounding validator (Stage 2), and a dedicated `question_explanations` cache table (`0011_phase5_question_explainer_persistence.sql`, Stage 3), mirroring `ai_coaching_messages`'s cache-and-concurrency pattern rather than extending it.
- `POST /api/v1/question-explanations` (Stage 4) — a thin, versioned transport route; the client sends only `{attemptId, audience}`, never a learner id, prompt/schema version, context hash, correct answer, or follow-up id. Learner identity is resolved server-side from `attemptId` (`QuestionExplainerRepository.getLearnerIdForAttempt`), the pattern every later learner-identity-needing route in this release reused rather than accepting client-supplied identity.
- `QuestionExplainerFlow` (Stage 5, `src/components/question-explainer/question-explainer-flow.tsx`) — the four-screen progressive-disclosure learner experience on the Review Mistakes screen (acknowledge → why → worked example → next action), built to LDS-001's accessibility minimums (WCAG AA, keyboard nav, a dyslexia-friendly reading-mode toggle, `prefers-reduced-motion` support) and reviewed against real screenshots/recording of the full learner journey, not automated tests alone.
- `AI_QUESTION_EXPLAINER_ENABLED` feature flag, layered on `AI_ENABLED` and the existing per-audience flags — no new flag pair introduced.

### Added — Learning Metrics (TDS-008)

- `src/modules/question-explainer/explanation-event.types.ts` + `explanation-event-publisher.ts` (Stage 6.1) — the canonical educational-event vocabulary (`explanation_opened`/`step_viewed`/`explanation_completed`/`explanation_abandoned`) and the `LearningEventPublisher` boundary `QuestionExplainerFlow` depends on; the shipped default is `noOpLearningEventPublisher`, making "metrics never influence behaviour" true by construction rather than by convention.
- `learning_events` (`0012_learning_events.sql`, Stage 6.2) — the project's first append-only event table: immutable historical facts, not mutable summaries, with a table-level `CHECK` constraint mirroring the `LearningEvent` TypeScript union, and RLS deliberately restricted to select+insert only (no update/delete policy), enforcing immutability structurally rather than by application convention.
- `event_id` (`0013_learning_event_identity.sql`, Stage 6.3A) — a capability-owned identifier for one educational occurrence, generated once inside the publisher boundary (`crypto.randomUUID()`), distinct from the database row id, the `session_id` (one explanation-flow interaction), and the operational `requestId`.
- `POST /api/v1/learning-events`, `LearningEventDeliveryService`, `SupabaseLearningEventRepository`, and the first real (non-no-op) `httpLearningEventPublisher` (Stage 6.3B) — one delivery attempt per event, no retry, no batching; a duplicate `event_id` resolves to a successful no-op rather than an error.
- `NEXT_PUBLIC_QUESTION_EXPLAINER_METRICS_ENABLED` (Stage 6.3C) — a client-evaluated, build-time-inlined flag selecting `QuestionExplainerFlow`'s default publisher (no-op vs. HTTP); shipped disabled, and merging this code did not itself change learner-visible or production behaviour.
- `SupabaseQuestionExplainerMetricsRepository` + `calculateQuestionExplainerMetrics` (Stage 6.4) — the reporting read model: `explanationsOpened/Completed/Abandoned`, `completionRate`/`abandonmentRate` (never clamped above 1 — a rate exceeding 1 is truthful evidence of incomplete best-effort delivery, not an error), `abandonmentByStep`, `stepProgression` (unique sessions per step, no inference), and median/p90 elapsed-flow-time. A library surface only — no reporting route, dashboard, or UI, per TDS-008's explicit scope.
- `docs/testing/learning-metrics-behaviour.md` (Stage 6.5) — a full contract-to-test traceability matrix, produced by exercising the real end-to-end pipeline (component → HTTP publisher → real route → real validation → real repositories → real calculation service) against an in-memory persistence boundary. No defect found; no TDS-008 contradiction.

### Known gaps at this tag

- Best-effort metrics delivery (one attempt, no retry) means incomplete sessions are expected, not corruption — see `docs/testing/learning-metrics-behaviour.md` for exactly what the reporting layer does and doesn't tolerate.
- No subsequent-correctness metric ("did the learner do better on the next similar question?") — LDS-002 explicitly deferred this; the data needed to attempt it later is preserved (identifiers/timestamps), but no comparison rule has been chosen.
- No reporting UI, dashboard, or parent-facing analytics — explicitly out of scope for this release (LDS-002 §3, TDS-008 §15).
- Migration application remains a fully manual step, decoupled from Vercel's automatic deploy-on-merge — see `docs/releases/release-0.7-rollout.md`.
- Inherited from v0.6.0, still open: no dedicated preview/staging Supabase project (Preview and Production share one database); no live Sentry project configured.

## v0.6.0 — Learning Intelligence Platform (AI Learning Coach)

The AI Learning Coach: Project Amreen's deterministic learning-intelligence engines (mastery, adaptive missions, recommendations — all v0.5.0) gain a natural-language communication layer, built so AI explains what the deterministic engines already decided and never decides anything itself (`docs/AI_CONSTITUTION.md`). A completion audit (SDS-002) and a follow-up hardening pass closed the gaps it found before this tag — see `docs/ReleaseReadiness.md` for the full readiness matrix.

### Added — AI Platform (`src/modules/ai/`)

- The `LearnerCoachingContext` DTO and its strict Zod validation, a `ContextBuilder` that assembles one from the existing `ParentDashboardService`/`MissionCompletionService` (no duplicated calculations), versioned learner/parent prompt builders, a `Gemini`-backed `AiGateway` implementation (`@google/genai`, isolated to a single `providers/gemini-provider.ts` file), a two-stage response validator (shape) and grounding validator (content — every claimed strength/focus-area/next-step and every number the response states must trace back to the DTO; banned diagnostic/comparative/predictive/ranking language; no excessive study-time advice; no percentages for the learner audience; an 80/160-word budget), and a deterministic non-AI `fallback-coach.ts`.
- `ai_coaching_messages` table (`0010_phase5_ai_learning_coach.sql`) — caches one accepted AI response per learner/audience/context-hash, with `ON CONFLICT`-safe handling for concurrent requests (a losing insert re-reads the winning row instead of erroring).
- `AiCoachService` (`coach/ai-coach.service.ts`) — the single orchestrator: build+validate DTO → hash → cache lookup → Gemini on a miss → validate → ground → persist → fall back at any failure point (disabled, missing credentials, timeout, 429, malformed JSON, failed validation/grounding, budget exhausted all degrade to the deterministic fallback; only a genuine ownership error propagates).
- `GET /api/learners/[learnerId]/coach?audience=learner|parent` — never returns a provider error.
- An estimated-cost budget guard with a circuit breaker (`shared/budget-manager.ts`), an in-process Gemini health tracker (`shared/provider-health.ts`), and layered feature flags (`AI_ENABLED` platform-wide, `AI_COACH_ENABLED`/`AI_LEARNER_ENABLED`/`AI_PARENT_ENABLED` per feature/audience).
- UI: a "Today's Coach" card on `/learner/dashboard` and an "AI Learning Summary" card on `/parent/learners/[learnerId]` (`src/components/ai/coach-card.tsx`) — client-fetched with a loading skeleton, a source badge (AI Generated / System Generated), a refresh action, and a no-AI-call empty state for brand-new learners.
- `shared/ai-config.ts`/`shared/feature-flags.ts` — generation parameters and env-flag reads consolidated into two single-purpose modules.
- `docs/AI_PLATFORM.md`, `docs/AI_CONSTITUTION.md`, `docs/ReleaseReadiness.md`, `docs/adr/0004-why-ai-remains-under-modules.md`, and a "Dependency rules" section in `docs/Architecture.md`.

### Fixed — post-audit hardening (Sprint 1.5)

- Removed `LEARNER_PROMPT_VERSION`/`PARENT_PROMPT_VERSION`, two unused exports that had suggested the prompt builders owned their own version identity, when only `coach/context-builder.ts`'s `PROMPT_VERSION` constant actually does. No behavior change — the working cache-invalidation mechanism (`promptVersion` embedded in the hashed DTO) was already correct; this removes the misleading duplication a completion audit (SDS-002) flagged around it.
- Added prompt-injection regression tests — the untrusted-data mitigation existed with no test guarding it.

### Known gaps at this tag

- E2E (`tests/e2e/ai-coach.spec.ts`) has never executed against a real environment — this app's only Supabase project is production, and running E2E there was explicitly declined rather than risk mutating real data. Tracked in `docs/Roadmap.md` → "Known gaps" (dedicated staging Supabase project) and `docs/ReleaseReadiness.md`.
- Budget/health tracking is in-memory per-process, not DB-persisted; acceptable at current traffic, revisit if it grows. See `docs/AI_PLATFORM.md` → "Observability".

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
