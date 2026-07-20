-- Phase 3A schema only: deterministic daily missions, question bank and resumable attempts.
-- Question content is seeded separately with: npm run seed:questions

create table if not exists public.question_bank (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects(id) on delete cascade,
  topic_id uuid references public.topics(id) on delete set null,
  skill_id uuid references public.skills(id) on delete set null,
  prompt text not null check (char_length(prompt) between 3 and 1000),
  explanation text not null default '' check (char_length(explanation) <= 1500),
  difficulty smallint not null default 1 check (difficulty between 1 and 5),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists question_bank_prompt_unique_idx
  on public.question_bank(prompt);

create table if not exists public.question_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.question_bank(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 500),
  is_correct boolean not null default false,
  sort_order smallint not null default 0,
  unique(question_id, sort_order)
);

create table if not exists public.missions (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references public.learners(id) on delete cascade,
  mission_date date not null default current_date,
  status text not null default 'ready' check (status in ('ready','in_progress','completed')),
  estimated_minutes smallint not null default 20 check (estimated_minutes between 1 and 180),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(learner_id, mission_date)
);

create table if not exists public.mission_items (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references public.missions(id) on delete cascade,
  question_id uuid not null references public.question_bank(id) on delete restrict,
  position smallint not null check (position > 0),
  created_at timestamptz not null default now(),
  unique(mission_id, position),
  unique(mission_id, question_id)
);

create table if not exists public.question_attempts (
  id uuid primary key default gen_random_uuid(),
  mission_item_id uuid not null unique references public.mission_items(id) on delete cascade,
  question_id uuid not null references public.question_bank(id) on delete restrict,
  selected_option_id uuid not null references public.question_options(id) on delete restrict,
  is_correct boolean not null,
  response_ms integer not null default 0 check (response_ms between 0 and 3600000),
  answered_at timestamptz not null default now()
);

create index if not exists question_bank_subject_idx
  on public.question_bank(subject_id) where is_active;
create index if not exists question_options_question_idx
  on public.question_options(question_id);
create index if not exists missions_learner_date_idx
  on public.missions(learner_id, mission_date desc);
create index if not exists mission_items_mission_idx
  on public.mission_items(mission_id, position);

alter table public.question_bank enable row level security;
alter table public.question_options enable row level security;
alter table public.missions enable row level security;
alter table public.mission_items enable row level security;
alter table public.question_attempts enable row level security;

drop policy if exists "Authenticated users read active questions" on public.question_bank;
create policy "Authenticated users read active questions"
on public.question_bank for select to authenticated using (is_active);

drop policy if exists "Authenticated users read question options" on public.question_options;
create policy "Authenticated users read question options"
on public.question_options for select to authenticated
using (exists (
  select 1 from public.question_bank q
  where q.id = question_id and q.is_active
));

drop policy if exists "Parents manage own missions" on public.missions;
create policy "Parents manage own missions"
on public.missions for all to authenticated
using (exists (
  select 1 from public.learners l
  where l.id = learner_id and l.parent_id = auth.uid()
))
with check (exists (
  select 1 from public.learners l
  where l.id = learner_id and l.parent_id = auth.uid()
));

drop policy if exists "Parents manage own mission items" on public.mission_items;
create policy "Parents manage own mission items"
on public.mission_items for all to authenticated
using (exists (
  select 1
  from public.missions m
  join public.learners l on l.id = m.learner_id
  where m.id = mission_id and l.parent_id = auth.uid()
))
with check (exists (
  select 1
  from public.missions m
  join public.learners l on l.id = m.learner_id
  where m.id = mission_id and l.parent_id = auth.uid()
));

drop policy if exists "Parents manage own attempts" on public.question_attempts;
create policy "Parents manage own attempts"
on public.question_attempts for all to authenticated
using (exists (
  select 1
  from public.mission_items mi
  join public.missions m on m.id = mi.mission_id
  join public.learners l on l.id = m.learner_id
  where mi.id = mission_item_id and l.parent_id = auth.uid()
))
with check (exists (
  select 1
  from public.mission_items mi
  join public.missions m on m.id = mi.mission_id
  join public.learners l on l.id = m.learner_id
  where mi.id = mission_item_id and l.parent_id = auth.uid()
));
