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

- `SENTRY_DSN` — server-side error tracking (`src/instrumentation.ts`). Unset by default; Sentry is a safe no-op without it, so this is not required to build or run the app.
- `NEXT_PUBLIC_SENTRY_DSN` — client-side error tracking (`src/instrumentation-client.ts`). Same no-op-if-unset behavior. This one is bundled into client-side JS like any other `NEXT_PUBLIC_*` variable, so treat the DSN itself as non-secret (Sentry DSNs are designed to be public) — the actual project access control lives in Sentry, not in keeping this value hidden.
