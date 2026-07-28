-- TDS-008 Stage 6.3A: Learning Event identity.
--
-- Additive migration on top of 0012_learning_events.sql. Adds `event_id`,
-- the identifier for "one educational occurrence" per TDS-008 §10.8 —
-- distinct from `id` (the database row, assigned by Postgres on insert),
-- `session_id` (one explanation-flow interaction, shared across many
-- events), and requestId (one HTTP execution, operational-only, never
-- part of this table). `id` remains the primary key; `event_id` is a
-- separate, independently unique column, not a replacement for it.
--
-- No default is set on `event_id` — deliberately. It is generated once by
-- the publisher (question-explainer-flow.tsx) at event-creation time via
-- `crypto.randomUUID()`, never by the database or by a repository/route on
-- insert. A database-generated default would silently mask a bug where
-- the application forgot to supply one, and — per §10.8 — generating it
-- anywhere downstream of the publisher would turn a redelivered occurrence
-- into what looks like a second, distinct one.
--
-- `learning_events` is schema-only as of 0012 (no writer exists yet), so
-- this table is guaranteed empty in every environment that has run that
-- migration — `add column ... not null` without a default is safe here.

alter table public.learning_events
  add column if not exists event_id uuid not null;

create unique index if not exists learning_events_event_id_unique_idx
  on public.learning_events(event_id);

comment on column public.learning_events.event_id is
  'Capability-owned identifier for one educational occurrence, generated once by the publisher (crypto.randomUUID()) and reused on redelivery. Distinct from id (the database row) — see TDS-008 §10.8.';
