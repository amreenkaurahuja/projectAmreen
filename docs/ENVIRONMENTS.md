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
