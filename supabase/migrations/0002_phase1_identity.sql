-- Phase 1: parent-owned learner profiles.
create table if not exists public.learners (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references auth.users(id) on delete restrict,
  display_name text not null check (char_length(display_name) between 1 and 80),
  school_year smallint not null check (school_year between 1 and 13),
  exam_target text check (exam_target is null or char_length(exam_target) <= 120),
  accessibility_preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists learners_parent_id_idx on public.learners(parent_id);
alter table public.learners enable row level security;

drop policy if exists "Parents can view own learners" on public.learners;
create policy "Parents can view own learners" on public.learners for select to authenticated using (auth.uid() = parent_id);
drop policy if exists "Parents can create own learners" on public.learners;
create policy "Parents can create own learners" on public.learners for insert to authenticated with check (auth.uid() = parent_id);
drop policy if exists "Parents can update own learners" on public.learners;
create policy "Parents can update own learners" on public.learners for update to authenticated using (auth.uid() = parent_id) with check (auth.uid() = parent_id);
drop policy if exists "Parents can delete own learners" on public.learners;
create policy "Parents can delete own learners" on public.learners for delete to authenticated using (auth.uid() = parent_id);
