-- TDS-007 Stage 3: Question Explainer response cache.
--
-- Stores the validated-and-grounded response for one learner/attempt/
-- audience/context-hash, so re-requesting the same attempt's explanation
-- (the same learning-data snapshot) is a cache hit rather than a repeat
-- Gemini call. Mirrors ai_coaching_messages (migration 0010) exactly, as a
-- dedicated table rather than an extension of it — that table's columns
-- are shaped for CoachResponse specifically (headline/message/strengths/
-- focusAreas/nextSteps), which QuestionExplanationResponse does not match
-- (see the TDS-007 Stage 0 audit's persistence finding).
--
-- Only validated, grounded, AI-accepted responses are ever written here —
-- same as ai_coaching_messages, fallback responses are cheap, pure, and
-- recomputed every time rather than cached (see
-- question-explainer.service.ts). No prompts, no system prompts, no raw
-- provider output — only the already-validated response JSON and enough
-- metadata to reason about it operationally.

create table if not exists public.question_explanations (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references public.learners(id) on delete cascade,
  attempt_id uuid not null references public.question_attempts(id) on delete cascade,
  audience text not null check (audience in ('learner', 'parent')),
  context_hash text not null,
  prompt_version text not null,
  schema_version text not null,
  response_json jsonb not null,
  response_source text not null check (response_source in ('ai', 'fallback')),
  provider text not null,
  model text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  -- One cached response per learner, per audience, per exact learning-data
  -- snapshot: as long as the context hash is unchanged, every subsequent
  -- request for the same learner/attempt/audience is a cache hit.
  unique (learner_id, audience, context_hash)
);

create index if not exists question_explanations_learner_idx
  on public.question_explanations(learner_id);
create index if not exists question_explanations_attempt_idx
  on public.question_explanations(attempt_id);

alter table public.question_explanations enable row level security;

-- Matches the existing "Parents manage own X" pattern used for
-- learner_skill_mastery/missions/mission_items/question_attempts/
-- ai_coaching_messages.
drop policy if exists "Parents manage own question explanations" on public.question_explanations;
create policy "Parents manage own question explanations"
on public.question_explanations for all to authenticated
using (exists (
  select 1 from public.learners l
  where l.id = learner_id and l.parent_id = auth.uid()
))
with check (exists (
  select 1 from public.learners l
  where l.id = learner_id and l.parent_id = auth.uid()
));
