-- Phase 5.1: learning profile & mastery engine (current-state only — no
-- history table in v1; see docs/Database.md for the rationale).
--
-- Schema note: question_bank.skill_id is nullable, and in practice every
-- question seeded so far (scripts/seedQuestions.ts) has skill_id = null —
-- only subject_id/topic_id/difficulty are populated. The application layer
-- resolves a skill via question_bank.skill_id when present, otherwise via
-- the question's topic's sole active skill (see
-- src/modules/learning-profile/mastery.repository.ts). This migration does
-- not change question_bank; it only adds what's needed to persist mastery.

create table if not exists public.learner_skill_mastery (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references public.learners(id) on delete cascade,
  skill_id uuid not null references public.skills(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  topic_id uuid references public.topics(id) on delete set null,
  mastery_score smallint not null default 50 check (mastery_score between 0 and 100),
  confidence_score smallint not null default 50 check (confidence_score between 0 and 100),
  total_attempts integer not null default 0 check (total_attempts >= 0),
  correct_attempts integer not null default 0 check (correct_attempts >= 0),
  incorrect_attempts integer not null default 0 check (incorrect_attempts >= 0),
  average_response_ms integer check (average_response_ms is null or average_response_ms >= 0),
  last_response_ms integer check (last_response_ms is null or last_response_ms >= 0),
  current_streak integer not null default 0 check (current_streak >= 0),
  best_streak integer not null default 0 check (best_streak >= 0),
  -- Not in the suggested schema: tracks a consecutive-incorrect run so the
  -- "-1 additional mastery" penalty for repeated wrong answers can be
  -- applied without a second table. current_streak/best_streak alone only
  -- capture correct-answer runs (the usual "streak" meaning), so this is
  -- the minimal addition needed to implement the specified rule.
  current_incorrect_streak integer not null default 0 check (current_incorrect_streak >= 0),
  last_attempt_correct boolean,
  last_practised_at timestamptz,
  next_review_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (learner_id, skill_id),
  check (correct_attempts + incorrect_attempts <= total_attempts),
  check (not (current_streak > 0 and current_incorrect_streak > 0))
);

create index if not exists learner_skill_mastery_learner_idx
  on public.learner_skill_mastery(learner_id);
create index if not exists learner_skill_mastery_next_review_idx
  on public.learner_skill_mastery(next_review_at);
create index if not exists learner_skill_mastery_learner_subject_idx
  on public.learner_skill_mastery(learner_id, subject_id);

alter table public.learner_skill_mastery enable row level security;

-- Matches the existing "Parents manage own X" pattern used for
-- missions/mission_items/question_attempts: a single `for all` policy
-- scoped to learner ownership covers both the read path (dashboard/summary)
-- and the write path (mastery processing runs as the authenticated parent
-- via the normal server client — no service-role key at runtime).
drop policy if exists "Parents manage own learner skill mastery" on public.learner_skill_mastery;
create policy "Parents manage own learner skill mastery"
on public.learner_skill_mastery for all to authenticated
using (exists (
  select 1 from public.learners l
  where l.id = learner_id and l.parent_id = auth.uid()
))
with check (exists (
  select 1 from public.learners l
  where l.id = learner_id and l.parent_id = auth.uid()
));

-- Idempotency: marks the instant a question_attempts row's mastery effect
-- was successfully applied to learner_skill_mastery. Claimed atomically via
-- a single conditional UPDATE (... where mastery_processed_at is null),
-- which is safe under concurrent requests through Postgres's normal
-- row-level MVCC — no separate locking function needed. Never reset once
-- set: mastery reflects a learner's first recorded answer for a mission
-- item, so answer changes update the persisted attempt (existing behaviour)
-- but do not trigger a second mastery adjustment. See
-- src/modules/learning-profile/mastery.service.ts and docs/Architecture.md
-- for the full idempotency/concurrency strategy.
alter table public.question_attempts
  add column if not exists mastery_processed_at timestamptz;

create index if not exists question_attempts_mastery_unprocessed_idx
  on public.question_attempts(id)
  where mastery_processed_at is null;
