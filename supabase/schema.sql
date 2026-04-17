-- Minimal Supabase schema for the Basalt prototype.
-- Run this in the Supabase SQL Editor before starting the app.

create extension if not exists "pgcrypto";

create table if not exists public."Projects" (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  path text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public."Tasks" (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  status text not null default 'pending'
    check (status in ('pending', 'planning', 'working', 'testing', 'review', 'done', 'failed')),
  project_id uuid references public."Projects"(id) on delete set null,
  workflow jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public."Execution_Logs" (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references public."Tasks"(id) on delete cascade,
  agent_role text not null default 'System',
  message text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists projects_created_at_idx on public."Projects" (created_at desc);
create index if not exists tasks_project_id_idx on public."Tasks" (project_id);
create index if not exists tasks_status_idx on public."Tasks" (status);
create index if not exists tasks_created_at_idx on public."Tasks" (created_at);
create index if not exists execution_logs_task_id_created_at_idx
  on public."Execution_Logs" (task_id, created_at);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_projects_updated_at on public."Projects";
create trigger set_projects_updated_at
before update on public."Projects"
for each row execute function public.set_updated_at();

drop trigger if exists set_tasks_updated_at on public."Tasks";
create trigger set_tasks_updated_at
before update on public."Tasks"
for each row execute function public.set_updated_at();

alter table public."Projects" enable row level security;
alter table public."Tasks" enable row level security;
alter table public."Execution_Logs" enable row level security;

drop policy if exists "Allow prototype access to Projects" on public."Projects";
create policy "Allow prototype access to Projects"
on public."Projects"
for all
using (true)
with check (true);

drop policy if exists "Allow prototype access to Tasks" on public."Tasks";
create policy "Allow prototype access to Tasks"
on public."Tasks"
for all
using (true)
with check (true);

drop policy if exists "Allow prototype access to Execution_Logs" on public."Execution_Logs";
create policy "Allow prototype access to Execution_Logs"
on public."Execution_Logs"
for all
using (true)
with check (true);

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'Projects'
    ) then
      alter publication supabase_realtime add table public."Projects";
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'Tasks'
    ) then
      alter publication supabase_realtime add table public."Tasks";
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'Execution_Logs'
    ) then
      alter publication supabase_realtime add table public."Execution_Logs";
    end if;
  end if;
end;
$$;
