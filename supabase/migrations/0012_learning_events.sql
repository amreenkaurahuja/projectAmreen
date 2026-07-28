-- TDS-008 Stage 6.2: Learning Event persistence.
--
-- Stores one immutable row per educational interaction event emitted by
-- QuestionExplainerFlow's LearningEventPublisher (Stage 6.1:
-- src/modules/question-explainer/explanation-event.types.ts). Per TDS-008
-- §9 (Persistence Architecture) and ADR-008-1, this is the project's first
-- append-only event store: rows are historical facts, never updated after
-- insert. If an event's meaning changes, that is a new event, not a
-- modification of an existing row.
--
-- Schema-only migration: no repository or endpoint writes to this table
-- yet. `learner_id` will be populated by the Stage 6.3 delivery endpoint,
-- which resolves it server-side from `attempt_id` the same way
-- QuestionExplainerRepository.getLearnerIdForAttempt already does
-- (TDS-008 §9.7) — the client never supplies it. `session_id` is a
-- correlation identifier only (TDS-008 §9.7): it groups the rows from one
-- explanation-flow interaction together, but is never a primary key or a
-- foreign key to any other table.
--
-- No `updated_at` column, by design: the project convention (see the
-- Stage 0 persistence audit) is that `updated_at` only exists on tables
-- the application mutates after insert. An immutable event is never
-- updated, so the column would be meaningless (TDS-008 §9.6).

create table if not exists public.learning_events (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references public.learners(id) on delete cascade,
  attempt_id uuid not null references public.question_attempts(id) on delete cascade,
  session_id uuid not null,
  event_type text not null check (event_type in (
    'explanation_opened', 'step_viewed', 'explanation_completed', 'explanation_abandoned'
  )),
  step text check (step is null or step in (
    'acknowledge', 'explain', 'worked_example', 'next_step'
  )),
  last_step text check (last_step is null or last_step in (
    'acknowledge', 'explain', 'worked_example', 'next_step'
  )),
  exit_method text check (exit_method is null or exit_method in (
    'escape', 'close_button', 'backdrop', 'navigation', 'unmount', 'error'
  )),
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  -- occurred_at: when the interaction actually happened, from the client's
  -- own clock (mirrors LearningEvent.occurredAt). created_at: when the row
  -- was persisted, database-generated. Kept distinct on purpose — network
  -- delay or a Stage 6.3 retry means these will not always match, and that
  -- gap is itself useful for delivery-health analysis.
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  -- Mirrors the LearningEvent discriminated union at the database layer:
  -- each event_type has an exact, non-overlapping set of populated fields.
  check (
    (event_type = 'explanation_opened'
      and step is null and last_step is null and exit_method is null and duration_ms is null)
    or (event_type = 'step_viewed'
      and step is not null and last_step is null and exit_method is null and duration_ms is null)
    or (event_type = 'explanation_completed'
      and step is null and last_step is null and exit_method is null and duration_ms is not null)
    or (event_type = 'explanation_abandoned'
      and step is null and last_step is not null and exit_method is not null and duration_ms is not null)
  )
);

create index if not exists learning_events_learner_idx
  on public.learning_events(learner_id);
create index if not exists learning_events_attempt_idx
  on public.learning_events(attempt_id);
create index if not exists learning_events_session_idx
  on public.learning_events(session_id);

alter table public.learning_events enable row level security;

-- Deliberately narrower than the "Parents manage own X" `for all` policy
-- used elsewhere (learner_skill_mastery/missions/mission_items/
-- question_attempts/ai_coaching_messages/question_explanations). TDS-008
-- §9.4 states that updates and deletes are not part of the educational
-- model for this table — omitting update/delete policies enforces that
-- structurally, the same way Stage 6.1's no-op publisher makes AP-1 true
-- by construction rather than by convention: even the owning parent's
-- authenticated session cannot update or delete a row through PostgREST.
drop policy if exists "Parents can view own learning events" on public.learning_events;
create policy "Parents can view own learning events"
on public.learning_events for select to authenticated
using (
  exists (
    select 1 from public.learners
    where learners.id = learning_events.learner_id
      and learners.parent_id = auth.uid()
  )
);

drop policy if exists "Parents can record own learning events" on public.learning_events;
create policy "Parents can record own learning events"
on public.learning_events for insert to authenticated
with check (
  exists (
    select 1 from public.learners
    where learners.id = learning_events.learner_id
      and learners.parent_id = auth.uid()
  )
);
