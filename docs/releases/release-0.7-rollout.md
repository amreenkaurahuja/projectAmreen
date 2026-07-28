# Release 0.7 — Rollout Guide

AI Learning Companion (Question Explainer) & Learning Metrics. Written from the Stage 7.1 Operational Readiness Audit; see that audit (and `docs/ReleaseReadiness.md` → "Release 0.7") for the full evidence behind each step below. This document is the operational companion to TDS-007/TDS-008 — it says what to _do_, not what was _decided_.

## The one thing that matters most

**Deployment and migration application are two independent processes.** Vercel deploys automatically the moment a PR merges to `main` — nothing in CI or the Vercel build applies a database migration. If application code that depends on a migration (e.g. anything touching `learning_events`) is live before that migration has been applied to the Supabase project, every affected request will fail server-side. This has no learner-visible consequence for the Question Explainer or Learning Metrics specifically (see "Known operational limitations" below), but it will be visible in logs/Sentry as a wave of 500s.

**Always apply the migration before merging the PR that depends on it — not after.**

## Migration order

Apply in numeric order via the Supabase CLI or dashboard SQL editor (`docs/Database.md`). For a database already at Release 0.6 (through `0010`), Release 0.7 adds:

1. `0011_phase5_question_explainer_persistence.sql` — `question_explanations` cache table
2. `0012_learning_events.sql` — the append-only `learning_events` table
3. `0013_learning_event_identity.sql` — adds `event_id` (unique) to `learning_events`

All three are additive (`create table if not exists`, `add column if not exists`) and safe to re-run. `0013` specifically requires `learning_events` to be empty at the time it's applied — true for any environment where `0012` was applied and nothing has written to it yet, which is guaranteed since no code writes to that table until the code shipped alongside/after `0013` is also deployed.

There is only one Supabase project in this application's current environment setup (Preview and Production share it — `docs/ENVIRONMENTS.md`), so there is no separate staging database to rehearse this sequence against first.

## Deployment sequence

1. Apply migrations `0011`–`0013` (if not already applied from earlier incremental releases of this work).
2. Merge/deploy application code. Vercel builds and deploys automatically on merge to `main` — no separate deploy step.
3. Confirm the build succeeded (Vercel dashboard) and `GET /api/health` returns 200. Note this endpoint only confirms the Node process is responding — it does not query Supabase, so it cannot by itself confirm database connectivity or that the migrations above were applied.
4. Manually exercise one Supabase-dependent page (e.g. a learner dashboard load) to confirm actual database connectivity — `/api/health` won't catch a missing-migration or connectivity failure.

## Feature-flag states for this release

| Flag                                             | Recommended state at initial deploy                                                                                                                                                                                             | Type               |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| `AI_QUESTION_EXPLAINER_ENABLED`                  | Set to whatever this environment's existing AI Platform posture already is — this flag only controls whether the Question Explainer calls Gemini; with it off, the deterministic fallback explanation is still fully functional | Server, runtime    |
| `NEXT_PUBLIC_QUESTION_EXPLAINER_METRICS_ENABLED` | **Leave unset/false** for the initial deploy. This makes Release 0.7 deployable with zero new production writes and zero new outbound requests — activation is a deliberate, separate step (below)                              | Client, build-time |

Both flags default to disabled/off if left unset — neither requires an explicit `"false"`.

## Metrics enablement procedure (a separate, later step — never bundled with a code deploy)

1. Confirm migrations `0011`–`0013` are applied (see above) and the Release 0.7 code deploy has already gone out and been running cleanly.
2. Set `NEXT_PUBLIC_QUESTION_EXPLAINER_METRICS_ENABLED=true` in the target Vercel environment.
3. **Trigger a new build/deploy.** This is a build-time-inlined variable — changing it in Vercel's dashboard alone does nothing until the next build.
4. Trigger one real explanation flow (open → view a step → close or complete) as a smoke test.
5. Confirm a row appears in `learning_events` for that session (direct query, or a temporary script using `SupabaseQuestionExplainerMetricsRepository`).
6. Watch logs/Sentry (if enabled) for `learning-event.delivery-rejected` / `learning-event.delivery-error` volume over the following hour — an elevated rate indicates a problem worth investigating, though per design it never affects the learner experience either way.

**Rollback trigger**: unexpected error volume on `POST /api/v1/learning-events`, or any unexpected change in learner-facing behaviour (which would itself indicate a bug elsewhere, since activation is designed to be behaviourally invisible).

## Rollback procedure

Three independent categories — do not conflate them:

- **Feature-flag rollback** (fastest, safest): unset the relevant flag. The two flags roll back differently, matching their type in the "Feature-flag states" table above — `AI_QUESTION_EXPLAINER_ENABLED` is a **server, runtime** flag, so unsetting it takes effect on the next request with no redeploy; `NEXT_PUBLIC_QUESTION_EXPLAINER_METRICS_ENABLED` is **client, build-time**, so unsetting it requires a rebuild/redeploy to take effect, same as enabling it did. No data cleanup required either way — persisted rows remain historically accurate and don't need to be purged.
- **Code rollback**: redeploy the previous Vercel deployment (standard Vercel capability — not something this codebase implements). Safe for any application-code issue that isn't schema-related.
- **Migration rollback**: **no automated mechanism exists.** `0008` (an earlier release) and `0013` are structurally irreversible without hand-writing a new corrective migration. If a migration-level issue is ever found, treat it as "write and apply a new forward migration," not "revert."

## Known operational limitations

Carried forward from the Stage 7.1 audit and `docs/testing/learning-metrics-behaviour.md` — none of these are release blockers, all are intentional:

- Best-effort metrics delivery: one attempt per event, no retry, no queue. Incomplete sessions in `learning_events` are expected, not a bug.
- The client's `occurred_at` timestamp is accepted without skew validation.
- No reporting UI, dashboard, or API route — `SupabaseQuestionExplainerMetricsRepository`/`calculateQuestionExplainerMetrics` are a library surface only.
- No subsequent-correctness metric.
- AI budget guard and provider health tracker are in-memory/per-process, not a true global cap across Vercel instances (inherited from v0.6.0).
- No dedicated preview/staging Supabase project — Preview and Production share one database (inherited from v0.6.0).
- No live Sentry project configured — error-tracking code is present but inert until `SENTRY_ENABLED`/`NEXT_PUBLIC_SENTRY_ENABLED` are explicitly set.

See `docs/testing/learning-metrics-behaviour.md` for the full behavioural contract and `docs/ReleaseReadiness.md` → "Release 0.7" for the complete readiness matrix.
