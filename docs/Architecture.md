# Architecture

## Stack

- **Next.js 16 (App Router, Turbopack)** — server components by default, `"use client"` only where interactivity is needed
- **TypeScript** (strict mode, no `any`)
- **Supabase** — Postgres + Auth + Row Level Security (RLS) as the only backend
- **Tailwind CSS 4**
- **Vitest** + **@testing-library/react** for unit/component tests
- **Playwright** for end-to-end tests
- **Vercel** for hosting (Preview deployments per branch, Production tracks `main`)

There is no separate backend service. Route Handlers under `src/app/api/**` and Server Components under `src/app/**/page.tsx` talk to Supabase directly, scoped by the signed-in user's session and enforced by Postgres RLS.

## Layered structure

```
src/
  app/            Routes: pages (Server Components) and API route handlers
  components/     Client components (interactive UI only, no DB access)
  modules/        Business logic: repository -> service -> types, per domain
  lib/            Cross-cutting infrastructure (auth, supabase clients, env, validation)
```

### `modules/<domain>/`

Each domain (currently `missions`, `learning-profile`, `adaptive-learning`, and `parent-dashboard`) is split into:

- **`*.types.ts`** — plain data shapes, no imports of Supabase or Next.js. Safe to import from client components.
- **`*.repository.ts`** — an interface plus a `Supabase*Repository` implementation. This is the _only_ place that talks to `supabase.from(...)`. Repository methods map Postgres rows to the domain's types and translate Postgres errors into typed domain errors (`MissionAccessError`, `MissionNotFoundError`, `MasteryAccessError`, …).
- **`*.service.ts`** — orchestrates one or more repositories, enforces ownership/authorization order-of-operations, and contains the actual business rules (e.g. "a mission is complete when every item has an attempt").
- **`*-calculator.ts` / `*-summary.ts` / `*.calculations.ts`** — pure, framework-agnostic functions with no Supabase import, so the exact same logic (mission scoring, mastery scoring, profile aggregation) can run in a Server Component _and_ in a `"use client"` component without duplicating it or smuggling a database call into the browser bundle. `mission-completion.calculations.ts`, `learning-profile/mastery-calculator.ts`, `learning-profile/mastery-summary.ts`, `adaptive-learning/adaptive-selector.ts`, and `parent-dashboard/learning-health.ts` / `recommendation-engine.ts` all follow this pattern.

Pages and route handlers construct `new Supabase<X>Repository(supabase)` and `new <X>Service(repository)` and call the service — they never call `supabase.from(...)` for domain data directly (a couple of pages do a single direct `learners` ownership check inline, matching the pattern already used for the mission pages; this is a deliberate, narrow exception, not general practice).

### Why repositories are interfaces

Every `*.service.ts` depends on the repository's **interface**, not the concrete Supabase class. Unit tests construct the service with a hand-built fake object implementing that interface — no real network calls, no test database. This is what makes `npm test` fast (whole suite runs in a few seconds) and deterministic.

## Request flow

**Server-rendered page** (e.g. `/learner/mission`):

1. `requireUser()` — resolves the session from cookies via `@supabase/ssr`; redirects to `/login` if absent.
2. Validate any user-supplied IDs from `searchParams` with Zod **before** they reach Supabase (see "Defensive ID validation" below).
3. Construct repository → service, call the service.
4. Service enforces ownership (`assertLearnerOwned` / an ownership-scoped query) and throws a typed error if it fails.
5. Page maps known errors to `redirect()` / `notFound()`; render the page with the returned data.

**API route** (e.g. `POST /api/missions/[missionId]/attempts`):

1. Zod-validate path params and body; `400` on failure.
2. `supabase.auth.getUser()`; `401` if unauthenticated.
3. Call the service inside `try/catch`; map `MissionAccessError → 403`, `MissionNotFoundError → 404`, anything else → `500` with a generic message (never leak internals).

## Auth

- `src/lib/supabase/server.ts` — `createServerClient` from `@supabase/ssr`, backed by the request's cookies. Used in Server Components and Route Handlers.
- `src/lib/supabase/client.ts` — browser client, for the login/signup forms.
- `src/proxy.ts` + `src/lib/supabase/proxy.ts` — Next.js middleware that refreshes the Supabase session cookie on every request (matches all paths except static assets). If Supabase is unreachable, it fails open rather than locking users out.
- `src/lib/auth/require-user.ts` — the one place that decides "no session → `/login`". Every protected page calls this first.
- Authorization itself is **not** re-implemented per route: it's enforced twice, redundantly, on purpose — once by an explicit `parent_id = auth.uid()` check in the repository/service layer (so the app returns a clean 403/redirect), and once unconditionally by Postgres RLS (so a bug in the first check can never leak another parent's data).

## Rendering & caching

Per-learner, per-attempt pages (`/learner/mission`, `/learner/mission/review`) export `dynamic = "force-dynamic"`. These pages read live, request-scoped data (which question to resume at, which attempts exist) and must never be served from a cached RSC payload. Static marketing/auth pages (`/`, `/login`, `/signup`) are left to Next.js's default (prerendered where possible).

## Defensive ID validation

Every `learner` / `mission` / `missionId` value that originates from a URL (`searchParams` or a dynamic route segment) is validated with `z.string().uuid()` **before** it reaches Supabase. This exists because Postgrest raises a hard error for a syntactically invalid UUID, and if that error isn't caught, it turns into an unhandled exception and a generic 500 page instead of a normal "not found" response. Every page and API route that accepts one of these IDs validates it up front and fails gracefully (`redirect()` / `notFound()` for pages, `400` for API routes).

## A schema/RLS interaction to know about

