# Environments

## Local

Copy `.env.example` to `.env.local` and provide the URL and publishable key from Supabase **Project Settings → API**.

## Preview

Vercel creates a preview deployment for each pull request. Use a non-production Supabase project when preview testing begins. Do not copy real learner data into preview.

## Staging

Create a separate Vercel project or branch deployment and a separate Supabase project before Phase 1 handles learner data.

## Production

Production secrets live only in Vercel/Supabase secret stores. Never commit `.env.local` or service-role keys.

## Required variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_APP_URL`
- `APP_ENV`

`SUPABASE_SERVICE_ROLE_KEY` is **not** consumed by the Next.js runtime — it is required only by the local `scripts/seedQuestions.ts` question-seeding script (validated separately in `scripts/env.ts`) and must never be set in Vercel project environment variables.

## Optional variables

Sentry is prepared but **not fully integrated** — it stays inert until explicitly turned on, regardless of whether a DSN is set, via the `*_ENABLED` flags below. Neither is required to build or run the app.

- `SENTRY_DSN` / `SENTRY_ENABLED` — server-side error tracking (`src/instrumentation.ts`). `Sentry.init` only runs when `SENTRY_ENABLED=true`.
- `NEXT_PUBLIC_SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_ENABLED` — client-side error tracking (`src/instrumentation-client.ts`), same gating via `NEXT_PUBLIC_SENTRY_ENABLED=true`. Both `NEXT_PUBLIC_*` values are bundled into client-side JS like any other `NEXT_PUBLIC_*` variable — treat the DSN itself as non-secret (Sentry DSNs are designed to be public); the actual project access control lives in Sentry, not in keeping this value hidden.

See `docs/Architecture.md` → "Observability" for the full picture, and `src/lib/observability/sentry-enablement.ts` for the gating logic.

- `AI_ENABLED` / `AI_PROVIDER` / `GEMINI_API_KEY` / `AI_COACH_MODEL` — the AI Platform (Phase 5.4), server-only, never `NEXT_PUBLIC_*` (`GEMINI_API_KEY` must never reach the client bundle). `AI_ENABLED` is the platform-level master switch (`gateway/gateway-factory.ts`'s `createAiGatewayFromEnv`); with it unset or `false`, no provider is ever called. `AI_COACH_MODEL` has no hardcoded fallback anywhere in the codebase (`providers/gemini-provider.ts` reads it directly) — set it to a currently-supported Gemini Flash model id.
- `AI_COACH_ENABLED` / `AI_LEARNER_ENABLED` / `AI_PARENT_ENABLED` — feature-level flags for the AI Learning Coach specifically, layered on top of (not instead of) `AI_ENABLED` (`isCoachEnabledForAudience` in `gateway/gateway-factory.ts`). All three must be `true`, for the relevant audience, before the coach endpoint (`GET /api/learners/[learnerId]/coach`) actually calls Gemini for that request — any one being off routes to the deterministic fallback. Splitting these out (rather than one flag) lets the learner-facing and parent-facing surfaces — and any future second AI feature with its own flag — be rolled out independently without a redeploy.
- `AI_MONTHLY_BUDGET_GBP` / `AI_ESTIMATED_GBP_PER_1K_TOKENS` — optional budget-guard tuning (`shared/budget-manager.ts`), defaulting to £10/month and a placeholder per-token price if unset. This is an in-memory, per-process estimate (see the module's doc comment for why), not a substitute for the provider's own billing alerts. Once the estimated monthly cost reaches the budget, every request degrades to the deterministic fallback until the next calendar month.
- `AI_QUESTION_EXPLAINER_ENABLED` — the Question Explainer's own AI-generation switch (TDS-007 Stage 2, `isQuestionExplainerEnabledForAudience` in `modules/ai/shared/feature-flags.ts`), layered on `AI_ENABLED` and the same `AI_LEARNER_ENABLED`/`AI_PARENT_ENABLED` audience flags used by the coach above — not a separate pair. With it unset or `false`, `POST /api/v1/question-explanations` always returns the deterministic fallback explanation, never calling Gemini. Note this function does not check `AI_ENABLED` itself — the route composes it with `createAiGatewayFromEnv()`, which does — so the platform-wide master switch is still enforced today, just not from within this helper. Not to be confused with `NEXT_PUBLIC_QUESTION_EXPLAINER_METRICS_ENABLED` below, which gates learning-metrics delivery, not AI generation.

With AI disabled or unconfigured at any layer above, the platform stays fully deterministic — see `docs/Architecture.md` → "AI Platform (Phase 5.4)".

- `NEXT_PUBLIC_QUESTION_EXPLAINER_METRICS_ENABLED` — TDS-008 Stage 6.3C: selects `QuestionExplainerFlow`'s default `LearningEventPublisher` (`modules/question-explainer/default-learning-event-publisher.ts`). Unlike every AI flag above, this one is deliberately `NEXT_PUBLIC_*` and read client-side (`metrics-feature-flag.ts`) — it gates a client component's choice between the no-op publisher and the real HTTP one, not a server-only capability. Unset, empty, or anything other than the literal string `"true"` keeps the safe no-op default (identical behaviour to before Stage 6.3B); no learner-visible behaviour ever depends on this flag either way (AP-1). Merging Stage 6.3C's code does not itself change this variable in any deployed environment — enabling delivery is a separate, deliberate configuration change.
  - Operational note: because this is a `NEXT_PUBLIC_*` variable, Next.js inlines its value into the client bundle at **build time**, not read at request time like the server-only `AI_*` flags above. Changing it in Vercel requires a rebuild/redeploy to take effect — toggling the value alone, without triggering a new build, will not change client behaviour.
