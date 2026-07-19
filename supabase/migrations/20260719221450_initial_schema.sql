create extension if not exists "uuid-ossp";

create table if not exists studios (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null,
  avatar_url text,
  job_title text not null default 'Designer',
  system_role text not null check (system_role in ('admin','employee')) default 'employee',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists studio_members (
  id uuid primary key default uuid_generate_v4(),
  studio_id uuid not null references studios(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  system_role text not null check (system_role in ('admin','employee')) default 'employee',
  is_active boolean not null default true,
  joined_at timestamptz not null default now(),
  unique (studio_id, user_id)
);

create table if not exists projects (
  id uuid primary key default uuid_generate_v4(),
  studio_id uuid not null references studios(id) on delete cascade,
  name text not null,
  project_code text,
  client_name text,
  description text,
  total_area_m2 numeric not null check (total_area_m2 >= 0),
  status text not null check (status in ('planned','active','paused','completed','archived')) default 'planned',
  priority text not null check (priority in ('low','normal','high','urgent')) default 'normal',
  start_date date not null,
  due_date date,
  completed_at date,
  archived_at date,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists project_members (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  project_role text not null check (project_role in ('lead_designer','designer','visualizer','architect','manager','other')),
  assigned_area_m2 numeric not null check (assigned_area_m2 >= 0),
  is_active boolean not null default true,
  assigned_at date not null,
  removed_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, user_id, is_active) deferrable initially deferred
);

create table if not exists project_area_progress (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  area_m2 numeric not null check (area_m2 > 0),
  progress_date date not null,
  note text,
  recorded_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists tasks (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  title text not null,
  description text,
  status text not null check (status in ('todo','in_progress','review','completed','cancelled')) default 'todo',
  priority text not null check (priority in ('low','normal','high','urgent')) default 'normal',
  assignee_id uuid not null references profiles(id),
  created_by uuid not null references profiles(id),
  start_date date,
  due_date date,
  completed_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists project_activity (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  actor_id uuid not null references profiles(id),
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_projects_status on projects(status);
create index if not exists idx_projects_archived on projects(archived_at);
create index if not exists idx_project_members_user on project_members(user_id);
create index if not exists idx_tasks_assignee on tasks(assignee_id);
create index if not exists idx_tasks_project on tasks(project_id);
create index if not exists idx_tasks_completed_date on tasks(completed_at);
create index if not exists idx_progress_employee_date on project_area_progress(user_id, progress_date);

create or replace function public.set_updated_at()

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_studios_updated_at
  before update on studios
  for each row execute function public.set_updated_at();

create trigger set_profiles_updated_at
  before update on profiles
  for each row execute function public.set_updated_at();

create trigger set_projects_updated_at
  before update on projects
  for each row execute function public.set_updated_at();

create trigger set_project_members_updated_at
  before update on project_members
  for each row execute function public.set_updated_at();

create trigger set_tasks_updated_at
  before update on tasks
  for each row execute function public.set_updated_at();

create trigger set_project_area_progress_updated_at
  before update on project_area_progress
  for each row execute function public.set_updated_at();

alter table public.studios enable row level security;
alter table public.profiles enable row level security;
alter table public.studio_members enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.tasks enable row level security;
alter table public.project_area_progress enable row level security;
alter table public.project_activity enable row level security;