`SupabaseMissionPlayerRepository.getMissionItems` deliberately does **not** use PostgREST's automatic to-many embed (`mission_items.select("...", "question_attempts(...)")`). That pattern was tried first and, under RLS, silently returned an empty embed for attempts the policy legitimately granted access to — even though the exact same policy, run as a flat SQL join, returned the row correctly, and the sibling `mission_items` embed (nested `question_bank`/`subjects`/`topics`/`question_options`) worked fine in the same request. The fix was to fetch `question_attempts` as a **separate** `.in("mission_item_id", itemIds)` query and merge in application code — the same pattern `mission.repository.ts` already used for the dashboard's answered count. If you're tempted to "simplify" a query by embedding a to-many relationship guarded by a multi-hop RLS policy, test it against a real RLS-authenticated session first, not just as the Postgres superuser in the SQL editor (which bypasses RLS entirely and will hide this class of bug).

## Learning profile & mastery (Phase 5.1)

`src/modules/learning-profile/` computes and stores a deterministic, explainable, non-AI mastery/confidence estimate per learner per skill, feeding a small "Learning Profile" section on `/learner/dashboard`. No adaptive question selection, charts, or gamification yet — see "Known v1 limitations" below.

### Mastery algorithm

Each answered question adjusts the learner's existing `learner_skill_mastery` row (or creates one, starting at mastery 50 / confidence 50, the first time a learner answers a question for a skill):

