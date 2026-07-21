# Changelog

All notable changes to this project are documented here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/), grouped by shipped milestone rather than by individual commit — see `docs/ReleaseNotes.md` for the more detailed, chronological version, and `git log` for full commit history.

## v0.4.0 — First MVP milestone

### Added

- Mission generation
- Resume support
- Completion screen
- Review mistakes

### Fixed

- Resume starting at Question 1
- Dashboard progress
- Runtime environment validation

## v0.3.0 — Daily missions

- Deterministic daily mission generation: 16 questions per day, interleaved across Mathematics (8), English (4), Verbal Reasoning (2), Non-Verbal Reasoning (2), with no repeats.
- `missions` / `mission_items` / `question_attempts` schema, scoped end-to-end by Row Level Security.
- Server-side answer grading — the client never decides whether an answer is correct.
- Concurrency-safe "get or create today's mission."

## v0.2.0 — Curriculum foundation

- Curriculum catalogue (subjects, topics, skills, learning objectives), seeded with the initial 11+ content: 4 subjects, 16 topics, 16 skills.
- Per-learner, per-subject progress tracking.
- Curriculum browsing pages.

## v0.1.0 — Identity foundation

- Parent authentication (Supabase Auth).
- Parent-owned learner profiles, fully RLS-scoped.
- Repository scaffold: Next.js App Router, TypeScript, Tailwind, Vitest, Playwright, CI pipeline.
