alter table public.tasks
  add column requires_review boolean not null default false,
  add column reviewer_id uuid references public.profiles(id) on delete restrict,
  add constraint tasks_review_requires_reviewer check (not requires_review or reviewer_id is not null);
grant select (requires_review, reviewer_id) on public.tasks to authenticated;

-- Stable round IDs allow future work sessions to reference a round directly.
create table public.task_review_rounds (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  round_number integer not null check (round_number > 0),
  reviewer_id uuid not null references public.profiles(id) on delete restrict,
  submitted_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  result text check (result in ('approved', 'rework')),
  rework_comment text,
  unique (task_id, round_number),
  check ((completed_at is null) = (result is null)),
  check (completed_at is null or completed_at >= submitted_at),
  check (case when result = 'rework' then coalesce(length(btrim(rework_comment)), 0) > 0 else rework_comment is null end)
);
create unique index task_review_rounds_open_task_idx on public.task_review_rounds(task_id) where completed_at is null;
create index task_review_rounds_project_waiting_idx on public.task_review_rounds(project_id, submitted_at) where completed_at is null;
create index task_review_rounds_reviewer_idx on public.task_review_rounds(reviewer_id);
create index tasks_reviewer_idx on public.tasks(reviewer_id) where requires_review;
alter table public.task_review_rounds enable row level security;
revoke all on public.task_review_rounds from anon, authenticated;
grant select on public.task_review_rounds to authenticated;
grant all on public.task_review_rounds to service_role;
create policy task_review_rounds_project_read on public.task_review_rounds for select to authenticated
using ((select private.can_access_project(project_id)));

create function private.guard_task_review_workflow() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  latest public.task_review_rounds%rowtype;
  enabled text[];
begin
  if exists (select 1 from public.task_review_rounds where task_id = old.id and completed_at is null)
    and (new.requires_review is distinct from old.requires_review or new.reviewer_id is distinct from old.reviewer_id
      or new.stage is distinct from old.stage or new.project_id is distinct from old.project_id) then
    raise exception 'Resolve the active review before changing review settings or task stage';
  end if;
  if not new.requires_review then return new; end if;
  select enabled_statuses into enabled from public.project_task_stage_columns where project_id = new.project_id and stage = new.stage;
  if not (array['in_progress', 'internal_review']::text[] <@ enabled)
    or not (enabled && array['review', 'completed']::text[]) then
    raise exception 'Review requires In progress, Internal review, and a later workflow status';
  end if;
  if not old.requires_review and old.status not in ('todo', 'in_progress') then
    raise exception 'Enable review while the task is To do or In progress';
  end if;
  if new.status is not distinct from old.status then return new; end if;
  select * into latest from public.task_review_rounds where task_id = old.id order by round_number desc limit 1;
  if old.status = 'internal_review' and (latest.id is null or latest.completed_at is null) then
    raise exception 'Approve or send back the active review from task details';
  end if;
  if new.status = 'internal_review' then
    if old.status <> 'in_progress' then raise exception 'Submit a review from In progress'; end if;
    if not exists (
      select 1 from public.studio_members sm join public.profiles p on p.id = sm.user_id
      join public.projects project on project.studio_id = sm.studio_id
      where project.id = new.project_id and sm.user_id = new.reviewer_id and sm.is_active and p.is_active
        and (sm.system_role = 'admin' or private.is_active_project_task_assignee(new.project_id, new.reviewer_id))
    ) then raise exception 'Choose an active reviewer with access to this project'; end if;
    insert into public.task_review_rounds(task_id, project_id, round_number, reviewer_id)
    values (new.id, new.project_id, coalesce(latest.round_number, 0) + 1, new.reviewer_id);
  elsif new.status in ('review', 'completed') and
    (old.status in ('todo', 'in_progress') or latest.result is distinct from 'approved') then
    raise exception 'Submit and approve this task review before moving to a later status';
  end if;
  return new;
end;
$$;
revoke execute on function private.guard_task_review_workflow() from public, anon, authenticated;
create trigger guard_task_review_workflow before update of status, requires_review, reviewer_id, stage, project_id
on public.tasks for each row execute function private.guard_task_review_workflow();

