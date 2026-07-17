-- Phase 0 connectivity object. No learner data is introduced in this migration.
create table if not exists public.system_health (
  id smallint primary key default 1 check (id = 1),
  status text not null default 'ok' check (status in ('ok', 'degraded', 'maintenance')),
  updated_at timestamptz not null default now()
);

alter table public.system_health enable row level security;

insert into public.system_health (id, status)
values (1, 'ok')
on conflict (id) do nothing;

create policy "Authenticated users can read system health"
on public.system_health
for select
to authenticated
using (true);
