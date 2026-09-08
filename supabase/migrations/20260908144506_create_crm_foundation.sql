create type public.crm_lead_status as enum ('new', 'contacted', 'discussion', 'proposal', 'won', 'lost');
create type public.recruiting_stage as enum ('new', 'interview_scheduled', 'interview_completed', 'test_task', 'decision');
create type public.recruiting_outcome as enum ('hired', 'reserve', 'rejected');

create table public.crm_leads (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  client_name text not null check (length(btrim(client_name)) between 1 and 200),
  company text check (company is null or length(company) <= 200),
  email text check (email is null or length(email) <= 320),
  phone text check (phone is null or length(phone) <= 80),
  source text check (source is null or length(source) <= 160),
  request_description text check (request_description is null or length(request_description) <= 5000),
  expected_project_type text check (expected_project_type is null or length(expected_project_type) <= 160),
  city text check (city is null or length(city) <= 160),
  country text check (country is null or length(country) <= 160),
  approximate_area numeric(12,2) check (approximate_area is null or approximate_area >= 0),
  budget_note text check (budget_note is null or length(budget_note) <= 500),
  responsible_admin_id uuid,
  first_contact_date date not null,
  next_contact_date date,
  internal_notes text check (internal_notes is null or length(internal_notes) <= 10000),
  status public.crm_lead_status not null default 'new',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, studio_id),
  foreign key (studio_id, responsible_admin_id) references public.studio_members(studio_id, user_id)
);

create table public.crm_candidates (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  full_name text not null check (length(btrim(full_name)) between 1 and 200),
  email text check (email is null or length(email) <= 320),
  phone text check (phone is null or length(phone) <= 80),
  external_profile_url text check (external_profile_url is null or (length(external_profile_url) <= 2000 and external_profile_url ~* '^https?://')),
  source text check (source is null or length(source) <= 160),
  responsible_admin_id uuid,
  internal_notes text check (internal_notes is null or length(internal_notes) <= 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, studio_id),
  foreign key (studio_id, responsible_admin_id) references public.studio_members(studio_id, user_id)
);

create table public.crm_recruiting_cycles (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  candidate_id uuid not null,
  target_position text not null check (length(btrim(target_position)) between 1 and 200),
  stage public.recruiting_stage not null default 'new',
  outcome public.recruiting_outcome,
  next_contact_date date,
  interview_at timestamptz,
  interview_notes text check (interview_notes is null or length(interview_notes) <= 10000),
  test_task_result text check (test_task_result is null or length(test_task_result) <= 10000),
  decision_notes text check (decision_notes is null or length(decision_notes) <= 10000),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, studio_id),
  foreign key (candidate_id, studio_id) references public.crm_candidates(id, studio_id) on delete cascade,
  check ((outcome is null and completed_at is null) or (outcome is not null and completed_at is not null))
);

create index crm_leads_studio_status_idx on public.crm_leads(studio_id, status, updated_at desc);
create index crm_leads_responsible_idx on public.crm_leads(responsible_admin_id) where responsible_admin_id is not null;
create index crm_candidates_studio_name_idx on public.crm_candidates(studio_id, full_name);
create index crm_candidates_responsible_idx on public.crm_candidates(responsible_admin_id) where responsible_admin_id is not null;
create index crm_recruiting_cycles_candidate_started_idx on public.crm_recruiting_cycles(candidate_id, started_at desc);
create index crm_recruiting_cycles_studio_outcome_idx on public.crm_recruiting_cycles(studio_id, outcome, updated_at desc);

create trigger set_crm_leads_updated_at before update on public.crm_leads
for each row execute function public.set_updated_at();
create trigger set_crm_candidates_updated_at before update on public.crm_candidates
for each row execute function public.set_updated_at();
create trigger set_crm_recruiting_cycles_updated_at before update on public.crm_recruiting_cycles
for each row execute function public.set_updated_at();

create or replace function private.enforce_crm_admin_reference()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.responsible_admin_id is not null and not exists (
    select 1 from public.studio_members member
    join public.profiles profile on profile.id = member.user_id
    where member.studio_id = new.studio_id
      and member.user_id = new.responsible_admin_id
      and member.system_role = 'admin'
      and member.is_active
      and profile.is_active
  ) then
    raise exception 'responsible_must_be_active_studio_admin';
  end if;
  return new;
end;
$$;
revoke execute on function private.enforce_crm_admin_reference() from public, anon, authenticated;

create trigger enforce_crm_lead_admin_reference before insert or update on public.crm_leads
for each row execute function private.enforce_crm_admin_reference();
create trigger enforce_crm_candidate_admin_reference before insert or update on public.crm_candidates
for each row execute function private.enforce_crm_admin_reference();

alter table public.crm_leads enable row level security;
alter table public.crm_candidates enable row level security;
alter table public.crm_recruiting_cycles enable row level security;

revoke all on table public.crm_leads, public.crm_candidates, public.crm_recruiting_cycles from anon, authenticated;
grant select, insert, delete on table public.crm_leads, public.crm_candidates, public.crm_recruiting_cycles to authenticated;
grant update (
  client_name, company, email, phone, source, request_description, expected_project_type,
  city, country, approximate_area, budget_note, responsible_admin_id, first_contact_date,
  next_contact_date, internal_notes, status
) on public.crm_leads to authenticated;
grant update (
  full_name, email, phone, external_profile_url, source, responsible_admin_id,
  internal_notes
) on public.crm_candidates to authenticated;
grant update (
  target_position, stage, outcome, next_contact_date, interview_at, interview_notes,
  test_task_result, decision_notes, completed_at
) on public.crm_recruiting_cycles to authenticated;

create policy crm_leads_select_admin on public.crm_leads for select to authenticated
using ((select private.is_studio_admin(studio_id)));
create policy crm_leads_insert_admin on public.crm_leads for insert to authenticated
with check ((select private.is_studio_admin(studio_id)));
create policy crm_leads_update_admin on public.crm_leads for update to authenticated
using ((select private.is_studio_admin(studio_id)))
with check ((select private.is_studio_admin(studio_id)));
create policy crm_leads_delete_admin on public.crm_leads for delete to authenticated
using ((select private.is_studio_admin(studio_id)));

create policy crm_candidates_select_admin on public.crm_candidates for select to authenticated
using ((select private.is_studio_admin(studio_id)));
create policy crm_candidates_insert_admin on public.crm_candidates for insert to authenticated
with check ((select private.is_studio_admin(studio_id)));
create policy crm_candidates_update_admin on public.crm_candidates for update to authenticated
using ((select private.is_studio_admin(studio_id)))
with check ((select private.is_studio_admin(studio_id)));
create policy crm_candidates_delete_admin on public.crm_candidates for delete to authenticated
using ((select private.is_studio_admin(studio_id)));

create policy crm_cycles_select_admin on public.crm_recruiting_cycles for select to authenticated
using ((select private.is_studio_admin(studio_id)));
create policy crm_cycles_insert_admin on public.crm_recruiting_cycles for insert to authenticated
with check ((select private.is_studio_admin(studio_id)));
create policy crm_cycles_update_admin on public.crm_recruiting_cycles for update to authenticated
using ((select private.is_studio_admin(studio_id)))
with check ((select private.is_studio_admin(studio_id)));
create policy crm_cycles_delete_admin on public.crm_recruiting_cycles for delete to authenticated
using ((select private.is_studio_admin(studio_id)));
