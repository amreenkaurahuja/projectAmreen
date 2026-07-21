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

Each domain (currently `missions` and `learning-profile`) is split into:

- **`*.types.ts`** — plain data shapes, no imports of Supabase or Next.js. Safe to import from client components.
- **`*.repository.ts`** — an interface plus a `Supabase*Repository` implementation. This is the _only_ place that talks to `supabase.from(...)`. Repository methods map Postgres rows to the domain's types and translate Postgres errors into typed domain errors (`MissionAccessError`, `MissionNotFoundError`, `MasteryAccessError`, …).
- **`*.service.ts`** — orchestrates one or more repositories, enforces ownership/authorization order-of-operations, and contains the actual business rules (e.g. "a mission is complete when every item has an attempt").
- **`*-calculator.ts` / `*-summary.ts` / `*.calculations.ts`** — pure, framework-agnostic functions with no Supabase import, so the exact same logic (mission scoring, mastery scoring, profile aggregation) can run in a Server Component _and_ in a `"use client"` component without duplicating it or smuggling a database call into the browser bundle. `mission-completion.calculations.ts`, `learning-profile/mastery-calculator.ts`, and `learning-profile/mastery-summary.ts` all follow this pattern.

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

### Planned: `mastery_history` (Phase 5.2, not yet built)

`learner_skill_mastery` is current-state only — no time series — so the dashboard can show "where a learner stands today" but not "how they've progressed" (no trend charts, plateau detection, or regression alerts). Design intent for Phase 5.2, not implemented in this phase:

- **New table**: `mastery_history(id, learner_id, skill_id, mastery_score, confidence_score, recorded_at, source)`, append-only, indexed on `(learner_id, skill_id, recorded_at)`. No RLS write path from the client — only ever written by `MasteryService`.
- **Write strategy**: snapshot-on-change, not snapshot-per-attempt — append a row only when an attempt actually moves `mastery_score` (skip the write when a score is already clamped at 0/100 and the attempt doesn't move it). This keeps the log proportional to genuine progress rather than growing one row per question forever, while still being granular enough for a "May 1 → June 5" style trend chart. The alternative (periodic, e.g. daily, snapshots) is cheaper still but would miss same-day swings; worth revisiting if snapshot-on-change turns out to grow faster than expected once there's real usage data.
- **Where it plugs in**: `MasteryService.applyWithRetry`, right after a successful `insertMasteryRow`/`updateMasteryRow`, comparing the previous and new `mastery_score`.
- **Known v1 limitations carried into this design**: no adaptive question selection yet (mastery is recorded but doesn't influence mission generation); no charts yet (the dashboard section is plain stat tiles by design for this phase); the backfill script loads all pending attempts in a single query rather than paginating (fine at this project's current data volume).

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
