# Project Amreen

Production-oriented, low-cost adaptive tutoring platform.

## Current milestone

Phase 1 Identity and Learner Foundation: parent authentication, secure learner creation, parent dashboard, learner dashboard, Supabase RLS and automated validation.

## Local setup

```powershell
Copy-Item .env.example .env.local
npm install
npm run dev
```

Open `http://localhost:3000`.

## Database migrations

Run in order through Supabase SQL Editor:

1. `supabase/migrations/0001_phase0_health.sql`
2. `supabase/migrations/0002_phase1_identity.sql`

See `docs/PHASE1_SETUP.md` for authentication URL configuration.

## Quality checks

```powershell
npm run validate
npm run test:e2e
```

## Phase 2 — Curriculum foundation

The application now includes a secure, seeded 11+ curriculum catalogue for Mathematics, English, Verbal Reasoning and Non-Verbal Reasoning. Apply `supabase/migrations/0003_phase2_curriculum.sql` and follow `docs/PHASE2_SETUP.md`.
