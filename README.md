# Project Amreen — Phase 0 Foundation

A lean production foundation for the Project Amreen adaptive tutoring platform.

## Included

- Next.js App Router with strict TypeScript
- Tailwind CSS
- Supabase browser and server clients using cookie-based SSR
- Environment validation with Zod
- Health endpoint
- Vitest unit testing and coverage gates
- Playwright desktop and mobile smoke tests
- GitHub Actions CI quality gate
- Supabase starter migration with row-level security
- Windows, environment and deployment documentation

## Quick start

```bash
cp .env.example .env.local
npm install
npx playwright install chromium
npm run dev
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env.local
npm install
npx playwright install chromium
npm run dev
```

Open `http://localhost:3000`.

## Commands

```bash
npm run dev
npm run lint
npm run typecheck
npm run format:check
npm run test
npm run test:coverage
npm run test:e2e
npm run build
npm run validate
```

## Supabase

1. Create a free Supabase project.
2. Copy `.env.example` to `.env.local`.
3. Add your project URL and publishable key.
4. Run `supabase/migrations/0001_phase0_health.sql` in the Supabase SQL Editor.

Never expose or commit the Supabase service-role key.

## Deployment

Import the GitHub repository into Vercel and configure the variables listed in `.env.example`. The health endpoint is `/api/health`.

## Phase 0 exit gate

- Local development works
- CI passes
- Unit and E2E tests pass
- Production build succeeds
- Supabase SSR clients compile
- Environment secrets remain outside source control
- Vercel deployment responds successfully

Phase 1 begins with parent authentication, learner profiles and row-level ownership policies.
