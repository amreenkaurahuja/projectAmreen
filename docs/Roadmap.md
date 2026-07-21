# Roadmap

Day-to-day tracking lives on the **Project Amreen MVP** GitHub Project board: https://github.com/users/amreenkaurahuja/projects/2 (columns: Backlog → Ready → In Progress → Review → Testing → Done). This file is the narrative version — what's shipped, what's next, and why — kept in sync with that board rather than duplicating its card-by-card state.

## Shipped

- **Phase 0** — repo scaffold, Supabase connectivity, CI pipeline.
- **Phase 1** — parent auth (Supabase Auth) and learner profile creation.
- **Phase 2** — curriculum catalogue (subjects/topics/skills/objectives) as shared, read-only, seeded content.
- **Phase 3A** — daily mission generation (16 questions, interleaved across 4 subjects), answer persistence, resume-at-first-unanswered-question.
- **Phase 4** — mission completion screen (score, accuracy, time, per-subject breakdown, score-tier messaging), a dedicated Review Mistakes screen, and the dashboard's completed-mission state.
- **Epic 4** — Husky pre-commit hook (`lint-staged` + full lint/typecheck) on top of the Prettier/ESLint already in place from Phase 0.
- **Epic 5** — Sentry error tracking, structured logging, and request IDs for every `/api/**` route.
- **Phase 5.1** — deterministic, non-AI mastery/confidence engine (`learner_skill_mastery`), idempotent processing hooked into answer submission, a review-scheduling date per skill, and a small "Learning Profile" section on `/learner/dashboard`. Includes a same-branch follow-up (`0008_backfill_question_skill.sql`) making `question_bank.skill_id` mandatory, closing a gap where a topic gaining a second skill would have silently broken mastery tracking for it. See `docs/Architecture.md` → "Learning profile & mastery" for the algorithm and known v1 limitations.
- **Phase 5.2** — replaced the static 8/4/2/2 subject-interleave generator with a deterministic, explainable adaptive mission selector (weak-skill/review-due/curriculum-coverage/challenge allocation, seeded per learner/date, recent-question cooldown, soft subject balancing, mastery-driven difficulty targeting), plus a balanced baseline path for learners with no mastery data yet. See `docs/Architecture.md` → "Adaptive mission generation" for the algorithm and known v1 limitations.

See `docs/ReleaseNotes.md` for the detailed, chronological version of the above, including the production bugs found and fixed along the way.

## Backlog (Epic 2 — MVP feature set)

These correspond 1:1 to the cards seeded on the GitHub Project board, in the order they were seeded (not yet prioritized against each other):

1. **Parent Dashboard** — a real reporting surface for parents (multi-learner overview, trends over time, subject strengths/weaknesses), beyond today's single "today's mission" card on `/learner/dashboard`. Phase 5.1 added a minimal learner-facing profile section only; a parent-facing view is still open. Historical trend needs the planned `mastery_history` table (design sketched in `docs/Architecture.md` → "Planned: `mastery_history`", not yet built) since today's `learner_skill_mastery` is current-state only.
2. **AI Feedback** — generated, per-mistake feedback beyond the static `question_bank.explanation` text already shown on the Review Mistakes screen.
3. **Gamification** — streaks, badges, or similar motivation mechanics layered on top of mission completion.
4. **Analytics** — usage/outcome analytics, most likely event tracking plus the aggregation needed to feed the Parent Dashboard.
5. **AI Tutor** — an interactive, conversational help surface for a learner stuck on a question.
6. **Exam Simulator** — timed, full-length practice exam mode, distinct from the daily 16-question mission format.
7. **Runtime-configurable adaptive weights** — the category targets, cooldown, and subject soft-cap/minimum (`weakSkill: 7, reviewDue: 4, curriculumCoverage: 3, challenge: 2, cooldownDays: 7, subjectSoftCap: 7, subjectSoftMinimum: 2`) are already externalized as a single config object (`src/modules/adaptive-learning/adaptive-config.ts`'s `DEFAULT_ADAPTIVE_CONFIG`), and `AdaptiveMissionService`'s constructor already accepts an override — nothing in the selector hard-codes these. What's still missing is _runtime_ editability: a `mission_generation_config`-style table, a write path (admin or parent-facing) with validation (targets summing sensibly, non-negative cooldown, etc.), `AdaptiveMissionService` loading it per-request instead of the static default, and probably a cache so every generation doesn't add an extra query. Worth building once there's an actual need to tune these without a deploy (e.g. A/B testing strategies); would be scope creep to build speculatively.

Phase 5.2 shipped the deterministic adaptive mission generator (see Shipped, above), closing out the "Adaptive Learning Engine" card that used to head this list. A further, more sophisticated iteration (e.g. ML-driven question selection) could still be a future card, but nothing concrete is scoped yet.

## Known gaps (not epics, but tracked)

- **Preview environment isolation**: Preview and Production Vercel deployments currently share one Supabase project (see `docs/ENVIRONMENTS.md`). Worth a dedicated preview/staging Supabase project once real learner data exists.
- **No live Sentry project configured yet**: the SDK is wired up (see `docs/Architecture.md` → "Observability") but stays inert until `SENTRY_ENABLED`/`NEXT_PUBLIC_SENTRY_ENABLED` is explicitly set to `"true"` (a DSN alone isn't enough). Create a Sentry project, set the DSN and `*_ENABLED` env vars in Vercel to turn it on.

## Process

- Branch per unit of work (`feature/*` off `develop`), PR into `develop` (or directly into `main` for now, per current team size) with `quality` + `e2e` checks required to pass — see `docs/CodingStandards.md`.
- Update the GitHub Project card's column as work moves through Backlog → Ready → In Progress → Review → Testing → Done.
- When a phase/epic ships, add an entry to `docs/ReleaseNotes.md`.
