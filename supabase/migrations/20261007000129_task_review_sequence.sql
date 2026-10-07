create table public.task_reviewers (
  task_id uuid not null references public.tasks(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id) on delete restrict,
  position integer not null check (position >= 0),
  primary key (task_id, reviewer_id),
  unique (task_id, position)
);
create table public.task_review_round_reviewers (
  round_id uuid not null references public.task_review_rounds(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id) on delete restrict,
  position integer not null check (position >= 0),
  approved_at timestamptz,
  primary key (round_id, reviewer_id),
  unique (round_id, position)
);
create index task_reviewers_reviewer_idx on public.task_reviewers(reviewer_id);
create index task_review_round_reviewers_reviewer_idx on public.task_review_round_reviewers(reviewer_id);
alter table public.task_reviewers enable row level security;
alter table public.task_review_round_reviewers enable row level security;
revoke all on public.task_reviewers, public.task_review_round_reviewers from anon, authenticated;
grant select on public.task_reviewers, public.task_review_round_reviewers to authenticated;
grant all on public.task_reviewers, public.task_review_round_reviewers to service_role;
create policy task_reviewers_task_read on public.task_reviewers for select to authenticated
using (exists (select 1 from public.tasks where tasks.id = task_reviewers.task_id));
create policy task_review_round_reviewers_round_read on public.task_review_round_reviewers for select to authenticated
using (exists (select 1 from public.task_review_rounds where task_review_rounds.id = task_review_round_reviewers.round_id));

-- Preserve the existing single-reviewer assignments and historical outcomes.
insert into public.task_reviewers(task_id, reviewer_id, position)
select id, reviewer_id, 0 from public.tasks where requires_review and reviewer_id is not null;
insert into public.task_review_round_reviewers(round_id, reviewer_id, position, approved_at)
select id, reviewer_id, 0, case when result = 'approved' then completed_at end from public.task_review_rounds;

create or replace function private.guard_task_review_workflow() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  latest public.task_review_rounds%rowtype;
  enabled text[];
  new_round_id uuid;
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
    if not exists (select 1 from public.task_reviewers where task_id = new.id and position = 0 and reviewer_id = new.reviewer_id)
      or exists (
        select 1 from public.task_reviewers assignment where assignment.task_id = new.id and not exists (
          select 1 from public.studio_members sm join public.profiles p on p.id = sm.user_id
          join public.projects project on project.studio_id = sm.studio_id
          where project.id = new.project_id and sm.user_id = assignment.reviewer_id and sm.is_active and p.is_active
            and (sm.system_role = 'admin' or private.is_active_project_task_assignee(new.project_id, assignment.reviewer_id))
        )
      ) then raise exception 'Choose active reviewers with access to this project'; end if;
    insert into public.task_review_rounds(task_id, project_id, round_number, reviewer_id)
    values (new.id, new.project_id, coalesce(latest.round_number, 0) + 1, new.reviewer_id) returning id into new_round_id;
    insert into public.task_review_round_reviewers(round_id, reviewer_id, position)
    select new_round_id, reviewer_id, position from public.task_reviewers where task_id = new.id;
  elsif new.status in ('review', 'completed') and
    (old.status in ('todo', 'in_progress') or latest.result is distinct from 'approved') then
    raise exception 'Submit and approve this task review before moving to a later status';
  end if;
  return new;
end;
$$;

drop function public.update_task_review(uuid, text, uuid, boolean, uuid, text);
create function public.update_task_review(
  p_task_id uuid, p_action text, p_reviewer_id uuid default null,
  p_requires_review boolean default null, p_round_id uuid default null, p_comment text default null,
  p_reviewer_ids uuid[] default null, p_expected_reviewer_id uuid default null
) returns void language plpgsql security definer set search_path = '' as $$
declare
  task public.tasks%rowtype;
  project public.projects%rowtype;
  round public.task_review_rounds%rowtype;
  actor uuid := auth.uid();
  is_admin boolean;
  enabled text[];
  next_status text;
  current_ids uuid[];
  requested_ids uuid[];
  requested_id uuid;
  next_reviewer_id uuid;
