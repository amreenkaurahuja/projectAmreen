# Release Notes

Dates reflect commit history on `main`. Each entry is a shipped phase/epic, not an individual commit — see `git log` for the full detail.

## Phase 4 — Mission completion, review & dashboard state (2026-07-21, `feature/mission-completion`, unreleased)

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