- **Mastery delta** by `question_bank.difficulty` (1–5; missing/invalid defaults to 3): correct answers award `+2/+3/+4/+5/+6`, incorrect answers penalise `-5/-4/-3/-2/-2` (easier questions cost more when missed, harder ones reward more when got right).
- **Consistency modifier**: `+1` extra on the 3rd-or-later consecutive correct answer; `-1` extra on the 2nd-or-later consecutive incorrect answer. (The spec was explicit about the correct-streak threshold; the incorrect-streak threshold is this project's own interpretation of "consecutive incorrect answer" — the natural complement, so a single isolated miss only takes the normal difficulty-based penalty and a repeated one takes extra.)
- **Confidence delta** from response time against a 30s target (fast ≤15s / moderate ≤30s / slow ≤60s / very slow >60s): correct answers award `+5/+3/+1/0`; incorrect answers penalise `-4/-3/-2/-1`. No recorded response time: `+2` correct, `-2` incorrect.
- Both scores are clamped to `0–100` after every attempt.

All of this lives in `mastery-calculator.ts` — pure functions, no I/O, no system-clock reads (the caller always passes the attempt's `answeredAt` explicitly), fully unit-tested in isolation from Supabase.

### Review scheduling

`next_review_at` is recomputed after every attempt from the **updated** mastery score (not the pre-attempt one), relative to an explicitly-passed reference timestamp (never `new Date()` read inside the calculator, so it stays deterministic and testable): `<40 → +1 day`, `<60 → +3 days`, `<80 → +7 days`, `<90 → +14 days`, `≥90 → +30 days`. Override: an incorrect answer that leaves mastery below 60 always schedules `+1 day`, regardless of which band the score landed in.

### Idempotency

Mastery must update exactly once per question attempt, even though `POST /api/missions/[missionId]/attempts` is itself idempotent (re-answering upserts the same `question_attempts` row). Strategy:

1. **Claim**: `question_attempts.mastery_processed_at` starts `null`. Processing an attempt does one atomic conditional `UPDATE ... SET mastery_processed_at = now() WHERE id = ? AND mastery_processed_at IS NULL`. If it affects zero rows, the attempt was already processed — skip, no error. This needs no custom Postgres function; it relies on ordinary row-level `UPDATE` semantics.
2. **Counter update race**: two attempts landing on the same `(learner_id, skill_id)` mastery row concurrently is handled with optimistic concurrency — read the current row, compute the new state with the pure calculator, then write conditionally (`insert`, which fails on the row's unique constraint if another insert won the race; or `update ... where updated_at = <the value just read>`, which affects zero rows if another update won). A lost race is retried (read-compute-write again) up to 5 times. This was chosen over a PL/pgSQL function specifically to keep the mastery calculation in pure, framework-agnostic TypeScript rather than splitting it across two languages.
3. Re-answering a mission item never reprocesses mastery: the upsert on `question_attempts` doesn't touch `mastery_processed_at`, so it stays set from the first answer.

### Integration point & the fail-open decision

`MissionPlayerService.submitAnswer` calls `MasteryProcessor.processQuestionAttempt` (a narrow structural interface `MissionPlayerService` depends on — not a direct import of `learning-profile` types, keeping the two domains decoupled) **after** `upsertAttempt` and `updateMissionStatus` succeed. `MasteryService.processQuestionAttempt` never throws — any failure (bad data, a transient DB error, an unresolvable skill) is caught internally, logged (structured log + Sentry), and returned as a soft `{ processed: false, reason }` outcome; the mission-player service also wraps the call in its own `try/catch` as a second line of defence.

**Decision**: mastery-processing failure must **not** fail the answer-submission request. By the time mastery processing runs, the attempt is already durably persisted and the mission's progress/completion state is already updated — the learner's immediate feedback (correct/incorrect, explanation, mission progress) must never be blocked by a bug in the mastery engine, which is a secondary, best-effort enrichment, not the primary transaction. On failure, the attempt's `mastery_processed_at` claim is rolled back (`unclaimAttempt`) so a later retry or the backfill script can pick it up. The alternative (failing the whole request) was rejected because it would let a mastery-engine bug take down mission-taking entirely, which is a much worse failure mode for a learner mid-mission than a temporarily-stale learning profile.

### Backfill

`scripts/backfill-learning-mastery.ts` (`npm run backfill:learning-mastery`) computes mastery for `question_attempts` rows that predate this feature. Offline administrative script, authenticated with `SUPABASE_SERVICE_ROLE_KEY` (bypasses RLS) — not a route, not reachable by the running app. Processes attempts strictly in `answered_at` order (tie-broken by `id`) so streaks/deltas/review-scheduling come out identical to how they'd have been computed live. Safe to re-run: it reuses the exact same claim-based idempotency as the live path, so already-processed attempts (from a real learner answering, or a previous run of this script) are skipped, not reprocessed.

### Skill resolution (fixed in 0008)

Mastery only works if a question resolves to exactly one skill. Migration `0007` shipped with `question_bank.skill_id` nullable and never actually set by the seed script — the app inferred a skill from the question's topic instead, via `SupabaseMasteryRepository.getQuestionCurriculumMetadata`'s "topic's sole active skill" fallback. That inference is only correct while every topic has exactly one active skill, which happened to be true of the seeded curriculum but wasn't an invariant the schema enforced: the moment a topic gained a second skill (e.g. splitting a "Fractions" topic into "Adding," "Subtracting," "Mixed Numbers" skills), every question under that topic would have silently stopped resolving to a skill at all, and mastery would have quietly stopped being tracked for it — no error, just missing data.

Migration `0008_backfill_question_skill.sql` closes this: it backfills `question_bank.skill_id` from each topic's skill (only where that topic had exactly one active skill — genuinely ambiguous topics are left alone, causing the following `not null` to fail loudly rather than guess), then makes the column `not null`. `scripts/seedQuestions.ts` and `data/questions.json` were updated alongside it to always supply `skill_id` (via a `skillCode` matching `skills.code`) directly. The topic-fallback in `getQuestionCurriculumMetadata` is kept as a defensive path only, for an environment that hasn't run `0008` yet — it should never be exercised in practice going forward.

### Planned: `mastery_history` (still not built — deferred to Phase 5.3)

`learner_skill_mastery` is current-state only — no time series — so the dashboard can show "where a learner stands today" but not "how they've progressed" (no trend charts, plateau detection, or regression alerts). Design intent, not implemented yet:

- **New table**: `mastery_history(id, learner_id, skill_id, mastery_score, confidence_score, recorded_at, source)`, append-only, indexed on `(learner_id, skill_id, recorded_at)`. No RLS write path from the client — only ever written by `MasteryService`.
- **Write strategy**: snapshot-on-change, not snapshot-per-attempt — append a row only when an attempt actually moves `mastery_score` (skip the write when a score is already clamped at 0/100 and the attempt doesn't move it). This keeps the log proportional to genuine progress rather than growing one row per question forever, while still being granular enough for a "May 1 → June 5" style trend chart. The alternative (periodic, e.g. daily, snapshots) is cheaper still but would miss same-day swings; worth revisiting if snapshot-on-change turns out to grow faster than expected once there's real usage data.
- **Where it plugs in**: `MasteryService.applyWithRetry`, right after a successful `insertMasteryRow`/`updateMasteryRow`, comparing the previous and new `mastery_score`.

**Phase 5.2 decision**: re-evaluated this design while building the adaptive generator below, and deliberately did not build it. The selector only ever reads _current_ `mastery_score`, `total_attempts`, and `next_review_at` to choose questions — nothing in the allocation, difficulty-matching, or fallback logic needs a historical trend, so there was no adaptive-selection reason to build it now. The debugging benefit (seeing how a score arrived where it is) is real but speculative rather than a concrete need this phase hit. Left fully documented here for whenever trend charts or plateau/regression detection actually get scheduled.

## Adaptive mission generation (Phase 5.2)

`src/modules/adaptive-learning/` replaces the old static 8/4/2/2 subject-interleave generator (`mission.generator.ts`/`mission.service.ts` — deleted) with a deterministic, explainable selector that chooses each day's 16 questions from a learner's mastery, review schedule, and curriculum coverage. No adaptive AI, no question generation — this only changes _which existing question_bank rows_ get chosen and in what order.

### Category allocations

Target composition for a learner with mastery data (a category may contribute fewer than its target when too few eligible questions exist for it — see "Fallback" below):

| Category              | Target | Eligibility                                | Priority order                                                                          |
| --------------------- | ------ | ------------------------------------------ | --------------------------------------------------------------------------------------- |
| `weak_skill`          | 7      | `learner_skill_mastery.mastery_score < 60` | lowest mastery first, then more attempts over fewer                                     |
| `review_due`          | 4      | `next_review_at <= reference timestamp`    | oldest overdue first, then lowest mastery                                               |
| `curriculum_coverage` | 3      | any active question (no hard filter)       | round-robin across active subjects; within a subject, untested/low-attempt skills first |
| `challenge`           | 2      | `difficulty >= 4` (hard filter)            | prefers mastery ≥ 70; a skill below 50 mastery is only used if nothing else qualifies   |

Processed in the order `review_due` → `weak_skill` → `curriculum_coverage` → `challenge`, so `weak_skill` can see (and deprioritise, not exclude) skills `review_due` already picked — matching the spec's "don't double up on the same skill unless the mission needs the slots." Any slots still open after all four categories run are filled by **fallback** (see below), and every selected question gets a `reason` tag persisted on `mission_items.selection_reason` for internal explainability — never shown to the learner.

### New-learner baseline

A learner with zero `learner_skill_mastery` rows skips category allocation entirely and gets a **balanced baseline mission** instead: round-robin across active subjects, difficulty 1-3 preferred, at most 2 difficulty-4 questions, difficulty-5 excluded unless the pool is otherwise too thin to reach 16.

### Difficulty adaptation

Mastery maps to a preferred/allowed difficulty band (`adaptive-config.ts`'s `difficultyBands`), used as a ranking signal, not a hard filter — a category can still complete even without a perfect-difficulty candidate:

| Mastery                     | Preferred | Allowed |
| --------------------------- | --------- | ------- |
| < 40                        | 1-2       | 1-3     |
| 40-59 (and untested skills) | 2-3       | 1-4     |
| 60-79                       | 3-4       | 2-5     |
| 80-100                      | 4-5       | 3-5     |

An untested skill (no mastery row) is scored as if mastery were 50 for this purpose — it lands in the 40-59 band, whose preferred range `[2,3]` is exactly the spec's "untested skill" target.

### Deterministic seed strategy

The whole selector (`selectAdaptiveMission` in `adaptive-selector.ts`) is a pure function: same candidates + mastery + recent attempts + subjects + reference timestamp + config → same selected question IDs in the same order, always. No `Math.random` anywhere in it. The seed is `` `${learnerId}:${missionDate}` `` (`seeded-random.ts`'s `buildMissionSeed`), hashed (FNV-1a) into a numeric seed for a small deterministic PRNG (mulberry32). That seed drives: the subject order used for round-robin categories, every priority tie-break (via a per-candidate deterministic hash, not array order), and the final shuffle that decides presentation order. A different learner or a different date changes the seed and therefore the ordering; the same learner on the same date is always identical.

### Recent-question cooldown

A question answered within `cooldownDays` (default 7) of the reference timestamp is deprioritised, not hard-excluded — every category's priority tuple includes a cooldown-penalty tier, so a cooldown-affected question only gets picked when nothing better is available. `review_due` never applies the cooldown at all (a due review is exactly the case the spec says should override it).

### Subject balance

Soft, not hard: every active subject is targeted for at least `subjectSoftMinimum` (2) questions and capped around `subjectSoftCap` (7), but both are just priority tiers, not exclusions — `weak_skill`/`review_due` don't consider the cap at all (favouring learning need over cosmetic balance, per spec), while `curriculum_coverage` and the fallback fill actively round-robin/deprioritise-when-over-cap to keep the mission from being dominated by one subject when the data doesn't demand it.

### Fallback strategy

If the four categories don't fill all 16 slots, `pickFallback` fills the rest from any remaining active candidate, preferring (in order) a subject still below its soft minimum, then a question not on cooldown, then a subject not yet over its soft cap, with the same deterministic tie-break as everywhere else. The spec's 5-step recommended fallback order collapses to this in practice: `curriculum_coverage`'s eligibility is "any active question," so by the time fallback runs, every remaining candidate already qualifies as "coverage-adjacent" — there's nothing left to distinguish steps 1-3 of that order once you reach this point. If fewer than 16 eligible questions exist at all, the mission is created with however many unique ones do exist (`capacityWarning: true`, logged); only a **zero**-candidate pool fails the request (`MissionQuestionBankError`).

### Mission reuse and concurrency

Unchanged from before — `AdaptiveMissionService` reuses the existing `MissionRepository.findTodaysMission` (returns the existing mission for `learner_id`+`mission_date` without regenerating) and `MissionRepository.createMission` (the same conflict-safe insert: a concurrent duplicate insert hits the `missions(learner_id, mission_date)` unique constraint and the loser re-reads and returns the winner's mission, exactly as the old static generator did). None of that persistence/concurrency logic was duplicated — only the candidate-loading and selection steps in between are new.

### Known v1 limitations

- No adaptive difficulty _within_ a mission beyond the ranking hints above — categories don't hard-guarantee a perfect difficulty match, by design (a category shouldn't fail just because no ideal-difficulty candidate exists).
- Subject balancing during fallback is a static per-pick re-scan (recomputed each pick, not a single upfront sort) — fine at 16 slots; would need a smarter structure at a much larger mission size.
- No use of `learners.school_year`/`exam_target` for candidate filtering — investigated (see below) and found unused by the _previous_ generator too; carrying that forward unchanged rather than introducing new filtering as an incidental part of this phase.
- `mastery_history` remains undecided/deferred (see above). Phase 5.3 (below) hit a case that would have used it — the parent dashboard's "mastery change" column — and worked around it with an approximation rather than building it, so it's now a Phase 5.4 candidate instead.

## Parent Intelligence Dashboard (Phase 5.3)

`src/modules/parent-dashboard/` turns a learner's existing mastery and mission data into a parent-facing analytics view at `/parent/learners/[learnerId]` (linked from `/parent/dashboard`'s learner list). No new tables, no new tracked data — everything here is read from `learner_skill_mastery`, `missions`, `mission_items`, and `question_attempts`, which Phases 5.1/5.2 already populate.

### Reused services

- `MasteryRepository.getAllMasteryForLearnerEnriched` (Phase 5.1) — the same enriched mastery rows the learner-facing profile uses.
- `mastery-summary.ts`'s `buildLearnerProfileSummary`, `buildSubjectSummaries`, and `pickTopSkills` — the latter two were made exported (previously module-private) so the dashboard can reuse the exact same subject-aggregation and skill-ranking logic instead of recomputing it; `pickTopSkills` gained an optional `limit` parameter (default 3, unchanged for the learner profile) so the dashboard can ask for its top 5 without forking the function. `SubjectSummary` gained an `averageResponseMs` field for the same reason (the learner profile doesn't use it, the dashboard's subject table does).
- `mastery-calculator.ts`'s `computeMasteryDelta` — reused as-is for the weekly progress table's approximate mastery-change column (see "Known v1 limitations").
- `AdaptiveDataRepository.loadCandidateData` + `selectAdaptiveMission` + `DEFAULT_ADAPTIVE_CONFIG` (Phase 5.2) — reused, unmodified, to build "Tomorrow's likely focus" (see below). Nothing about the selector itself changed.
- `MissionCompletionRepository.getLearnerDisplayName` — reused for the page header instead of a duplicate query.
- The existing `/learner/mission/review` page — the session history table's "Review" link points straight at it; no new review UI was built.

### Dashboard metrics

- **Overall Learning Health** cards (mastery, accuracy, questions answered, study time, streak, skills due) come from `learning-health.ts`'s `buildLearningHealth`, combining the reused profile summary with a locally-computed streak and an approximate total study time (`averageResponseMs × totalAttempts`, summed across skills — an approximation because no table stores a true running total; see "Known v1 limitations").
- **Subject insights** reuse `buildSubjectSummaries`, add a qualitative `masteryLabel` (`Excellent` ≥80, `Developing` ≥60, else `Needs Practice` — the same 60/80 thresholds already used elsewhere in the mastery/adaptive code, not new numbers), and sort weakest-mastery-first.
- **Strongest/focus skills** reuse `pickTopSkills` (limit 5) and add a `reviewDue` flag by looking up each returned skill's `nextReviewAt` in the already-loaded enriched records — no second ranking implementation.
- **Learning streak**: `computeLearningStreak` walks a de-duplicated, sorted list of a learner's completed `mission_date`s (all-time, fetched separately and cheaply — date/status only, no joins) entirely in UTC (a Postgres `date` string parses as UTC midnight, matching how `mission_date` is already treated everywhere else in this codebase). The current streak counts as "still current" if the most recent completed mission was today or yesterday; anything older than that resets it to 0. Longest streak is the longest run found anywhere in the full history, independent of whether it's still current.
- **Weekly progress / session history** come from a single bounded query (`ParentDashboardRepository.getRecentMissionData`, capped at the most recent 30 missions) joined against their attempts (going `question_attempts → mission_items → question_bank`, the same safe to-one embed direction documented under "Adaptive mission generation" — never the reverse to-many embed that's unsafe under this table's RLS policy). Weekly progress filters to `status = 'completed'`, most recent 7; session history shows all recent missions regardless of status. Both render "No completed learning sessions yet." when empty.

### Recommendation engine

Deterministic, rule-based, no AI — `recommendation-engine.ts`'s `buildRecommendations` evaluates five rules in a **fixed priority order** and returns the first 3 that apply, so the same mastery data always produces the same recommendations:

1. Any skill with mastery `< 40` → focus that skill (the lowest-mastery one) tomorrow.
2. Any skill due for review → practice the overdue skills (up to 3 named).
3. A skill whose confidence trails its mastery by ≥10 points → slow down and think carefully on that skill.
4. Overall average response time `> 45,000ms` (1.5× the mastery calculator's own 30s target — reusing that constant rather than inventing a new threshold) → encourage timed practice.
5. Every tracked skill at mastery `≥ 80` → add more challenge questions.

### Upcoming mission preview

"Tomorrow's likely focus" runs the **real** adaptive selector for tomorrow's date (`referenceTimestamp` = now + 1 day) using the **same** `AdaptiveDataRepository`/`selectAdaptiveMission`/`DEFAULT_ADAPTIVE_CONFIG` the live generator uses — but never persists a mission. `extractUpcomingFocusSkillIds` (`learning-health.ts`) then takes the selector's own output order and picks up to 3 distinct skill IDs, preferring `weak_skill`/`review_due`-tagged picks and falling back to whatever else was selected (so a strong learner still sees a preview instead of an empty one). Only skill **names** are shown — mastery scores, selection reasons, and category weights are never exposed to the parent UI.

### Known v1 limitations

- **"Mastery change" is an approximation.** With no `mastery_history` table (see above), the weekly progress column sums `computeMasteryDelta(isCorrect, difficulty)` per attempt — the same pure difficulty-based delta the live mastery engine uses — but excludes the consistency-streak modifier, which needs full sequential replay of a skill's attempt history to compute correctly. It's directionally accurate, not the true logged delta.
- **"Total study time" is also an approximation** (`averageResponseMs × totalAttempts` per skill, summed) rather than a stored running total, for the same reason — no history table to read an exact sum from.
- Session history/weekly progress are bounded to the most recent 30 missions; streak calculation is not (it only needs lightweight date/status data, so it scales to a learner's full history regardless).
- No parent-facing UI for comparing multiple learners side by side yet — this page is one learner at a time, reached from the existing learner list on `/parent/dashboard`.

## Planned: `learning-intelligence` facade (not yet built)

As of Phase 5.3 there are three independent deterministic engines, each already pure/rule-based/no-AI and independently tested: mastery scoring (`learning-profile/mastery-calculator.ts`), adaptive mission selection (`adaptive-learning/adaptive-selector.ts`), and dashboard recommendations (`parent-dashboard/recommendation-engine.ts`). They currently live in three separate domain modules, each reached a different way from a page.

**Design intent, not implemented yet**: a `src/modules/learning-intelligence/` facade — `learning-profile.ts`, `mastery.ts`, `recommendations.ts`, `mission-preview.ts`, `insights.ts` — as the single place future intelligence-related services (especially AI-facing ones) import from, rather than reaching into `learning-profile`/`adaptive-learning`/`parent-dashboard` individually. The point is **not** to move the existing engines' code — each stays where it is, still owned by its own domain, still independently testable — the facade would just re-export/compose their public entry points behind one import path. Worth building once there's an actual second consumer that needs all three together (an AI coaching layer is the obvious candidate); premature before that.

**The principle this sets up for, whenever AI coaching arrives**: AI explains, it never replaces, the deterministic engines. The flow is always

```
Learning Data → Recommendation Engine (truth) → AI Coach (natural language)
```

never the reverse. The recommendation engine (and mastery/adaptive selector) stay the source of truth for _what_ to recommend; an AI layer's only job would be turning an already-decided, already-deterministic recommendation into parent-friendly prose — not deciding the recommendation itself. This is what keeps a future AI feature from hallucinating educational advice: it's constrained to explaining a fixed, testable input, never generating the underlying judgement. Any AI-coaching work (Phase 5.4+) should be evaluated against this constraint before it's built, not after.

## AI Platform (Phase 5.4)

No AI/LLM calls existed anywhere in the codebase before this phase (every earlier phase explicitly excluded them). Phase 5.4 supersedes the earlier single-module `ai-coach` proposal above with a reusable **AI Platform**, on the reasoning that Project Amreen's eventual AI surface area (learner coach, parent summaries, teacher reports, study plans, exam-readiness, question explanations, …) would otherwise duplicate prompt/validation/caching/provider plumbing per feature.

**Status: Phase 5.4 is complete**, including UI. Parts 1–3 of the spec (DTO, context builder, prompts, Gemini provider, validation/grounding, caching, orchestration) are built, plus operational hardening added after Part 3 (a budget guard, a provider health tracker, layered feature flags) and the UI integration from Part 4 (a "Today's Coach" card on `/learner/dashboard`, an "AI Learning Summary" card on `/parent/learners/[learnerId]`, both backed by `GET /api/learners/[learnerId]/coach?audience=learner|parent`, returning `{ headline, message, strengths, focusAreas, nextSteps, source, cached }` — `source` is `"ai"` or `"fallback"`, never a provider error). See `docs/AI_PLATFORM.md` for the full architecture/data-flow/security/cost/deployment write-up and `docs/AI_CONSTITUTION.md` for the twelve rules every future AI feature must follow.

**Budget guard.** `shared/budget-manager.ts`'s `BudgetManager` tracks an _estimated_ daily request count and daily/monthly token estimate (`estimateTokens` — a ~4-characters-per-token heuristic, not exact billing), and acts as a circuit breaker: once the estimated monthly cost (tokens × a configurable `£/1k tokens` price) reaches `AI_MONTHLY_BUDGET_GBP` (default £10), every subsequent request that month goes straight to the fallback, logged with `failureCategory: "budget_exceeded"`. `AiCoachService` checks the budget right after a cache miss (before building a prompt or calling the gateway) and records actual usage right after a successful `generate()` call, using the real prompt+response text length. This is deliberately **in-memory and per-process** — Node module caching means every request within the same warm serverless instance shares `sharedBudgetManager` and its counters accumulate correctly across them, but a cold start resets everything, and multiple concurrent warm instances each track their own total rather than one global figure. A deployment that needs a hard, exact billing cap would need to back this with a shared store (e.g. a Supabase table incremented per request) instead; this is a meaningfully-better-than-nothing guard against a single runaway instance, not a substitute for the provider's own billing alerts.

**Provider health.** `shared/provider-health.ts`'s `ProviderHealthTracker` keeps a rolling window of the last 50 Gemini calls (`gemini-provider.ts` records into the shared instance after every attempt) and derives `status` (`"healthy"` / `"degraded"` / `"down"`, from the recent failure rate), average latency, timeout rate, and the last successful call's timestamp. Same in-memory/per-process caveat as the budget guard applies — it's a cheap, quick "is Gemini currently working" signal for a future ops surface, not a replacement for the durable, cross-instance picture an external log aggregator gets from every individual call already being logged via `shared/logger.ts`.

**Layered feature flags.** Rather than one `AI_COACH_ENABLED` flag, there are two layers: `AI_ENABLED` (platform-level master switch, checked by `gateway/gateway-factory.ts`'s `createAiGatewayFromEnv` — governs whether AI infrastructure runs _at all_, for any current or future feature) and `AI_COACH_ENABLED` + `AI_LEARNER_ENABLED` + `AI_PARENT_ENABLED` (feature-level, checked by the same file's `isCoachEnabledForAudience` — governs whether the coach specifically is on, per audience). The route checks `isCoachEnabledForAudience` before even constructing a gateway; if it's `false`, the request goes to the fallback regardless of whether `AI_ENABLED`/credentials would otherwise allow a gateway to exist. This lets the learner-facing and parent-facing surfaces (and any future second AI feature with its own flag) be rolled out independently without a redeploy.

**Non-negotiable design principles:**

1. **AI never makes educational decisions.** It never calculates mastery, confidence, recommendations, review schedules, or adaptive missions — those engines already exist and remain the only source of truth. AI only explains their output in natural language.
2. **The learning engine is the only source of truth**, in a strict one-way flow: `Question Attempts → Mastery Engine → Recommendation Engine → Adaptive Mission → Learning Context → AI`. Nothing flows back from AI into the engines.
3. **The platform must work with AI disabled.** Missions, mastery, recommendations, the dashboard, and review all function unchanged with `AI_COACH_ENABLED=false` — only the wording an AI layer adds on top disappears.
4. **Business logic must never depend on Gemini (or any provider) directly.** Exactly one file (`providers/gemini-provider.ts`) imports the provider SDK; everything else depends on the `AiGateway` interface.

**Folder structure** (all built):

```
src/modules/ai/
  gateway/      ai-gateway.ts             — provider-agnostic interface + request/response types
                gateway-factory.ts        — reads AI_COACH_ENABLED/AI_PROVIDER/GEMINI_API_KEY/AI_COACH_MODEL, returns null (never throws) when AI shouldn't run
  providers/    gemini-provider.ts        — the only file that imports @google/genai
  prompts/      learner-prompt.ts, parent-prompt.ts   — versioned, per-audience prompt builders
                prompt-shared.ts, coach-response-schema.ts — shared system-prompt scaffold + JSON schema (not in the original file list, added to avoid duplicating them per audience)
  validation/   dto-validator.ts, response-validator.ts, grounding-validator.ts, banned-phrases.ts
  cache/        context-hash.ts, ai-cache.repository.ts (Supabase-backed, table: ai_coaching_messages)
  shared/       canonical-json.ts, logger.ts
  coach/        coach.types.ts, context-builder.ts, fallback-coach.ts, audiences.ts, ai-coach.service.ts
```

`ai-coach.service.ts`'s `AiCoachService` is the one orchestrator every caller goes through — it owns the full flow (build DTO → hash → cache lookup → gateway on a miss → validate → ground → persist → fall back at any failure point). The only current caller is `GET /api/learners/[learnerId]/coach` (`src/app/api/learners/[learnerId]/coach/route.ts`).

Later audiences (`teacher/`, `planner/`, `revision/`, `emails/`, `support/`, …) are expected to sit alongside `coach/` as peers, reusing `gateway/`, `providers/`, `validation/`, and `cache/` unchanged — the point of building a platform instead of a single coach module now.

**Provider abstraction.** Everything depends on one interface:

```ts
export interface AiGateway {
  generate(request: AiGenerationRequest): Promise<AiGenerationResponse>;
}
```

The application calls `AiGateway.generate(...)` and never imports a provider SDK. `GeminiProvider` (`providers/gemini-provider.ts`) is the only implementation today. `gateway/gateway-factory.ts`'s `createAiGatewayFromEnv()` is the one place that decides whether AI runs at all: it returns `null` — never throws — when `AI_COACH_ENABLED !== "true"`, when `AI_PROVIDER` names an unsupported provider, or when `GEMINI_API_KEY`/`AI_COACH_MODEL` are missing. `AiCoachService` treats a `null` gateway as "go straight to the deterministic fallback." Adding a second provider later (OpenAI, Groq, Claude, Ollama) means adding one `providers/*-provider.ts` file and a branch in the factory; no other call site changes.

**DTO boundary.** Repositories, services, and the database sit strictly below a line that Gemini can never cross. `coach/context-builder.ts`'s `ContextBuilder` is the only class on the AI platform's side allowed to call `ParentDashboardService`/`MissionCompletionService`; the only thing it hands upward is a validated `LearnerCoachingContext` — learner name, overall mastery/accuracy, strongest/focus skills, subject insights, the deterministic recommendations (mapped to a `{title, description}` shape, never regenerated), the most recent completed mission's summary, and up to 3 upcoming focus skill names — never raw `question_attempts`/`missions`/`learner_skill_mastery`/`mission_items` rows. `validation/dto-validator.ts`'s `LearnerCoachingContextSchema` (Zod, `.strict()`, each sub-schema typed as `z.ZodType<Shape>` against `coach.types.ts` so the two can't silently drift) rejects anything malformed before it can reach a prompt; `ContextBuilder.build` throws `ContextBuilderValidationError` (carrying the rejected candidate) in that case rather than ever calling the gateway — `AiCoachService` catches it and still returns a deterministic fallback built from that candidate, so a data-shape bug degrades gracefully instead of failing the request.

**Grounding — the response is checked against the DTO, not just its shape.** `validation/response-validator.ts` checks structure (Zod `.strict()`, length limits, no markdown). `validation/grounding-validator.ts` then checks the response's _content_ against the same `LearnerCoachingContext` it was built from: every `strengths` item must name something in `strongestSkills`; every `focusAreas` item must match `focusSkills` or a recommendation; every `nextSteps` item must originate from a recommendation or `upcomingFocusSkills`; every standalone number in the response must equal a number actually present in the DTO (streak, questions answered, mastery/accuracy, recent mission score/questions/duration) — otherwise it's treated as invented; plus `validation/banned-phrases.ts`'s diagnostic/comparative/predictive/ranking language, excessive study-time-advice phrasing, no percentages for the learner audience, and the audience's word budget (80 words learner / 160 words parent). Any one of these failing routes to the fallback, the same as a provider error. A grounding check for an array is skipped when the DTO has nothing in it to compare against (e.g. no `strongestSkills` yet) — this validator still cannot prove a wholly invented name is wrong when there's nothing relevant in the DTO to compare it to; that residual gap is a known, documented limitation, not silently claimed to be covered.

**Security rules.** Gemini never receives email, password, auth id, UUIDs, raw attempt/DB rows, SQL ids, answer keys, or question text — only the structured learning-summary DTO. Logging goes through `shared/logger.ts`'s `logAiEvent`/`logAiError`, typed to accept only the allowed fields (provider, model, duration, cache hit, a context-hash _prefix_ via `cache/context-hash.ts`, audience, result source, status, a closed-set `failureCategory`) — there is no parameter on that function a prompt, DTO, or API key could be passed through as.

**Versioning.** Every `LearnerCoachingContext` carries `schemaVersion: "1.0"` and `promptVersion: "coach-v1"` (both Zod `z.literal`s today — bumped by hand as prompts/schema evolve). The cache table stores both alongside `provider`/`model` per row, so a future prompt-wording change can invalidate old cache entries deliberately (by bumping the literal, which changes what a freshly-built context validates against) rather than by accident.

**Cost control.** `cache/context-hash.ts` computes a SHA-256 hash of the DTO (via `shared/canonical-json.ts`'s key-sorted stringify, so field order never affects the hash). `AiCoachService` looks up `ai_coaching_messages` by `(learner_id, audience, context_hash)` _before_ calling the gateway — a hit returns immediately with no provider call. Only AI-accepted responses (`source = 'ai'`) are ever written to the cache; a fallback response is cheap and pure, so it's recomputed every time rather than cached. In steady state, one mission completion (which changes the learner's mastery/recommendations/hash) produces at most one Gemini call; any number of dashboard refreshes in between are cache hits.

**Concurrency.** `ai_coaching_messages` has a `unique (learner_id, audience, context_hash)` constraint. If two requests race (e.g. a parent with several tabs open) and both miss the cache, both call Gemini, but only one `insert` succeeds — the loser's `save()` throws `AiCacheDuplicateError` (same `23505`-based pattern already used by `mission.repository.ts`'s duplicate-mission handling), and `AiCoachService` re-`find()`s to return the winner's row instead of treating it as a failure.

**Kill switch.** `AI_COACH_ENABLED=false` (or unset) makes `createAiGatewayFromEnv()` return `null`, and every request goes straight to `fallback-coach.ts`'s `buildFallbackCoachResponse` with zero provider calls, zero cache reads/writes. Missing/invalid `GEMINI_API_KEY`/`AI_COACH_MODEL`/`AI_PROVIDER` degrade the same way rather than throwing at startup or per-request.

**Responsibility split**: `AiCoachService` (`coach/ai-coach.service.ts`) is the single orchestrator — prompt generation, provider selection (via the factory), response validation, grounding, caching, and fallback all happen inside `getCoachResponse`, in the order: build+validate DTO → hash → cache lookup → gateway on a miss → validate → ground → persist → fall back at any failure point. The one existing caller, `GET /api/learners/[learnerId]/coach`, does only auth/ownership/param validation and JSON-serializes the result — no AI logic of its own. `src/components/ai/coach-card.tsx` is the UI's only interaction with any of this: `fetch(...)` the route client-side, render `{headline, message, strengths, focusAreas, nextSteps, source}` — the same "dumb UI" precedent already established for the Parent Intelligence Dashboard in Phase 5.3. It fetches client-side (not server-rendered with the rest of the page) specifically so a cache-miss Gemini call (up to a couple of seconds) never blocks the rest of the dashboard, and skips the request entirely for a learner with no mastery data yet (`hasData: false`), showing a static welcome message instead — no AI call for a brand-new learner.

**Reliability.** Every existing feature — mission generation, mastery, adaptive selection, recommendations, the Parent Dashboard — has zero code-level dependency on anything under `src/modules/ai/`; nothing there is imported by any of them. `getCoachResponse` itself never throws for an AI-side failure (timeout, 429/quota, malformed JSON, network error, disabled, missing key, validation/grounding rejection all route to the fallback); the one exception is a genuine ownership error from `ParentDashboardService.assertLearnerOwned`, which propagates so the route can return 403 rather than silently serving another parent's data.

**Scope note**: `OpenAI`/other-provider calls remain explicitly out of scope until a specific need schedules them — Gemini is the only implemented provider.

## Observability

- **Sentry** (`@sentry/nextjs`) is prepared but deliberately **not fully integrated** — wired up through Next's own `instrumentation.ts` (server: `register()` calls `Sentry.init`, `onRequestError` reports errors Next catches outside any route handler's own try/catch) and `instrumentation-client.ts` (browser), but `Sentry.init` only actually runs when `SENTRY_ENABLED`/`NEXT_PUBLIC_SENTRY_ENABLED` is explicitly `"true"` (`src/lib/observability/sentry-enablement.ts`) — a DSN being present isn't by itself enough to turn it on. This project deliberately does **not** use Sentry's `withSentryConfig` Next.js build plugin — this Next.js version's actual APIs differ enough from what that plugin assumes (see the note at the top of this doc about reading `node_modules/next/dist/docs/` before writing Next-specific code) that skipping it avoids an unverified compatibility risk for a "basic" setup. That means no automatic source-map upload; add `withSentryConfig` later once there's a real Sentry project/org/auth token to test it against.
- **Structured logging** (`src/lib/observability/logger.ts`) writes single-line JSON to `console.log`/`warn`/`error` — no external log shipper is wired up; this is meant to be readable by Vercel's own log capture (or whatever aggregator reads stdout) rather than a bespoke format.
- **Request IDs**: every `/api/**` route is wrapped in `withApiObservability` (`src/lib/observability/api.ts`), which assigns/reuses a request id, logs structured start/completion entries (status, duration), echoes the id on an `x-request-id` response header, and reports anything that escapes a route's own error handling to Sentry. See `docs/API.md` → "Observability" for the exact contract and the convention for wiring a new route into it.

## Environments & deployment

- Local: `.env.local` (see `docs/ENVIRONMENTS.md`)
- Preview: one Vercel deployment per pushed branch, sharing the same Supabase project as Production (no separate preview database at present — see `docs/ENVIRONMENTS.md` for the caveat)
- Production: `main`, protected (PR + passing `quality`/`e2e` checks required, no direct pushes)
- `SUPABASE_SERVICE_ROLE_KEY` is never read by the running app — only by the local `scripts/seedQuestions.ts` seeding script and `scripts/backfill-learning-mastery.ts` backfill script. See `docs/Database.md`.

## Branching

- `main` — production, protected
- `develop` — integration branch
- `feature/*` — one per unit of work, branched from `develop`, merged via PR with required status checks