begin
  if actor is null or (select count(*) from public.studio_members sm join public.profiles p on p.id = sm.user_id
      where sm.user_id = actor and sm.is_active and p.is_active) <> 1 then
    raise exception 'An active studio membership is required';
  end if;
  select * into task from public.tasks where id = p_task_id for update;
  if not found or not coalesce(private.can_access_project(task.project_id), false) then raise exception 'Task not found or unavailable'; end if;
  select * into project from public.projects where id = task.project_id for share;
  if project.archived_at is not null or project.status = 'archived'
    or (project.status = 'completed' and private.is_project_progress_stage(task.stage)) then raise exception 'This project task is read-only'; end if;
  is_admin := coalesce(private.is_studio_admin(project.studio_id), false);
  select enabled_statuses into enabled from public.project_task_stage_columns
    where project_id = task.project_id and stage = task.stage for share;
  if p_action = 'configure' then
    if not is_admin then raise exception 'Only studio administrators can configure task review'; end if;
    if p_reviewer_ids is null and p_requires_review is null then raise exception 'Choose task reviewers'; end if;
    requested_ids := coalesce(p_reviewer_ids, case when p_requires_review then array[p_reviewer_id] else '{}'::uuid[] end);
    if cardinality(requested_ids) <> (select count(distinct reviewer_id) from unnest(requested_ids) as reviewer_id) then
      raise exception 'Task reviewers must be unique and non-null';
    end if;
    select coalesce(array_agg(reviewer_id order by position), '{}'::uuid[]) into current_ids from public.task_reviewers where task_id = task.id;
    if requested_ids = current_ids then return; end if;
    if exists (select 1 from public.task_review_rounds where task_id = task.id and completed_at is null) then
      raise exception 'Resolve the active review before changing reviewers';
    end if;
    foreach requested_id in array requested_ids loop
      if not exists (
        select 1 from public.studio_members sm join public.profiles p on p.id = sm.user_id
        where sm.studio_id = project.studio_id and sm.user_id = requested_id and sm.is_active and p.is_active
          and (sm.system_role = 'admin' or private.is_active_project_task_assignee(task.project_id, requested_id))
      ) then raise exception 'Choose active reviewers with access to this project'; end if;
    end loop;
    delete from public.task_reviewers where task_id = task.id;
    insert into public.task_reviewers(task_id, reviewer_id, position)
    select task.id, reviewer_id, (ordinality - 1)::integer from unnest(requested_ids) with ordinality as reviewers(reviewer_id, ordinality);
    update public.tasks set requires_review = cardinality(requested_ids) > 0, reviewer_id = requested_ids[1] where id = task.id;
  elsif p_action = 'submit' then
    if not coalesce(private.can_update_project_task_status(task.project_id, task.assignee_id, task.stage), false) then
      raise exception 'Only the assignee or studio administrator can submit this task';
    end if;
    if not task.requires_review or task.status <> 'in_progress' then raise exception 'Submit a review from In progress'; end if;
    update public.tasks set status = 'internal_review' where id = task.id;
  elsif p_action in ('approved', 'rework') then
    select * into round from public.task_review_rounds where task_id = task.id and id = p_round_id and completed_at is null for update;
    if not found or task.status <> 'internal_review' then raise exception 'This review is no longer active'; end if;
    if (p_expected_reviewer_id is not null or (select count(*) from public.task_review_round_reviewers where round_id = round.id) > 1)
      and p_expected_reviewer_id is distinct from round.reviewer_id then raise exception 'This review step is no longer active'; end if;
    if not is_admin and round.reviewer_id <> actor then raise exception 'Only the current reviewer or studio administrator can resolve this review'; end if;
    if p_action = 'rework' and coalesce(length(btrim(p_comment)), 0) = 0 then raise exception 'Describe what needs to be fixed'; end if;
    if p_action = 'approved' then
      update public.task_review_round_reviewers set approved_at = clock_timestamp()
      where round_id = round.id and reviewer_id = round.reviewer_id and approved_at is null;
      if not found then raise exception 'This review step is no longer active'; end if;
      select reviewer_id into next_reviewer_id from public.task_review_round_reviewers
      where round_id = round.id and approved_at is null order by position limit 1;
      if next_reviewer_id is not null then
        update public.task_review_rounds set reviewer_id = next_reviewer_id where id = round.id;
        return;
      end if;
    end if;
    next_status := case when p_action = 'rework' then 'in_progress' when 'review' = any(enabled) then 'review' when 'completed' = any(enabled) then 'completed' end;
    if next_status is null then raise exception 'Enable a workflow status after Internal review'; end if;
    update public.task_review_rounds set result = p_action, completed_at = clock_timestamp(),
      rework_comment = case when p_action = 'rework' then btrim(p_comment) else null end where id = round.id;
    update public.tasks set status = next_status where id = task.id;
  else raise exception 'Choose a valid review action';
  end if;
