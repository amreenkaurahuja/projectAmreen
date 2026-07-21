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

Each domain (currently `missions`) is split into:

- **`*.types.ts`** — plain data shapes, no imports of Supabase or Next.js. Safe to import from client components.
- **`*.repository.ts`** — an interface plus a `Supabase*Repository` implementation. This is the _only_ place that talks to `supabase.from(...)`. Repository methods map Postgres rows to the domain's types and translate Postgres errors into typed domain errors (`MissionAccessError`, `MissionNotFoundError`, …).
- **`*.service.ts`** — orchestrates one or more repositories, enforces ownership/authorization order-of-operations, and contains the actual business rules (e.g. "a mission is complete when every item has an attempt").
- **`*.calculations.ts`** (mission-completion only) — pure, framework-agnostic functions with no Supabase import, so the exact same accuracy/breakdown/score-message logic can run in a Server Component _and_ in a `"use client"` component without duplicating it or smuggling a database call into the browser bundle.

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

## Environments & deployment

- Local: `.env.local` (see `docs/ENVIRONMENTS.md`)
- Preview: one Vercel deployment per pushed branch, sharing the same Supabase project as Production (no separate preview database at present — see `docs/ENVIRONMENTS.md` for the caveat)
- Production: `main`, protected (PR + passing `quality`/`e2e` checks required, no direct pushes)
- `SUPABASE_SERVICE_ROLE_KEY` is never read by the running app — only by the local `scripts/seedQuestions.ts` seeding script. See `docs/Database.md`.

## Branching

- `main` — production, protected
- `develop` — integration branch
- `feature/*` — one per unit of work, branched from `develop`, merged via PR with required status checks