create function private.guard_review_stage_columns() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.tasks where project_id = new.project_id and stage = new.stage
      and requires_review and status not in ('completed', 'cancelled'))
    and (not (array['in_progress', 'internal_review']::text[] <@ new.enabled_statuses)
      or not (new.enabled_statuses && array['review', 'completed']::text[])) then
    raise exception 'Keep the review workflow columns enabled while tasks require review';
  end if;
  return new;
end;
$$;
revoke execute on function private.guard_review_stage_columns() from public, anon, authenticated;
create trigger guard_review_stage_columns before update of enabled_statuses on public.project_task_stage_columns
for each row execute function private.guard_review_stage_columns();

create function public.update_task_review(
  p_task_id uuid, p_action text, p_reviewer_id uuid default null,
  p_requires_review boolean default null, p_round_id uuid default null, p_comment text default null
) returns void language plpgsql security definer set search_path = '' as $$
declare
  task public.tasks%rowtype;
  project public.projects%rowtype;
  round public.task_review_rounds%rowtype;
  actor uuid := auth.uid();
  is_admin boolean;
  enabled text[];
  next_status text;
begin
  if actor is null or (select count(*) from public.studio_members sm join public.profiles p on p.id = sm.user_id
      where sm.user_id = actor and sm.is_active and p.is_active) <> 1 then
    raise exception 'An active studio membership is required';
  end if;
  select * into task from public.tasks where id = p_task_id for update;
  if not found or not coalesce(private.can_access_project(task.project_id), false) then
    raise exception 'Task not found or unavailable';
  end if;
  select * into project from public.projects where id = task.project_id for share;
  if project.archived_at is not null or project.status = 'archived'
    or (project.status = 'completed' and private.is_project_progress_stage(task.stage)) then
    raise exception 'This project task is read-only';
  end if;
  is_admin := coalesce(private.is_studio_admin(project.studio_id), false);
  select enabled_statuses into enabled from public.project_task_stage_columns
    where project_id = task.project_id and stage = task.stage for share;
  if p_action = 'configure' then
    if not is_admin then raise exception 'Only studio administrators can configure task review'; end if;
    if p_requires_review is null then raise exception 'Choose whether review is required'; end if;
    if p_requires_review and not exists (
      select 1 from public.studio_members sm join public.profiles p on p.id = sm.user_id
      where sm.studio_id = project.studio_id and sm.user_id = p_reviewer_id and sm.is_active and p.is_active
        and (sm.system_role = 'admin' or private.is_active_project_task_assignee(task.project_id, p_reviewer_id))
    ) then raise exception 'Choose an active reviewer with access to this project'; end if;
    update public.tasks set requires_review = p_requires_review,
      reviewer_id = case when p_requires_review then p_reviewer_id else null end where id = task.id;
  elsif p_action = 'submit' then
    if not coalesce(private.can_update_project_task_status(task.project_id, task.assignee_id, task.stage), false) then
      raise exception 'Only the assignee or studio administrator can submit this task';
    end if;
    if not task.requires_review or task.status <> 'in_progress' then raise exception 'Submit a review from In progress'; end if;
    update public.tasks set status = 'internal_review' where id = task.id;
  elsif p_action in ('approved', 'rework') then
    select * into round from public.task_review_rounds where task_id = task.id and id = p_round_id and completed_at is null for update;
    if not found or task.status <> 'internal_review' then raise exception 'This review is no longer active'; end if;
    if not is_admin and round.reviewer_id <> actor then raise exception 'Only the assigned reviewer or studio administrator can resolve this review'; end if;
    if p_action = 'rework' and coalesce(length(btrim(p_comment)), 0) = 0 then raise exception 'Describe what needs to be fixed'; end if;
    next_status := case when p_action = 'rework' then 'in_progress' when 'review' = any(enabled) then 'review' when 'completed' = any(enabled) then 'completed' end;
    if next_status is null then raise exception 'Enable a workflow status after Internal review'; end if;
    update public.task_review_rounds set result = p_action, completed_at = clock_timestamp(),
      rework_comment = case when p_action = 'rework' then btrim(p_comment) else null end where id = round.id;
    update public.tasks set status = next_status where id = task.id;
  else raise exception 'Choose a valid review action';
  end if;
end;
$$;
revoke execute on function public.update_task_review(uuid, text, uuid, boolean, uuid, text) from public, anon;
grant execute on function public.update_task_review(uuid, text, uuid, boolean, uuid, text) to authenticated;

notify pgrst, 'reload schema';
