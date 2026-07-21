# Roadmap

Day-to-day tracking lives on the **Project Amreen MVP** GitHub Project board: https://github.com/users/amreenkaurahuja/projects/2 (columns: Backlog → Ready → In Progress → Review → Testing → Done). This file is the narrative version — what's shipped, what's next, and why — kept in sync with that board rather than duplicating its card-by-card state.

## Shipped

- **Phase 0** — repo scaffold, Supabase connectivity, CI pipeline.
- **Phase 1** — parent auth (Supabase Auth) and learner profile creation.
- **Phase 2** — curriculum catalogue (subjects/topics/skills/objectives) as shared, read-only, seeded content.
- **Phase 3A** — daily mission generation (16 questions, interleaved across 4 subjects), answer persistence, resume-at-first-unanswered-question.
- **Phase 4** — mission completion screen (score, accuracy, time, per-subject breakdown, score-tier messaging), a dedicated Review Mistakes screen, and the dashboard's completed-mission state.

See `docs/ReleaseNotes.md` for the detailed, chronological version of the above, including the production bugs found and fixed along the way.

## Backlog (Epic 2 — MVP feature set)

These correspond 1:1 to the cards seeded on the GitHub Project board, in the order they were seeded (not yet prioritized against each other):

1. **Adaptive Learning Engine** — vary question selection/difficulty per learner based on past performance, instead of the current fixed subject-count interleave (`mission.generator.ts`).
2. **Parent Dashboard** — a real reporting surface for parents (multi-learner overview, trends over time, subject strengths/weaknesses), beyond today's single "today's mission" card on `/learner/dashboard`.
3. **AI Feedback** — generated, per-mistake feedback beyond the static `question_bank.explanation` text already shown on the Review Mistakes screen.
4. **Gamification** — streaks, badges, or similar motivation mechanics layered on top of mission completion.
5. **Analytics** — usage/outcome analytics, most likely event tracking plus the aggregation needed to feed the Parent Dashboard and Adaptive Learning Engine.
6. **AI Tutor** — an interactive, conversational help surface for a learner stuck on a question.
7. **Exam Simulator** — timed, full-length practice exam mode, distinct from the daily 16-question mission format.

## Known gaps (not epics, but tracked)

- **Test coverage threshold**: `npm run test:coverage` currently fails the repo's own 80/70/80/80 thresholds (mostly untested Server Component pages and `catalogue.ts`) — pre-existing before Phase 4, not blocking `main` since `quality`'s required check runs `test`, not `test:coverage`. Should be closed before it grows further.
- **Preview environment isolation**: Preview and Production Vercel deployments currently share one Supabase project (see `docs/ENVIRONMENTS.md`). Worth a dedicated preview/staging Supabase project once real learner data exists.

## Process

- Branch per unit of work (`feature/*` off `develop`), PR into `develop` (or directly into `main` for now, per current team size) with `quality` + `e2e` checks required to pass — see `docs/CodingStandards.md`.
- Update the GitHub Project card's column as work moves through Backlog → Ready → In Progress → Review → Testing → Done.
- When a phase/epic ships, add an entry to `docs/ReleaseNotes.md`.