end;
$$;
revoke execute on function public.update_task_review(uuid, text, uuid, boolean, uuid, text, uuid[], uuid) from public, anon;
grant execute on function public.update_task_review(uuid, text, uuid, boolean, uuid, text, uuid[], uuid) to authenticated;

-- One task edit transaction includes the review sequence. Existing scheduling,
-- collaborator, deadline, and completion-date guards retain their original path.
create or replace function public.update_task_details_with_collaborators(
  p_task_id uuid, p_task jsonb, p_collaborator_ids uuid[] default '{}', p_deadlines jsonb default null
) returns void language plpgsql security definer set search_path = '' as $$
declare
  schedule record;
  requested_due date;
  has_schedule boolean := false;
  requested_ids uuid[];
begin
  if p_task ? 'reviewer_ids' then
    if jsonb_typeof(p_task -> 'reviewer_ids') <> 'array' then raise exception 'Task reviewers must be an array'; end if;
    requested_ids := array(select reviewer_id::uuid from jsonb_array_elements_text(p_task -> 'reviewer_ids') as reviewer_id);
    -- Removing review and changing stage in one edit must not validate the new
    -- stage against review settings the user has just removed.
    if cardinality(requested_ids) = 0 then
      perform public.update_task_review(p_task_id, 'configure', p_reviewer_ids => requested_ids);
    end if;
  end if;
  select s.*, task.status into schedule from public.task_schedules s join public.tasks task on task.id = s.task_id where s.task_id = p_task_id;
  has_schedule := found;
  if has_schedule and p_deadlines is not null then
    select deadline.due_date into requested_due from jsonb_to_recordset(p_deadlines) as deadline(target_status text, due_date date)
    where deadline.target_status = 'internal_review';
    if requested_due is null then raise exception 'Scheduled tasks require an internal review deadline'; end if;
    if extract(isodow from requested_due) > 5 then raise exception 'Scheduled deadlines must be working days'; end if;
    if (schedule.status in ('completed', 'cancelled') or exists (
      select 1 from public.task_status_periods where task_id = p_task_id and status = 'internal_review'
    )) and requested_due <> schedule.current_due then raise exception 'Reached task schedule history cannot move'; end if;
    if requested_due < private.schedule_add_workdays(schedule.current_start, schedule.expected_workdays - 1)
      then raise exception 'Deadline is earlier than this task can finish'; end if;
  end if;
  perform private.update_task_details_with_collaborators(p_task_id, p_task, p_collaborator_ids, p_deadlines);
  if cardinality(requested_ids) > 0 then
    perform public.update_task_review(p_task_id, 'configure', p_reviewer_ids => requested_ids);
  end if;
  if has_schedule and p_deadlines is not null and requested_due is distinct from schedule.current_due then
    update public.task_schedules set current_due = requested_due where task_id = p_task_id;
    perform private.reflow_task_stage_schedule(schedule.project_id, schedule.stage);
  end if;
end;
$$;
revoke execute on function public.update_task_details_with_collaborators(uuid, jsonb, uuid[], jsonb) from public, anon;
grant execute on function public.update_task_details_with_collaborators(uuid, jsonb, uuid[], jsonb) to authenticated;
notify pgrst, 'reload schema';
