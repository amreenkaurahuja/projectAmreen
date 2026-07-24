# API

All routes live under `src/app/api/**` (Next.js Route Handlers) plus one non-`/api` auth callback. Unless stated otherwise:

- Requests must carry a valid Supabase session cookie (checked via `supabase.auth.getUser()`); missing/invalid session → **401**.
- Path/query params that are supposed to be UUIDs are validated with Zod; malformed → **400**.
- Ownership (does this learner/mission belong to the caller?) is enforced server-side, never trusted from the client; violation → **403**.
- Referencing a mission/item that doesn't exist for that learner → **404**.
- Unexpected failures → **500** with a generic `{ "error": "Internal server error" }` body — no stack traces or internals in the response.
- Every response carries an `x-request-id` header (reused from the request's own `x-request-id` if the caller sent one, otherwise generated). See "Observability" below.

## `GET /api/health`

No auth required. Liveness check.

```json
{
  "status": "ok",
  "service": "project-amreen-web",
  "timestamp": "2026-07-21T10:00:00.000Z"
}
```

## `GET /api/curriculum`

Auth required (401 if not). Returns the full active curriculum catalogue.

```json
{
  "subjects": [
    { "id": "...", "slug": "mathematics", "name": "Mathematics", "...": "..." }
  ]
}
```

## `POST /api/learners`

Auth required. Creates a learner profile owned by the caller.

**Body** (`learnerSchema`):

```json
{ "displayName": "Amelia", "schoolYear": 5, "examTarget": "11+" }
```

- `displayName`: 1–80 chars, trimmed
- `schoolYear`: integer 1–13
- `examTarget`: optional, ≤120 chars

**Responses**: `201 { "learnerId": "<uuid>" }` · `400` invalid body · `401` unauthenticated · `500` on insert failure.

## `GET /api/missions/today?learner=<uuid>`

Auth required. Returns today's mission for the learner, creating it if it doesn't exist yet. As of Phase 5.2, generation is **adaptive** — up to 16 questions chosen from the learner's mastery, review schedule, and curriculum coverage (deterministic per learner/date, no randomness), falling back to a balanced baseline mix for a learner with no mastery data yet. See `docs/Architecture.md` → "Adaptive mission generation" for the algorithm. Concurrency-safe: a duplicate-create race resolves by re-reading the winning row.

**Responses**: `200` → `MissionSummary` (see `mission.types.ts`) · `400` invalid learner id · `401` · `403` learner not owned · `409` insufficient active questions in the bank, or a genuine create conflict · `500`.

## `GET /api/missions/[missionId]?learner=<uuid>`

Auth required. Returns the full mission-player payload: all 16 questions, options (correct answer + explanation withheld until answered), and any existing attempt per question.

**Responses**: `200` → `MissionPlayer` (see `mission-player.types.ts`) · `400` invalid ids · `401` · `403` · `404` mission doesn't belong to that learner · `500`.

## `POST /api/missions/[missionId]/attempts`

Auth required. Records (or updates) the learner's answer to one mission item. Correctness is computed **server-side** from the stored `question_options.is_correct` — the client only sends which option it picked. When this is the 16th distinct answered item, the mission is marked `completed` with a `completed_at` timestamp (idempotent — replaying an answer after completion keeps the original `completed_at`).

**Body**:

```json
{
  "learnerId": "<uuid>",
  "missionItemId": "<uuid>",
  "optionId": "<uuid>",
  "responseMs": 4200
}
```

`responseMs` optional, defaults to `0`, clamped server-side to `0..3_600_000`.

**Response** `200`:

```json
{
  "missionItemId": "...",
  "isCorrect": true,
  "correctOptionId": "...",
  "explanation": "...",
  "mission": {
    "status": "in_progress",
    "totalQuestions": 16,
    "answeredCount": 7,
    "correctCount": 5,
    "completedAt": null
  }
}
```

**Errors**: `400` invalid mission id / invalid body / option doesn't belong to that question · `401` · `403` · `404` mission item not found for this mission.

## `GET /api/missions/[missionId]/summary?learner=<uuid>`

Auth required. Returns the completion summary shown on the "Mission Complete" screen: correct/total, accuracy %, total recorded response time (falls back to the mission's estimated minutes if no response time was ever recorded), a score-tier message, and a per-subject breakdown (attempted/correct/accuracy, counting only _attempted_ questions per subject).

**Response** `200` → `MissionCompletionSummary` (see `mission-completion.types.ts`).
**Errors**: `400` / `401` / `403` / `404` — same semantics as the routes above.

## `GET /api/missions/[missionId]/review?learner=<uuid>`

Auth required. Returns only the **incorrectly answered** questions (prompt, the learner's selected answer, the correct answer, explanation, subject, topic). Unanswered questions are never touched by this endpoint, so their correct-answer key is never exposed. `isPerfectScore: true` when there are no mistakes among the answered questions.

**Response** `200` → `MissionReview` (see `mission-completion.types.ts`).
**Errors**: `400` / `401` / `403` / `404`.

## `GET /api/learners/[learnerId]/mastery-summary`

Auth required. Returns the learner's aggregated learning profile — overall mastery/confidence, total questions answered, correct answers, overall accuracy, average response time, strongest/weakest subject, strongest/weakest skills (max 3 each), skills due for review, and last-practised timestamp. Subject summaries are weighted averages by attempts. Returns a graceful all-`null`/empty shape (`hasData: false`) for a learner with no mastery data yet, rather than an error.

**Response** `200` → `LearnerProfileSummary` (see `mastery.types.ts`).
**Errors**: `400` invalid learner id · `401` · `403` learner not owned · `500`.

## Parent Intelligence Dashboard (Phase 5.3)

`/parent/learners/[learnerId]` is a Server Component page, not an `/api/**` route — it calls `ParentDashboardService` directly server-side, the same pattern `/learner/dashboard` already uses for mission/mastery data. No new API endpoint was added for it; see `docs/Architecture.md` → "Parent Intelligence Dashboard" for the service/repository it's built on.

## `GET /auth/callback?code=<code>`

Not under `/api`. Supabase OAuth/magic-link redirect target — exchanges `code` for a session, then redirects to `/parent/dashboard`. No JSON response.

## Observability

Every `/api/**` route is exported wrapped in `withApiObservability(routeName, handler)` (`src/lib/observability/api.ts`):

- **Request IDs**: reused from an incoming `x-request-id` request header if present, otherwise generated with `crypto.randomUUID()`. Always echoed back on the response's `x-request-id` header and passed as the wrapped handler's third argument, so route code can include it in its own log lines.
- **Structured logging**: `src/lib/observability/logger.ts` writes single-line JSON (`timestamp`, `level`, `message`, plus whatever context is passed) via `console.log`/`warn`/`error`. The wrapper itself logs `api.request.started` and `api.request.completed` (with status code and duration) for every request, regardless of outcome.
- **Sentry**: prepared, not fully integrated — `src/instrumentation.ts` (server) and `src/instrumentation-client.ts` (browser) only call `Sentry.init` when `SENTRY_ENABLED`/`NEXT_PUBLIC_SENTRY_ENABLED` is `"true"` (see `docs/ENVIRONMENTS.md`); otherwise these `Sentry.captureException` calls are harmless no-ops. The wrapper's own `catch` reports anything that escapes a route handler's internal error handling to `Sentry.captureException`, tagged with `request_id` and `route`. Known 4xx outcomes (401/403/404/etc.) are **not** sent to Sentry — only genuinely unexpected failures are, matching each route's existing generic-500 branch.

## Conventions for adding a new route

1. Zod-validate every path/query param that should be a UUID before touching Supabase (Postgrest throws a hard error on malformed UUID input otherwise).
2. Wrap the exported handler in `withApiObservability("<METHOD> <path>", async (request, context, requestId) => { ... })`.
3. Build the client via `createClient()` from `@/lib/supabase/server`, check `auth.getUser()`, `401` if absent.
4. Construct `new Supabase<X>Repository(supabase)` → `new <X>Service(repository)`, call the service inside `try/catch`.
5. Map `MissionAccessError → 403`, `*NotFoundError → 404`, anything else → generic `500`. In that final branch, call `Sentry.captureException(error, { tags: { request_id: requestId, route: "<METHOD> <path>" } })` and `logger.error(...)` before returning the response — never echo the raw error to the client.
6. Never read `SUPABASE_SERVICE_ROLE_KEY` from a route handler — it isn't available to the running app and shouldn't be (see `docs/Database.md`).
