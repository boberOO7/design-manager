-- Productivity is recorded at the moment completed work transitions, not inferred
-- from mutable timestamps. Existing completed work is intentionally not backfilled:
-- there is no reliable historic completion instant for it.
alter table public.tasks
  add column completed_area_m2 numeric null check (completed_area_m2 > 0);

create table public.productivity_attributions (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  -- These are immutable source identifiers, deliberately not foreign keys. A hard
  -- delete of a task, project, or profile must not erase completed-work history.
  project_id uuid not null,
  task_id uuid,
  contributor_id uuid not null,
  source_type text not null check (source_type in ('task', 'project_fallback')),
  credited_area_m2 numeric not null check (credited_area_m2 > 0),
  completed_at timestamptz not null default now(),
  voided_at timestamptz,
  contributor_name text not null,
  contributor_job_title text not null,
  created_at timestamptz not null default now(),
  check (
    (source_type = 'task' and task_id is not null)
    or (source_type = 'project_fallback' and task_id is null)
  )
);

create unique index productivity_active_task_attribution
  on public.productivity_attributions(task_id)
  where source_type = 'task' and voided_at is null;
create unique index productivity_active_project_contributor_attribution
  on public.productivity_attributions(project_id, contributor_id)
  where source_type = 'project_fallback' and voided_at is null;
create index productivity_attributions_studio_completed_at
  on public.productivity_attributions(studio_id, completed_at)
  where voided_at is null;

alter table public.productivity_attributions enable row level security;
revoke all on table public.productivity_attributions from anon, authenticated;
grant select on table public.productivity_attributions to authenticated;

create policy "productivity_attributions_select_for_active_studio_members"
on public.productivity_attributions for select to authenticated
using ((select private.is_studio_member(studio_id)));

create or replace function private.record_task_productivity_attribution()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  task_project public.projects%rowtype;
  contributor public.profiles%rowtype;
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    if new.completed_area_m2 is null then return new; end if;
    select * into task_project from public.projects where id = new.project_id;
    select * into contributor from public.profiles where id = new.assignee_id;
    if task_project.id is null
      or contributor.id is null
      or not exists (
        select 1 from public.project_members as member
        inner join public.studio_members as studio_member
          on studio_member.studio_id = task_project.studio_id
          and studio_member.user_id = new.assignee_id
          and studio_member.is_active = true
        where member.project_id = new.project_id
          and member.user_id = new.assignee_id
          and member.is_active = true
          and contributor.is_active = true
      ) then
      raise exception 'Attributed task completion requires an active project-member assignee';
    end if;
    insert into public.productivity_attributions (
      studio_id, project_id, task_id, contributor_id, source_type, credited_area_m2,
      completed_at, contributor_name, contributor_job_title
    ) values (
      task_project.studio_id, new.project_id, new.id, new.assignee_id, 'task', new.completed_area_m2,
      now(), contributor.full_name, contributor.job_title
    );
  elsif old.status = 'completed' and new.status is distinct from 'completed' then
    update public.productivity_attributions
      set voided_at = now()
      where task_id = old.id and source_type = 'task' and voided_at is null;
  end if;
  return new;
end;
$$;

revoke execute on function private.record_task_productivity_attribution() from public, anon, authenticated;
create trigger record_task_productivity_attribution_after_status_change
after update of status on public.tasks
for each row execute function private.record_task_productivity_attribution();

create or replace function private.record_project_fallback_productivity_attribution()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    -- A single task-level allocation opts the whole project out of fallback.
    -- Partially allocated projects therefore credit only their allocated tasks.
    if exists (
      select 1 from public.tasks
      where project_id = new.id and completed_area_m2 is not null
    ) then return new; end if;

    insert into public.productivity_attributions (
      studio_id, project_id, contributor_id, source_type, credited_area_m2,
      completed_at, contributor_name, contributor_job_title
    )
    select
      new.studio_id, new.id, member.user_id, 'project_fallback', new.total_area_m2,
      now(), profile.full_name, profile.job_title
    from public.project_members as member
    inner join public.studio_members as studio_member
      on studio_member.studio_id = new.studio_id
      and studio_member.user_id = member.user_id
      and studio_member.is_active = true
    inner join public.profiles as profile
      on profile.id = member.user_id and profile.is_active = true
    where member.project_id = new.id
      and member.is_active = true
      and new.total_area_m2 > 0;
  elsif old.status = 'completed' and new.status is distinct from 'completed' then
    update public.productivity_attributions
      set voided_at = now()
      where project_id = old.id and source_type = 'project_fallback' and voided_at is null;
  end if;
  return new;
end;
$$;

revoke execute on function private.record_project_fallback_productivity_attribution() from public, anon, authenticated;
create trigger record_project_fallback_productivity_attribution_after_status_change
after update of status on public.projects
for each row execute function private.record_project_fallback_productivity_attribution();

grant insert (project_id, title, description, priority, assignee_id, created_by, due_date, completed_area_m2)
on public.tasks to authenticated;
grant update (title, description, assignee_id, priority, due_date, completed_area_m2)
on public.tasks to authenticated;

create or replace function private.enforce_task_edit_permissions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  task_studio_id uuid;
  is_admin boolean;
begin
  select project.studio_id into task_studio_id from public.projects as project
  where project.id = old.project_id and project.archived_at is null and project.status <> 'archived';
  if task_studio_id is null then raise exception 'Archived projects are read-only'; end if;
  is_admin := coalesce(private.is_studio_admin(task_studio_id), false);
  if new.project_id is distinct from old.project_id or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at or new.start_date is distinct from old.start_date then
    raise exception 'Task field is not editable';
  end if;
  if not is_admin and (new.title is distinct from old.title or new.description is distinct from old.description
    or new.assignee_id is distinct from old.assignee_id or new.priority is distinct from old.priority
    or new.due_date is distinct from old.due_date or new.completed_area_m2 is distinct from old.completed_area_m2) then
    raise exception 'Only administrators may edit task details';
  end if;
  if is_admin and new.assignee_id is distinct from old.assignee_id
    and not private.is_active_project_task_assignee(old.project_id, new.assignee_id) then
    raise exception 'Task assignee must be an active project member';
  end if;
  return new;
end;
$$;
revoke execute on function private.enforce_task_edit_permissions() from public, anon, authenticated;
