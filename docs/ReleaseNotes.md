# Release Notes

Dates reflect commit history on `main`. Each entry is a shipped phase/epic, not an individual commit — see `git log` for the full detail.

## Sprint 4.5 — Platform hardening (2026-07-21)

- Sentry's enablement made explicit: `Sentry.init` in `src/instrumentation.ts`/`instrumentation-client.ts` now only runs when `SENTRY_ENABLED`/`NEXT_PUBLIC_SENTRY_ENABLED` is literally `"true"` (`src/lib/observability/sentry-enablement.ts`) — a DSN being set is no longer, by itself, enough to turn it on. No behavior change (Sentry was already inert by default; this just makes "prepared but not fully integrated" unambiguous instead of implicit).
- Audited Epics 3–6 against a fresh checklist (docs, CHANGELOG, Husky/lint-staged, Prettier/ESLint, logging, Sentry prep) — all were already in place from prior work; this sprint's only functional addition was the explicit enablement flag above.

## Epic 6 — Release process (2026-07-21, tagged `v0.4.0`)

- `CHANGELOG.md` at the repo root (Keep a Changelog style), with entries for v0.1.0 through v0.4.0.
- `v0.4.0` tagged on `main`, marking the first MVP milestone (mission generation, resume, completion screen, review mistakes, plus the resume/dashboard/env-validation fixes).

## Epic 5 — Monitoring (2026-07-21, part of `v0.4.0`)

- Sentry (`@sentry/nextjs`) wired up via `src/instrumentation.ts` (server) and `src/instrumentation-client.ts` (browser), following this Next.js version's actual instrumentation file conventions rather than assuming Sentry's older setup docs apply — see `docs/Architecture.md` → "Observability". Safe no-op without `SENTRY_DSN`/`NEXT_PUBLIC_SENTRY_DSN` set (later made an explicit opt-in — see "Sprint 4.5" above).
- Basic structured logging (`src/lib/observability/logger.ts`) — single-line JSON to `console.*`, no external shipper.
- Request IDs for every `/api/**` route via `withApiObservability` (`src/lib/observability/api.ts`): generated or reused from an incoming `x-request-id` header, echoed on the response, logged on every request, and attached to any Sentry report from that request.

## Epic 4 — Developer tooling (2026-07-21, part of `v0.4.0`)

- Husky pre-commit hook (`.husky/pre-commit`): `npx lint-staged` (Prettier + `eslint --fix` on staged files) then the full `npm run lint` and `npm run typecheck`. Prettier and ESLint were already configured from Phase 0.

## Phase 4 — Mission completion, review & dashboard state (2026-07-21, part of `v0.4.0`)

- Completion screen: learner name, correct/total, accuracy %, questions completed, recorded time (or estimated minutes if no response time was recorded), per-subject breakdown, and a score-tier message (Outstanding work / Great job / Good effort / Keep practising).
- New `/learner/mission/review` screen: shows only incorrectly-answered questions with the learner's answer, the correct answer, and the explanation — or "Perfect score" if there were none.
- New `GET /api/missions/[missionId]/summary` and `GET /api/missions/[missionId]/review` endpoints, both authenticated, ownership-checked, and never exposing answer keys for unanswered questions.
- Dashboard now shows the mission's completion date/time alongside score and accuracy, and a "Review Mission" button in place of "Resume Mission" once complete.
- Introduced `mission-completion.calculations.ts` — pure accuracy/breakdown/score-message logic shared by the client completion screen and the server-rendered review page, so the two can never disagree.
- No database migration required — the schema from Phase 3A already supported everything this phase needed (see `docs/Database.md`).

## Mission-player resume fix (2026-07-21, merged via PR #1)

Two related production bugs, found and fixed on the same branch:

1. **Wrong resume index.** The mission player always opened at Question 1 regardless of how many questions were already answered. Fixed by computing the first unanswered item server-side from persisted attempts and passing it explicitly to the client as `initialIndex`, which the client now uses as-is instead of defaulting to `0`.
2. **RLS + PostgREST embed bug.** Even after fix (1), a specific production mission still resumed at the wrong question. Root cause, found through direct database verification: `SupabaseMissionPlayerRepository.getMissionItems` embedded `question_attempts` inside the `mission_items` select (PostgREST's automatic to-many embed), and under Row Level Security that embed silently returned zero rows for an attempt the RLS policy legitimately granted access to — confirmed by reproducing the same policy as a flat SQL join with the real user's `auth.uid()` simulated, which returned the attempt correctly. Fixed by fetching `question_attempts` as a separate query and merging in application code. See `docs/Architecture.md` for the full explanation.
3. Also hardened `/learner/dashboard`, `/learner/mission`, and `/learner/subjects/[slug]` against malformed `learner`/`mission` IDs in the URL, which previously crashed the page with a raw 500 instead of a clean redirect/404.

## Phase 3A — Daily missions & resume flow (2026-07-20)

- Deterministic daily mission generation: 16 questions per day, interleaved across Mathematics (8), English (4), Verbal Reasoning (2), Non-Verbal Reasoning (2), no repeats.
- `missions`, `mission_items`, `question_attempts` schema, with RLS scoping everything back to the owning parent.
- Answer submission with server-side correctness grading (the client never decides whether an answer is right).
- Resume-at-first-unanswered-question (later found to have the two bugs above, fixed in the following release).
- Concurrency-safe "get or create today's mission" (unique `(learner_id, mission_date)` constraint + duplicate-key recovery).

## Phase 2 — Curriculum foundation (2026-07-19)

- `subjects` / `topics` / `skills` / `learning_objectives` schema, seeded with the initial 11+ catalogue: 4 subjects, 16 topics, 16 skills, one objective per skill.
- `learner_subject_progress` for per-learner, per-subject progress rollups.
- `/learner/subjects/[slug]` curriculum browsing page.
- Also fixed: package-lock.json referencing an internal-only npm mirror, which broke Vercel's build environment.

## Phase 1 — Identity & learners (2026-07-19)

- Parent authentication via Supabase Auth.
- `learners` table (parent-owned child profiles) with full RLS.
- Learner creation flow (`/parent/learners/new`, `POST /api/learners`).
- Automatic learner route selection fix — routes that need a `learner` param now fall back to the parent's first learner instead of erroring when none is supplied.

## Phase 0 — Foundations (2026-07-17)

- Repository scaffold: Next.js App Router, TypeScript, Tailwind, Vitest, Playwright.
- Supabase connectivity (`system_health` table, `/api/health`).
- CI pipeline (`.github/workflows/ci.yml`): format check, lint, typecheck, unit tests, build, then a separate Playwright job.

## Infrastructure / process (ongoing, undated)

- `main` branch protection: PR required, `quality` + `e2e` status checks required, no direct pushes (including for admins).
- `develop` integration branch and `feature/*` branches (`adaptive-learning`, `parent-dashboard`, `ai-tutor`, `gamification`) created for the Epic 2 backlog.
- **Project Amreen MVP** GitHub Project board created (Backlog/Ready/In Progress/Review/Testing/Done), seeded with the Epic 2 feature set — see `docs/Roadmap.md`.
