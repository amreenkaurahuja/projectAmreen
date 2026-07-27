-- Phase 5.4, Part 3: AI coaching message cache.
--
-- Stores the deterministic-DTO-keyed result of one AI (or fallback)
-- coaching generation per learner/audience, so a learner refreshing their
-- dashboard repeatedly triggers at most one Gemini call per change in their
-- underlying learning data. Deliberately minimal: no prompts, no raw
-- learner data, no answer keys — only the already-validated response text
-- and enough metadata to reason about it operationally. See
-- docs/Architecture.md -> "AI Platform (Phase 5.4)" for the full design.
--
-- Only AI-accepted (source = 'ai') responses are ever written here —
-- fallback responses are cheap, pure, and recomputed every time rather than
-- cached (see coach/ai-coach.service.ts).

create table if not exists public.ai_coaching_messages (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references public.learners(id) on delete cascade,
  audience text not null check (audience in ('learner', 'parent')),
  context_hash text not null,
  schema_version text not null,
  prompt_version text not null,
  provider text not null,
  model text not null,
  headline text not null,
  message text not null,
  strengths jsonb not null default '[]'::jsonb,
  focus_areas jsonb not null default '[]'::jsonb,
  next_steps jsonb not null default '[]'::jsonb,
  source text not null check (source in ('ai', 'fallback')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  -- One message per learner, per audience, per exact learning-data
  -- snapshot: as long as the context hash is unchanged, every subsequent
  -- request for the same learner/audience is a cache hit, no matter how
  -- many times the dashboard is refreshed.
  unique (learner_id, audience, context_hash)
);

create index if not exists ai_coaching_messages_learner_idx
  on public.ai_coaching_messages(learner_id);

alter table public.ai_coaching_messages enable row level security;

-- Matches the existing "Parents manage own X" pattern used for
-- learner_skill_mastery/missions/mission_items/question_attempts.
drop policy if exists "Parents manage own ai coaching messages" on public.ai_coaching_messages;
create policy "Parents manage own ai coaching messages"
on public.ai_coaching_messages for all to authenticated
using (exists (
  select 1 from public.learners l
  where l.id = learner_id and l.parent_id = auth.uid()
))
with check (exists (
  select 1 from public.learners l
  where l.id = learner_id and l.parent_id = auth.uid()
));
