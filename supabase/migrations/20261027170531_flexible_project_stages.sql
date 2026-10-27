-- Project-owned stages; legacy keys retain their area-accounting meaning.
alter table public.projects add column stage_configuration_version integer not null default 0;
alter table public.project_task_stage_columns
  add column kind text not null default 'work' check (kind in ('work', 'additional')),
  add column progress_weight integer not null default 1 check (progress_weight > 0),
  add column deleted_at timestamptz,
  alter column display_order type integer;
-- Limit the backfill to live projects: old local snapshots can contain stage
-- rows whose missing parent would make even a metadata UPDATE fail its FK.
update public.project_task_stage_columns as stage
set kind = case when stage.stage = 'stage_4' then 'additional' else 'work' end,
  progress_weight = case when stage.stage in ('stage_2', 'stage_3') then 2 else 1 end
from public.projects as project
where project.id = stage.project_id;
alter table public.project_task_stage_columns drop constraint if exists project_task_stage_columns_display_order_check;
alter table public.project_task_stage_columns add constraint project_task_stage_columns_display_order_check check (display_order > 0);
alter table public.tasks drop constraint if exists tasks_stage_check;
alter table public.tasks add constraint tasks_stage_check check (stage in ('stage_1','stage_2','stage_3','stage_4') or stage ~ '^custom_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');
alter table public.project_task_stage_columns drop constraint if exists project_task_stage_columns_stage_check;
alter table public.project_task_stage_columns add constraint project_task_stage_columns_stage_check check (stage in ('stage_1','stage_2','stage_3','stage_4') or stage ~ '^custom_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');
alter table public.task_schedules drop constraint if exists task_schedules_stage_check;
alter table public.task_schedules add constraint task_schedules_stage_check check (stage in ('stage_1','stage_2','stage_3','stage_4') or stage ~ '^custom_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');
alter table public.productivity_attributions drop constraint if exists productivity_attributions_task_stage_check;
alter table public.productivity_attributions add constraint productivity_attributions_task_stage_check check (task_stage in ('stage_1','stage_2','stage_3','stage_4') or task_stage ~ '^custom_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');
alter table public.finance_project_earning_milestones drop constraint if exists finance_project_earning_milestones_stage_check;
alter table public.finance_project_earning_milestones add constraint finance_project_earning_milestones_stage_check check (stage in ('stage_1','stage_2','stage_3','stage_4') or stage ~ '^custom_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');

create function private.is_configured_project_stage(p_project_id uuid, p_stage text)
returns boolean language sql stable security invoker set search_path = '' as $$
  select exists (select 1 from public.project_task_stage_columns where project_id=p_project_id and stage=p_stage and deleted_at is null);
$$;
create function private.is_project_progress_stage(p_project_id uuid, p_stage text)
returns boolean language sql stable security invoker set search_path = '' as $$
  select exists (select 1 from public.project_task_stage_columns where project_id=p_project_id and stage=p_stage and deleted_at is null and kind='work');
$$;
revoke all on function private.is_configured_project_stage(uuid,text), private.is_project_progress_stage(uuid,text) from public,anon;
grant execute on function private.is_configured_project_stage(uuid,text), private.is_project_progress_stage(uuid,text) to authenticated;

-- The one-argument legacy helper remains an accounting predicate, not lifecycle policy.

create or replace function private.validate_task_stage_status()
returns trigger language plpgsql security definer set search_path='' as $$
declare configured public.project_task_stage_columns;
begin
  -- The stage lock serializes deletion with task inserts, moves and status changes.
  select * into configured from public.project_task_stage_columns
  where project_id=new.project_id and stage=new.stage for share;
  if not found or configured.deleted_at is not null then raise exception 'Choose an existing project stage'; end if;
  if (tg_op='INSERT' or new.stage is distinct from old.stage) and not configured.is_enabled then
    raise exception 'Choose an enabled project stage';
  end if;
  if new.status <> 'cancelled' and not (new.status=any(configured.enabled_statuses)) then
    raise exception 'Task status is not enabled for this project stage';
  end if;
  return new;
end;
$$;

CREATE OR REPLACE FUNCTION private.create_project_task_stage_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  insert into public.project_task_stage_columns (project_id, stage, display_order, kind, progress_weight)
  values (new.id, 'stage_1', 1, 'work', 1), (new.id, 'stage_2', 2, 'work', 2),
         (new.id, 'stage_3', 3, 'work', 2), (new.id, 'stage_4', 4, 'additional', 1);
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.ensure_project_has_enabled_stage()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not exists (
    select 1 from public.project_task_stage_columns
    where project_id = new.project_id and is_enabled and deleted_at is null
  ) then raise exception 'A project must have at least one enabled stage'; end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.activate_planned_project_from_task()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if old.status is distinct from new.status
    and private.is_project_progress_stage(new.project_id, new.stage)
    and new.status in ('in_progress', 'internal_review', 'review', 'completed') then
    update public.projects set status = 'active'
    where id = new.project_id and status = 'planned' and archived_at is null;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.can_create_project_task(target_project_id uuid, target_assignee_id uuid, target_stage text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.projects as project
    where project.id = target_project_id
      and project.archived_at is null
      and project.status <> 'archived'
      and (project.status <> 'completed' or not private.is_project_progress_stage(target_project_id, target_stage))
      and private.is_studio_admin(project.studio_id)
      and (
        target_assignee_id is null
        or private.is_active_project_task_assignee(project.id, target_assignee_id)
      )
  );
$function$;

CREATE OR REPLACE FUNCTION private.can_update_project_task_status(target_project_id uuid, target_assignee_id uuid, target_stage text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from public.projects as project
    where project.id = target_project_id
      and project.archived_at is null
      and project.status <> 'archived'
      and (project.status <> 'completed' or not private.is_project_progress_stage(target_project_id, target_stage))
      and private.is_studio_admin(project.studio_id)
  ) or (
    target_assignee_id = (select auth.uid())
    and exists (
      select 1
      from public.project_members as assignment
      inner join public.projects as project on project.id = assignment.project_id
      inner join public.studio_members as studio_member
        on studio_member.studio_id = project.studio_id and studio_member.user_id = assignment.user_id
      inner join public.profiles as assignee on assignee.id = assignment.user_id
      where assignment.project_id = target_project_id
        and project.archived_at is null
        and project.status <> 'archived'
        and (project.status <> 'completed' or not private.is_project_progress_stage(target_project_id, target_stage))
        and assignment.user_id = target_assignee_id
        and assignment.is_active and studio_member.is_active and assignee.is_active
    )
  );
$function$;

CREATE OR REPLACE FUNCTION private.enforce_task_edit_permissions()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  project_status text;
  task_studio_id uuid;
  is_admin boolean;
  is_completion_date_only_edit boolean;
begin
  select project.status, project.studio_id into project_status, task_studio_id
  from public.projects as project where project.id = old.project_id;

  if project_status is null or project_status = 'archived' then raise exception 'Archived projects are read-only'; end if;
  is_admin := coalesce(private.is_studio_admin(task_studio_id), false);
  is_completion_date_only_edit := is_admin
    and new.completed_at is distinct from old.completed_at
    and (to_jsonb(new) - array['completed_at', 'updated_at']) = (to_jsonb(old) - array['completed_at', 'updated_at']);
  if project_status = 'completed'
    and (private.is_project_progress_stage(old.project_id, old.stage) or private.is_project_progress_stage(new.project_id, new.stage))
    and not is_completion_date_only_edit then
    raise exception 'Completed production tasks are read-only until the project is reopened';
  end if;

  if new.completed_at is distinct from old.completed_at then
    if not is_admin then raise exception 'Only administrators may edit task completion dates'; end if;
    if old.status <> 'completed' or new.status <> 'completed' or new.completed_at is null then
      raise exception 'Only completed tasks may have a completion date';
    end if;
    if new.completed_at > current_date then
      raise exception 'Task completion date cannot be in the future';
    end if;
  end if;

  if new.project_id is distinct from old.project_id
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
    or new.start_date is distinct from old.start_date then
    raise exception 'Task field is not editable';
  end if;
  if not is_admin and (
    new.title is distinct from old.title
    or new.description is distinct from old.description
    or new.assignee_id is distinct from old.assignee_id
    or new.priority is distinct from old.priority
    or new.due_date is distinct from old.due_date
    or new.completed_area_m2 is distinct from old.completed_area_m2
    or new.progress_weight is distinct from old.progress_weight
    or new.stage is distinct from old.stage
  ) then raise exception 'Only administrators may edit task details'; end if;
  if is_admin and new.assignee_id is not null and new.assignee_id is distinct from old.assignee_id
    and not private.is_active_project_task_assignee(old.project_id, new.assignee_id) then
    raise exception 'Task assignee must be an active project member';
  end if;
  if is_admin and new.assignee_id is null and new.assignee_id is distinct from old.assignee_id and exists (
    select 1 from public.project_members pm
    join public.projects p on p.id = pm.project_id
    where pm.project_id = old.project_id and pm.user_id = old.assignee_id and pm.is_active
      and not exists (select 1 from private.studio_member_removal_unassignment_permits permit where permit.studio_id = p.studio_id and permit.user_id = old.assignee_id)
  ) then raise exception 'Active project tasks cannot be manually unassigned'; end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.control_review_timer(p_action text, p_session_id uuid DEFAULT NULL::uuid, p_round_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := auth.uid();
  studio uuid;
  active_id uuid;
  requested uuid[];
  group_project uuid;
  group_stage text;
  instant timestamptz;
  work_session uuid;
begin
  if actor is null or (select count(*) from public.studio_members sm join public.profiles p on p.id=sm.user_id
      where sm.user_id=actor and sm.is_active and p.is_active) <> 1 then raise exception 'An active studio membership is required'; end if;
  if p_action='start' then
    -- Project revocation takes this resource lock before reviewer locks.
    perform 1 from public.projects p join public.tasks t on t.project_id=p.id join public.task_review_rounds r on r.task_id=t.id
      where r.id=any(p_round_ids) order by p.id for share of p;
  end if;
  perform private.review_timer_lock(actor);
  -- Permissions may have changed while this request waited for a concurrent action.
  if (select count(*) from public.studio_members sm join public.profiles profile on profile.id=sm.user_id
    where sm.user_id=actor and sm.is_active and profile.is_active)<>1 then raise exception 'An active studio membership is required'; end if;
  select studio_id into studio from public.studio_members where user_id=actor and is_active;
  instant := clock_timestamp();
  select id into active_id from public.review_timer_sessions where user_id=actor and state='active';
  if p_action = 'sync' then
    if active_id is not null then
      perform private.account_review_timer(active_id,instant,exists(select 1 from public.review_timer_sessions where id=active_id and studio_id<>studio)
        or exists(select 1 from public.review_timer_members m join public.task_review_rounds r on r.id=m.round_id
          join public.tasks t on t.id=r.task_id join public.projects p on p.id=t.project_id
          where m.session_id=active_id and (r.completed_at is not null or r.reviewer_id<>actor or t.status<>'internal_review'
            or not coalesce(private.can_access_project(p.id),false) or p.archived_at is not null or p.status='archived'
            or (p.status='completed' and private.is_project_progress_stage(t.project_id, t.stage)))));
      if not exists(select 1 from public.review_timer_sessions where id=active_id and state='active') then return null; end if;
    end if;
    return active_id;
  elsif p_action = 'pause' then
    if not exists(select 1 from public.review_timer_sessions where id=p_session_id and user_id=actor) then
      raise exception 'Timer unavailable'; end if;
    perform private.account_review_timer(p_session_id,instant,true);
    return p_session_id;
  elsif p_action = 'start' then
    if p_session_id is null then raise exception 'A session ID is required'; end if;
    if exists(select 1 from public.review_timer_sessions where id=p_session_id and user_id=actor and studio_id=studio) then return p_session_id; end if;
    if active_id is not null then raise exception 'Pause your active review timer before starting another'; end if;
    requested := array(select distinct id from unnest(p_round_ids) id order by id);
    if coalesce(cardinality(requested),0)=0 or cardinality(requested)<>cardinality(p_round_ids) then raise exception 'Choose unique review rounds'; end if;
    if exists(select 1 from unnest(requested) chosen(round_id) where not exists (
      select 1 from public.task_review_rounds r join public.tasks t on t.id=r.task_id join public.projects p on p.id=t.project_id
      join public.task_review_round_reviewers rr on rr.round_id=r.id and rr.reviewer_id=actor
      where r.id=chosen.round_id and r.reviewer_id=actor and r.completed_at is null and rr.approved_at is null
        and t.status='internal_review' and p.studio_id=studio and private.can_access_project(p.id)
        and p.archived_at is null and p.status<>'archived' and (p.status<>'completed' or not private.is_project_progress_stage(t.project_id, t.stage))
    )) then raise exception 'Only the current assigned reviewer can start an unfinished review'; end if;
    select t.project_id,t.stage into group_project,group_stage from public.tasks t join public.task_review_rounds r on r.task_id=t.id where r.id=requested[1];
    if exists(select 1 from public.tasks t join public.task_review_rounds r on r.task_id=t.id where r.id=any(requested)
      and (t.project_id<>group_project or t.stage<>group_stage)) then raise exception 'A shared timer requires one project and stage'; end if;
    -- Resume the exact unfinished membership, even after another member resolved.
    select s.work_session_id into work_session from public.review_timer_sessions s
      where s.user_id=actor and s.studio_id=studio and s.state='paused'
        and requested = array(select m.round_id from public.review_timer_members m
          where m.session_id=s.id and m.finished_at is null order by m.round_id)
      order by s.started_at desc,s.id limit 1;
    -- Resuming creates a fresh interval ID. A retried old Start cannot restart time.
    update public.review_timer_sessions s set state='completed' where s.user_id=actor and s.state='paused'
      and exists(select 1 from public.review_timer_members m where m.session_id=s.id and m.round_id=any(requested));
    insert into public.review_timer_sessions(id,studio_id,user_id,state,started_at,running_since,accounted_at,work_session_id)
      values(p_session_id,studio,actor,'active',instant,instant,instant,coalesce(work_session,p_session_id));
    insert into public.review_timer_members(session_id,round_id) select p_session_id,unnest(requested);
    insert into public.review_timer_intervals(session_id,started_at) values(p_session_id,instant);
    -- Even a sub-minute start is actual activity for Work Log suggestions.
    insert into public.review_timer_daily(user_id,studio_id,round_id,work_date)
      select actor,studio,unnest(requested),(instant at time zone 'Europe/Kyiv')::date on conflict do nothing;
    return p_session_id;
  else raise exception 'Choose a valid timer action'; end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.bulk_set_project_task_deadline(p_project_id uuid, p_stage text, p_task_ids uuid[], p_target_status text, p_due_date date)
 RETURNS TABLE(id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare project_studio_id uuid; project_status text; project_archived_at date;
  selected_count integer;
begin
  if not private.is_configured_project_stage(p_project_id, p_stage)
    or p_target_status not in ('internal_review','review','completed')
    or p_due_date is null or coalesce(cardinality(p_task_ids),0)=0
    or cardinality(p_task_ids)>200
    or cardinality(p_task_ids)<>(select count(distinct task_id) from unnest(p_task_ids) as task_id) then
    raise exception 'Choose a valid task batch, workflow milestone, and deadline';
  end if;
  select studio_id,status,archived_at into project_studio_id,project_status,project_archived_at
  from public.projects where projects.id=p_project_id for update;
  if project_studio_id is null or not coalesce(private.is_studio_admin(project_studio_id),false) then
    raise exception 'Only active studio administrators can edit task deadlines';
  end if;
  if project_archived_at is not null or project_status='archived'
    or (project_status='completed' and private.is_project_progress_stage(p_project_id, p_stage)) then
    raise exception 'This project stage is read-only';
  end if;
  perform 1 from public.tasks task where task.id=any(p_task_ids) order by task.id for update;
  select count(*) into selected_count from public.tasks task
  where task.id=any(p_task_ids) and task.project_id=p_project_id and task.stage=p_stage;
  if selected_count<>cardinality(p_task_ids) then
    raise exception 'Every selected task must still be available in this project stage';
  end if;
  if p_target_status='internal_review' and exists (
    select 1 from public.task_schedules schedule join public.tasks task on task.id=schedule.task_id
    where schedule.task_id=any(p_task_ids) and (
      extract(isodow from p_due_date)>5
      or p_due_date<private.schedule_add_workdays(schedule.current_start,schedule.expected_workdays-1)
      or ((task.status in ('completed','cancelled') or exists (
        select 1 from public.task_status_periods
        where task_id=schedule.task_id and status='internal_review'
      )) and p_due_date<>schedule.current_due)
    )
  ) then raise exception 'Scheduled internal review deadline must remain feasible and preserve reached history'; end if;

  delete from public.task_deadlines deadline
  where deadline.task_id=any(p_task_ids) and deadline.target_status=p_target_status;
  return query insert into public.task_deadlines (task_id,target_status,due_date)
  select task_id,p_target_status,p_due_date from unnest(p_task_ids) as task_id
  returning task_deadlines.id;
  if p_target_status='internal_review' then
    update public.task_schedules set current_due=p_due_date
    where task_id=any(p_task_ids) and current_due is distinct from p_due_date;
    perform private.reflow_task_stage_schedule(p_project_id,p_stage);
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.bulk_assign_selected_project_tasks(p_project_id uuid, p_stage text, p_assignee_id uuid, p_task_ids uuid[])
 RETURNS TABLE(id uuid)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  project_studio_id uuid;
  project_status text;
  selected_count integer;
begin
  if not private.is_configured_project_stage(p_project_id, p_stage)
    or coalesce(cardinality(p_task_ids), 0) = 0
    or cardinality(p_task_ids) > 200
    or cardinality(p_task_ids) <> cardinality(array(select distinct unnest(p_task_ids))) then
    raise exception 'Choose a non-empty unique task batch';
  end if;

  select project.studio_id, project.status into project_studio_id, project_status
  from public.projects as project where project.id = p_project_id;
  if project_studio_id is null or not coalesce(private.is_studio_admin(project_studio_id), false) then
    raise exception 'Only active studio administrators can assign project tasks';
  end if;
  if project_status = 'archived' or (project_status = 'completed' and private.is_project_progress_stage(p_project_id, p_stage)) then
    raise exception 'This project stage is read-only';
  end if;
  if not exists (
    select 1
    from public.project_members as assignment
    inner join public.studio_members as studio_member
      on studio_member.studio_id = project_studio_id
      and studio_member.user_id = assignment.user_id
    inner join public.profiles as assignee on assignee.id = assignment.user_id
    where assignment.project_id = p_project_id
      and assignment.user_id = p_assignee_id
      and assignment.is_active
      and studio_member.is_active
      and assignee.is_active
  ) then
    raise exception 'Task assignee must be an active project member';
  end if;

  perform 1 from public.tasks as task where task.id = any(p_task_ids) order by task.id for update;
  select count(*) into selected_count
  from public.tasks as task
  where task.id = any(p_task_ids)
    and task.project_id = p_project_id
    and task.stage = p_stage
    and task.status <> 'cancelled';
  if selected_count <> cardinality(p_task_ids) then
    raise exception 'Every selected task must still be available in this project stage';
  end if;

  return query update public.tasks as task set assignee_id = p_assignee_id
  where task.id = any(p_task_ids) returning task.id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.bulk_assign_project_stage_tasks(p_project_id uuid, p_stage text, p_assignee_id uuid, p_scope text)
 RETURNS TABLE(id uuid)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  project_studio_id uuid;
  project_status text;
  selected_task_ids uuid[];
begin
  if not private.is_configured_project_stage(p_project_id, p_stage) or p_scope not in ('unassigned', 'all') then
    raise exception 'Choose a valid task stage and assignment scope';
  end if;

  select project.studio_id, project.status into project_studio_id, project_status
  from public.projects as project where project.id = p_project_id;
  if project_studio_id is null or not coalesce(private.is_studio_admin(project_studio_id), false) then
    raise exception 'Only active studio administrators can assign project tasks';
  end if;
  if project_status = 'archived' or (project_status = 'completed' and private.is_project_progress_stage(p_project_id, p_stage)) then
    raise exception 'This project stage is read-only';
  end if;
  if not exists (
    select 1
    from public.project_members as assignment
    inner join public.studio_members as studio_member
      on studio_member.studio_id = project_studio_id
      and studio_member.user_id = assignment.user_id
    inner join public.profiles as assignee on assignee.id = assignment.user_id
    where assignment.project_id = p_project_id
      and assignment.user_id = p_assignee_id
      and assignment.is_active
      and studio_member.is_active
      and assignee.is_active
  ) then
    raise exception 'Task assignee must be an active project member';
  end if;

  select coalesce(array_agg(source_task.task_id), '{}'::uuid[]) into selected_task_ids
  from (
    select task.id as task_id from public.tasks as task
    where task.project_id = p_project_id and task.stage = p_stage and task.status <> 'cancelled'
      and (p_scope = 'all' or task.assignee_id is null)
      and task.assignee_id is distinct from p_assignee_id
    order by task.id for update
  ) as source_task;
  if cardinality(selected_task_ids) = 0 then return; end if;

  return query update public.tasks as task set assignee_id = p_assignee_id
  where task.id = any(selected_task_ids) returning task.id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_task_review(p_task_id uuid, p_action text, p_reviewer_id uuid DEFAULT NULL::uuid, p_requires_review boolean DEFAULT NULL::boolean, p_round_id uuid DEFAULT NULL::uuid, p_comment text DEFAULT NULL::text, p_reviewer_ids uuid[] DEFAULT NULL::uuid[], p_expected_reviewer_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  approved_ids uuid[];
begin
  if actor is null or (select count(*) from public.studio_members sm join public.profiles p on p.id = sm.user_id
      where sm.user_id = actor and sm.is_active and p.is_active) <> 1 then
    raise exception 'An active studio membership is required';
  end if;
  -- Main task edits carry the same expected round/reviewer as direct reassignment.
  if p_action='configure' and p_round_id is not null then p_action:='reassign'; end if;
  -- Match timer/save lock order before acquiring task/round locks.
  if p_action in ('approved','rework','reassign') then
    perform 1 from public.projects p join public.tasks t on t.project_id=p.id where t.id=p_task_id for share of p;
    perform private.review_timer_lock(locked.reviewer_id) from (
      select rr.reviewer_id from public.task_review_round_reviewers rr where rr.round_id=p_round_id
      union select unnest(p_reviewer_ids) where p_action='reassign'
    ) locked order by locked.reviewer_id;
  end if;
  select * into task from public.tasks where id = p_task_id for update;
  if not found or not coalesce(private.can_access_project(task.project_id), false) then raise exception 'Task not found or unavailable'; end if;
  select * into project from public.projects where id = task.project_id for share;
  if project.archived_at is not null or project.status = 'archived'
    or (project.status = 'completed' and private.is_project_progress_stage(task.project_id, task.stage)) then raise exception 'This project task is read-only'; end if;
  is_admin := coalesce(private.is_studio_admin(project.studio_id), false);
  select enabled_statuses into enabled from public.project_task_stage_columns
    where project_id = task.project_id and stage = task.stage for share;
  if p_action in ('configure','reassign') then
    if not is_admin then raise exception 'Only studio administrators can configure task review'; end if;
    if p_reviewer_ids is null and p_requires_review is null then raise exception 'Choose task reviewers'; end if;
    requested_ids := coalesce(p_reviewer_ids, case when p_requires_review then array[p_reviewer_id] else '{}'::uuid[] end);
    if cardinality(requested_ids) <> (select count(distinct reviewer_id) from unnest(requested_ids) as reviewer_id) then
      raise exception 'Task reviewers must be unique and non-null';
    end if;
    select coalesce(array_agg(reviewer_id order by position), '{}'::uuid[]) into current_ids from public.task_reviewers where task_id = task.id;
    if p_action='reassign' then
      select * into round from public.task_review_rounds
        where task_id=task.id and id=p_round_id and completed_at is null for update;
      if not found or task.status<>'internal_review' then raise exception 'This review is no longer active'; end if;
      if p_expected_reviewer_id is distinct from round.reviewer_id then raise exception 'This review step is no longer active'; end if;
      select coalesce(array_agg(reviewer_id order by position),'{}'::uuid[]) into approved_ids
        from public.task_review_round_reviewers where round_id=round.id and approved_at is not null;
      if cardinality(requested_ids)<=cardinality(approved_ids)
        or requested_ids[1:cardinality(approved_ids)] is distinct from approved_ids then
        raise exception 'Preserve approved reviewers and at least one pending reviewer';
      end if;
    elsif exists (select 1 from public.task_review_rounds where task_id = task.id and completed_at is null) then
      if requested_ids=current_ids then return; end if;
      raise exception 'Change the active reviewer sequence from the review section';
    end if;
    if requested_ids=current_ids then return; end if;
    foreach requested_id in array requested_ids loop
      if p_action='reassign' and requested_id=any(approved_ids) then continue; end if;
      if not exists (
        select 1 from public.studio_members sm join public.profiles p on p.id = sm.user_id
        where sm.studio_id = project.studio_id and sm.user_id = requested_id and sm.is_active and p.is_active
          and (sm.system_role = 'admin' or private.is_active_project_task_assignee(task.project_id, requested_id))
      ) then raise exception 'Choose active reviewers with access to this project'; end if;
    end loop;
    if p_action='reassign' then
      -- Reviewer change fires the existing timer checkpoint before removing pending assignments.
      next_reviewer_id := requested_ids[cardinality(approved_ids)+1];
      update public.task_review_rounds set reviewer_id=next_reviewer_id where id=round.id;
      delete from public.task_review_round_reviewers where round_id=round.id and approved_at is null;
      insert into public.task_review_round_reviewers(round_id,reviewer_id,position)
        select round.id,reviewer_id,(ordinality-1)::integer
        from unnest(requested_ids) with ordinality reviewers(reviewer_id,ordinality)
        where ordinality>cardinality(approved_ids);
      perform private.record_project_activity(project.studio_id,task.project_id,'task_updated','task',task.id,
        jsonb_build_object('review_round_id',round.id,'review_action','reassigned',
          'reviewer_ids',jsonb_build_object('from',current_ids,'to',requested_ids)));
    end if;
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
$function$;

CREATE OR REPLACE FUNCTION private.clamp_project_task_completion_dates()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if old.status = 'completed'
    and new.status = 'completed'
    and old.completed_at is not null
    and new.completed_at is not null
    and new.completed_at < old.completed_at then
    if not coalesce(private.is_studio_admin(new.studio_id), false) then
      raise exception 'Only administrators may edit project completion dates';
    end if;

    update public.tasks as task
    set completed_at = new.completed_at
    where task.project_id = new.id
      and private.is_project_progress_stage(task.project_id, task.stage)
      and task.status = 'completed'
      and task.completed_at > new.completed_at;
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.validate_project_lifecycle_transition()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  open_task_count integer;
  has_progressed_eligible_task boolean;
  is_completion_date_only_edit boolean;
  is_start_date_only_edit boolean;
begin
  if (new.status = 'archived') is distinct from (new.archived_at is not null) then
    raise exception 'Archived projects must have an archive date, and active projects must not';
  end if;

  if old.status in ('completed', 'archived') and (
    new.name is distinct from old.name
    or new.project_code is distinct from old.project_code
    or new.client_name is distinct from old.client_name
    or new.description is distinct from old.description
    or new.total_area_m2 is distinct from old.total_area_m2
    or new.priority is distinct from old.priority
    or new.start_date is distinct from old.start_date
    or new.due_date is distinct from old.due_date
  ) then
    raise exception 'Completed and archived project details are read-only';
  end if;

  -- Explicit historical corrections require an admin; task-driven activation
  -- below can record the first start on behalf of an employee.
  if new.started_at is distinct from old.started_at
    and not coalesce(private.is_studio_admin(old.studio_id), false) then
    raise exception 'Only administrators may edit project actual start dates';
  end if;

  is_start_date_only_edit := new.started_at is distinct from old.started_at
    and (to_jsonb(new) - array['started_at', 'updated_at']) = (to_jsonb(old) - array['started_at', 'updated_at']);
  if is_start_date_only_edit then return new; end if;

  if old.status = 'planned' and new.status = 'active' and new.started_at is null then
    new.started_at := (now() at time zone 'Europe/Kyiv')::date;
  end if;

  is_completion_date_only_edit := old.status = 'completed'
    and new.status = 'completed'
    and new.completed_at is not null
    and new.completed_at is distinct from old.completed_at
    and (to_jsonb(new) - array['completed_at', 'updated_at']) = (to_jsonb(old) - array['completed_at', 'updated_at']);
  if is_completion_date_only_edit then
    if not coalesce(private.is_studio_admin(old.studio_id), false) then
      raise exception 'Only administrators may edit project completion dates';
    end if;
    if new.completed_at > (now() at time zone 'Europe/Kyiv')::date then
      raise exception 'Project completion date cannot be in the future';
    end if;
    return new;
  end if;

  -- Stage settings are the existing administrator configuration surface.
  if old.status <> 'archived' and private.is_studio_admin(old.studio_id)
    and (to_jsonb(new) - array['stage_configuration_version','include_in_productivity','show_progress','updated_at'])
      = (to_jsonb(old) - array['stage_configuration_version','include_in_productivity','show_progress','updated_at'])
    and new.stage_configuration_version = old.stage_configuration_version + 1 then return new; end if;
  if new.status is not distinct from old.status and new.archived_at is not distinct from old.archived_at then
    if old.status = 'archived' then raise exception 'Archived projects are read-only'; end if;
    if old.status = 'completed' then raise exception 'Completed projects are read-only until reopened'; end if;
    if new.completed_at is distinct from old.completed_at then raise exception 'Completion date is managed through lifecycle transitions'; end if;
    return new;
  end if;

  if new.status = 'archived' then
    if new.completed_at is distinct from old.completed_at then raise exception 'Archiving must preserve the completion date'; end if;
    return new;
  end if;

  if old.status = 'archived' then
    if new.archived_at is not null
      or new.status is distinct from (case when old.completed_at is not null then 'completed' else 'paused' end)
      or new.completed_at is distinct from old.completed_at then
      raise exception 'Archived projects must restore to their established lifecycle target';
    end if;
    return new;
  end if;

  if new.completed_at is distinct from old.completed_at
    and not (old.status in ('active', 'paused') and new.status = 'completed')
    and not (old.status = 'completed' and new.status = 'active') then
    raise exception 'Completion date is managed through lifecycle transitions';
  end if;

  if old.status = 'planned' and new.status = 'active' then return new; end if;
  if old.status = 'active' and new.status = 'paused' then return new; end if;
  if old.status = 'paused' and new.status = 'active' then return new; end if;
  if old.status = 'completed' and new.status = 'active' then new.completed_at := null; return new; end if;

  if old.status = 'paused' and new.status = 'planned' then
    select exists (
      select 1 from public.tasks as task
      where task.project_id = old.id
        and private.is_project_progress_stage(task.project_id, task.stage)
        and task.status not in ('cancelled', 'todo')
    ) into has_progressed_eligible_task;
    if not has_progressed_eligible_task then return new; end if;
    raise exception 'A paused project can return to planned only when eligible tasks are still to do';
  end if;

  if old.status in ('active', 'paused') and new.status = 'completed' then
    select count(*) into open_task_count
    from public.tasks as task
    where task.project_id = old.id
      and private.is_project_progress_stage(task.project_id, task.stage)
      and task.status not in ('completed', 'cancelled');
    if open_task_count = 0 then new.completed_at := (now() at time zone 'Europe/Kyiv')::date; return new; end if;
    raise exception 'A project with open production tasks cannot be completed';
  end if;

  raise exception 'Invalid project lifecycle transition';
end;
$function$;

CREATE OR REPLACE FUNCTION public.apply_project_template_stage(p_project_id uuid, p_template_id uuid, p_source_stage text, p_destination_stage text, p_anchor_date date DEFAULT NULL::date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  project_studio_id uuid;
  project_status text;
  project_archived_at date;
  template_studio_id uuid;
  copied_count integer;
begin
  if p_source_stage not in ('stage_1','stage_2','stage_3','stage_4')
    or not private.is_configured_project_stage(p_project_id, p_destination_stage) then
    raise exception 'Choose valid source and destination stages';
  end if;
  select project.studio_id,project.status,project.archived_at
  into project_studio_id,project_status,project_archived_at
  from public.projects project where project.id=p_project_id for update;
  if not found or not coalesce(private.is_studio_admin(project_studio_id),false) then
    raise exception 'Only active studio administrators can apply project templates';
  end if;
  if project_archived_at is not null or project_status='archived'
    or (project_status='completed' and private.is_project_progress_stage(p_project_id, p_destination_stage)) then
    raise exception 'This project stage is read-only';
  end if;
  if not exists (
    select 1 from public.project_task_stage_columns stage_columns
    where stage_columns.project_id=p_project_id and stage_columns.stage=p_destination_stage
      and stage_columns.is_enabled and 'todo'=any(stage_columns.enabled_statuses)
  ) then raise exception 'The destination stage must be enabled and allow Todo tasks'; end if;
  if exists (select 1 from public.project_task_stage_columns
    where project_id=p_project_id and stage=p_destination_stage and schedule_paused_on is not null)
    then raise exception 'Resume the stage schedule before applying a template'; end if;
  select studio_id into template_studio_id from public.project_templates
  where id=p_template_id and is_active for share;
  if not found or template_studio_id <> project_studio_id then
    raise exception 'Choose an active project template from this studio';
  end if;
  if p_anchor_date is null and exists (
    select 1 from public.project_template_tasks
    where template_id=p_template_id and stage=p_source_stage and expected_workdays is not null
  ) then raise exception 'Choose a stage schedule start date'; end if;
  update public.project_task_stage_columns set schedule_anchor_date=p_anchor_date
  where project_id=p_project_id and stage=p_destination_stage;
  copied_count := private.copy_project_template_stage_tasks(
    p_project_id,p_template_id,p_source_stage,p_destination_stage,null
  );
  if copied_count=0 then raise exception 'The selected template stage has no tasks'; end if;
  return copied_count;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_project_stage_schedule_paused(p_project_id uuid, p_stage text, p_paused boolean, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare project_studio_id uuid; project_status text; project_archived_at date;
  pause_started date; elapsed integer;
begin
  if not private.is_configured_project_stage(p_project_id, p_stage) or p_paused is null
    or (p_paused and p_reason is not null and p_reason not in ('waiting_for_client','internal_pause','other'))
    or (not p_paused and p_reason is not null) then
    raise exception 'Choose a valid stage pause action';
  end if;
  select studio_id,status,archived_at into project_studio_id,project_status,project_archived_at
  from public.projects where id=p_project_id for update;
  if project_studio_id is null or not coalesce(private.is_studio_admin(project_studio_id),false) then
    raise exception 'Only active studio administrators can pause stage schedules';
  end if;
  if project_archived_at is not null or project_status='archived'
    or (project_status='completed' and private.is_project_progress_stage(p_project_id, p_stage)) then
    raise exception 'This project stage is read-only';
  end if;
  select schedule_paused_on into pause_started
  from public.project_task_stage_columns
  where project_id=p_project_id and stage=p_stage for update;
  if p_paused then
    if pause_started is not null then return; end if;
    update public.project_task_stage_columns
    set schedule_paused_on=(now() at time zone 'Europe/Kyiv')::date,
      schedule_pause_reason=p_reason
    where project_id=p_project_id and stage=p_stage;
    update public.task_schedules schedule set is_paused=true
    from public.tasks task where task.id=schedule.task_id and task.status not in ('completed','cancelled')
      and not exists (select 1 from public.task_status_periods period
        where period.task_id=task.id and period.status='internal_review')
      and schedule.project_id=p_project_id and schedule.stage=p_stage;
    return;
  end if;
  if pause_started is null then return; end if;
  elapsed := private.schedule_workdays_elapsed(pause_started,(now() at time zone 'Europe/Kyiv')::date);
  update public.project_task_stage_columns
  set schedule_paused_on=null,schedule_pause_reason=null
  where project_id=p_project_id and stage=p_stage;
  update public.task_schedules schedule set
    current_start=private.schedule_add_workdays(schedule.current_start,elapsed),
    current_due=private.schedule_add_workdays(schedule.current_due,elapsed)
  from public.tasks task where task.id=schedule.task_id and task.status not in ('completed','cancelled')
    and not exists (select 1 from public.task_status_periods period
      where period.task_id=task.id and period.status='internal_review')
    and schedule.project_id=p_project_id and schedule.stage=p_stage;
  update public.task_schedules set is_paused=false
  where project_id=p_project_id and stage=p_stage and is_paused;
  update public.task_deadlines deadline set due_date=schedule.current_due
  from public.task_schedules schedule
  join public.tasks task on task.id=schedule.task_id
  where deadline.task_id=schedule.task_id and deadline.target_status='internal_review'
    and schedule.project_id=p_project_id and schedule.stage=p_stage
    and task.status not in ('completed','cancelled')
    and not exists (select 1 from public.task_status_periods period
      where period.task_id=task.id and period.status='internal_review')
    and deadline.due_date is distinct from schedule.current_due;
  perform private.reflow_task_stage_schedule(p_project_id,p_stage);
end;
$function$;

CREATE OR REPLACE FUNCTION public.save_stage_task_structure(p_project_id uuid, p_stage text, p_updates jsonb, p_creates jsonb, p_delete_ids uuid[], p_order uuid[] DEFAULT NULL::uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  project_row public.projects%rowtype;
  task_row record;
  source_row record;
  item jsonb;
  checklist jsonb;
  v_template_id uuid;
  source_id uuid;
  prepared_creates jsonb := '[]';
  affected_ids uuid[];
  requested_ids uuid[];
  affected_count integer;
  saved_task_id uuid;
  displayed_order uuid[] := p_order;
begin
  select * into project_row from public.projects where id = p_project_id for update;
  if not found or not coalesce(private.is_studio_admin(project_row.studio_id), false)
    or p_stage is null or not private.is_configured_project_stage(p_project_id, p_stage)
    or not coalesce(private.can_update_project_task_status(p_project_id, null, p_stage), false) then
    raise exception 'This project stage is read-only or unavailable';
  end if;
  if jsonb_typeof(p_updates) is distinct from 'array' or jsonb_typeof(p_creates) is distinct from 'array'
    or p_delete_ids is null then raise exception 'Invalid stage task batch'; end if;
  if jsonb_array_length(p_creates) > 0 and not exists (
    select 1 from public.project_task_stage_columns where project_id = p_project_id and stage = p_stage
      and is_enabled and 'todo' = any(enabled_statuses)
  ) then raise exception 'Choose an enabled stage that allows new Todo tasks'; end if;

  select coalesce(array_agg((value ->> 'id')::uuid), '{}') || p_delete_ids into affected_ids
  from jsonb_array_elements(p_updates);
  if cardinality(affected_ids) <> cardinality(array(select distinct unnest(affected_ids)))
    or array_position(affected_ids, null) is not null then raise exception 'Choose each task only once'; end if;
  select array(select distinct id from (
    select unnest(affected_ids) as id union all
    select (value ->> 'source_task_id')::uuid from jsonb_array_elements(p_creates)
    where value ->> 'source_task_id' is not null
  ) ids) into requested_ids;
  perform id from public.tasks where id = any(requested_ids) and project_id = p_project_id and stage = p_stage
  order by id for update;
  get diagnostics affected_count = row_count;
  if affected_count <> cardinality(requested_ids) then
    raise exception 'Tasks have changed stage or are no longer available' using errcode = '40001';
  end if;

  for item in select value from jsonb_array_elements(p_updates || p_creates) loop
    if jsonb_typeof(item) is distinct from 'object'
      or char_length(btrim(coalesce(item ->> 'title', ''))) not between 1 and 200
      or not (item ? 'completed_area_m2' and item ? 'checklist_template_id')
      or (item ->> 'completed_area_m2' is not null and not ((item ->> 'completed_area_m2')::numeric > 0
        and (item ->> 'completed_area_m2')::numeric <= 1000000)) then
      raise exception 'Enter a valid task name and area';
    end if;
  end loop;

  if p_order is not null and (array_position(p_order, null) is not null
    or cardinality(p_order) <> cardinality(array(select distinct unnest(p_order))))
    then raise exception 'Choose each task only once'; end if;

  -- Capture sources before deletion; only structural fields ever reach creation.
  for item in select value from jsonb_array_elements(p_creates) loop
    if p_order is not null and item ->> 'client_key' is null then raise exception 'A new task key is required'; end if;
    source_id := (item ->> 'source_task_id')::uuid;
    v_template_id := (item ->> 'checklist_template_id')::uuid;
    select checklist_template_id, description, progress_weight into source_row from public.tasks where id = source_id;
    if v_template_id is not null and not exists (
      select 1 from public.checklist_templates
      where id = v_template_id and studio_id = project_row.studio_id and archived_at is null
    ) then raise exception 'Choose an active checklist template from this studio'; end if;

    if source_id is not null and v_template_id is not distinct from source_row.checklist_template_id then
      -- Preserve customized/manual checklist structure, with fresh pending items.
      select coalesce(jsonb_agg(jsonb_build_object('title', title, 'weight', weight) order by position, id), '[]')
      into checklist from public.task_checklist_items where task_id = source_id;
    else
      select coalesce(jsonb_agg(jsonb_build_object('title', title, 'weight', weight) order by position, id), '[]')
      into checklist from public.checklist_template_items where template_id = v_template_id;
    end if;
    prepared_creates := prepared_creates || jsonb_build_array(jsonb_build_object('client_key', item ->> 'client_key', 'task', jsonb_build_object(
      'project_id', p_project_id, 'stage', p_stage, 'title', btrim(item ->> 'title'),
      'description', source_row.description, 'priority', 'normal',
      'completed_area_m2', item -> 'completed_area_m2', 'progress_weight', coalesce(source_row.progress_weight, 1),
      'checklist_template_id', v_template_id
    ), 'checklist', checklist));
  end loop;

  -- Identical table operation to normal deletion; never a SECURITY DEFINER bypass.
  delete from public.tasks where id = any(p_delete_ids) and project_id = p_project_id and stage = p_stage;
  get diagnostics affected_count = row_count;
  if affected_count <> cardinality(p_delete_ids) then raise exception 'Tasks could not be deleted'; end if;

  -- Free area before reallocating it so valid batches never exceed the cap midway.
  for item in select value from jsonb_array_elements(p_updates)
    order by coalesce((value ->> 'completed_area_m2')::numeric, 0)
      - coalesce((value -> 'previous' ->> 'completed_area_m2')::numeric, 0)
  loop
    select id, title, completed_area_m2, checklist_template_id into task_row from public.tasks where id = (item ->> 'id')::uuid;
    if jsonb_build_object('title', task_row.title, 'completed_area_m2', task_row.completed_area_m2,
      'checklist_template_id', task_row.checklist_template_id) is distinct from item -> 'previous' then
      raise exception 'Task structure changed. Reopen the editor before saving' using errcode = '40001';
    end if;
    if task_row.checklist_template_id is distinct from (item ->> 'checklist_template_id')::uuid then
      perform public.set_task_checklist_template(task_row.id, (item ->> 'checklist_template_id')::uuid);
    end if;
    update public.tasks set title = btrim(item ->> 'title'), completed_area_m2 = (item ->> 'completed_area_m2')::numeric
    where id = task_row.id and project_id = p_project_id and stage = p_stage;
    if not found then raise exception 'Task details could not be updated'; end if;
  end loop;

  for item in select value from jsonb_array_elements(prepared_creates) loop
    saved_task_id := public.create_task_with_checklist(item -> 'task', item -> 'checklist');
    if p_order is not null then
      displayed_order := array_replace(displayed_order, (item ->> 'client_key')::uuid, saved_task_id);
    end if;
  end loop;
  if p_order is not null then
    perform private.set_project_stage_task_order(p_project_id, p_stage, displayed_order);
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.bulk_configure_task_review(p_project_id uuid, p_stage text, p_task_ids uuid[], p_reviewer_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  project_studio_id uuid;
  selected_id uuid;
begin
  if p_stage is null or not private.is_configured_project_stage(p_project_id, p_stage)
    or coalesce(cardinality(p_task_ids), 0) = 0 or cardinality(p_task_ids) > 200
    or cardinality(p_task_ids) <> (select count(distinct task_id) from unnest(p_task_ids) as task_id)
    or p_reviewer_ids is null then raise exception 'Choose a non-empty unique task batch and reviewers'; end if;
  select studio_id into project_studio_id from public.projects where id = p_project_id;
  if project_studio_id is null or not coalesce(private.is_studio_admin(project_studio_id), false) then
    raise exception 'Only active studio administrators can configure task review';
  end if;
  perform 1 from public.tasks where project_id = p_project_id and id = any(p_task_ids) order by id for update;
  if (select count(*) from public.tasks where project_id = p_project_id and stage = p_stage and id = any(p_task_ids)) <> cardinality(p_task_ids) then
    raise exception 'Every selected task must still be available in this project stage';
  end if;
  foreach selected_id in array p_task_ids loop
    perform public.update_task_review(selected_id, 'configure', p_reviewer_ids => p_reviewer_ids);
  end loop;
end;
$function$;

CREATE OR REPLACE FUNCTION private.pause_revoked_review_timers()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare candidate record; target_user uuid; target_project uuid;
begin
  if tg_table_name='profiles' then target_user:=new.id;
  elsif tg_table_name='studio_members' then target_user:=old.user_id;
  elsif tg_table_name='project_members' then target_user:=old.user_id; target_project:=old.project_id;
  elsif tg_table_name='projects' then target_project:=new.id;
  end if;
  -- Wait for an in-flight Start before discovering sessions, including its uncommitted insert.
  if target_user is not null then perform private.review_timer_lock(target_user); end if;
  for candidate in select distinct s.id,s.user_id from public.review_timer_sessions s
    join public.review_timer_members m on m.session_id=s.id join public.task_review_rounds r on r.id=m.round_id
    where s.state='active' and (target_user is null or s.user_id=target_user)
      and (target_project is null or r.project_id=target_project) order by s.user_id loop
    perform private.review_timer_lock(candidate.user_id);
    if exists(select 1 from public.review_timer_members m join public.task_review_rounds r on r.id=m.round_id
      join public.tasks t on t.id=r.task_id join public.projects p on p.id=t.project_id
      where m.session_id=candidate.id and (
        r.completed_at is not null or r.reviewer_id<>candidate.user_id or t.status<>'internal_review'
        or p.archived_at is not null or p.status='archived' or (p.status='completed' and private.is_project_progress_stage(t.project_id, t.stage))
        or not exists(select 1 from public.studio_members sm join public.profiles profile on profile.id=sm.user_id
          where sm.user_id=candidate.user_id and sm.studio_id=p.studio_id and sm.is_active and profile.is_active
            and (sm.system_role='admin' or exists(select 1 from public.project_members pm
              where pm.project_id=p.id and pm.user_id=candidate.user_id and pm.is_active)))
      )) then perform private.account_review_timer(candidate.id,clock_timestamp(),true); end if;
  end loop;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$function$;


CREATE OR REPLACE FUNCTION public.refresh_project_task_schedules(p_project_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare scheduled_project uuid; scheduled_stage text;
begin
  for scheduled_project in select distinct unnest(p_project_ids) loop
    if not coalesce(private.can_access_project(scheduled_project),false) then
      raise exception 'Project schedule is not accessible';
    end if;
    for scheduled_stage in
      select distinct schedule.stage
      from public.task_schedules schedule
      join public.projects project on project.id=schedule.project_id
      where schedule.project_id=scheduled_project
        and project.archived_at is null and project.status <> 'archived'
        and (project.status <> 'completed' or not private.is_project_progress_stage(schedule.project_id, schedule.stage))
      order by schedule.stage
    loop
      perform private.reflow_task_stage_schedule(scheduled_project,scheduled_stage);
    end loop;
  end loop;
end;
$function$;

-- At commit there must still be an enabled, non-deleted stage.
drop trigger ensure_project_has_enabled_stage_after_update on public.project_task_stage_columns;
create constraint trigger ensure_project_has_enabled_stage_after_update
after insert or update of is_enabled, deleted_at on public.project_task_stage_columns
  deferrable initially deferred for each row execute function private.ensure_project_has_enabled_stage();

-- One statement supplies the version and rows from the same MVCC snapshot.
create function public.get_project_stage_configuration(p_project_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('version',p.stage_configuration_version,'includeInProductivity',p.include_in_productivity,'showProgress',p.show_progress,
    'rows',coalesce((select jsonb_agg(to_jsonb(s) order by s.display_order,s.stage)
      from public.project_task_stage_columns s where s.project_id=p.id and s.deleted_at is null),'[]'::jsonb))
  from public.projects p where p.id=p_project_id;
$$;
revoke all on function public.get_project_stage_configuration(uuid) from public,anon;
grant execute on function public.get_project_stage_configuration(uuid) to authenticated;

create function public.get_project_stage_deletion_info(p_project_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.projects where id=p_project_id and private.is_studio_admin(studio_id)) then
    raise exception 'Only active studio administrators can configure project stages'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('stage', s.stage,
    'taskIds', coalesce((select jsonb_agg(t.id order by t.id) from public.tasks t where t.project_id=p_project_id and t.stage=s.stage),'[]'::jsonb),
    'blockReason', case
      when exists(select 1 from public.tasks t where t.project_id=p_project_id and t.stage=s.stage and t.status<>'todo') then 'started_tasks'
      when exists(select 1 from public.work_log_entries w join public.tasks t on t.id=w.task_id where t.project_id=p_project_id and t.stage=s.stage) then 'logged_work'
      else null end)) from public.project_task_stage_columns s where s.project_id=p_project_id and s.deleted_at is null),'[]'::jsonb);
end;
$$;
revoke all on function public.get_project_stage_deletion_info(uuid) from public,anon;
grant execute on function public.get_project_stage_deletion_info(uuid) to authenticated;

drop function public.update_project_stage_configuration(uuid,jsonb,boolean,boolean);
-- Structural writes stay behind this narrow, authenticated admin transaction;
-- authenticated receives no direct INSERT/DELETE or structural column grants.
create function public.update_project_stage_configuration(
 p_project_id uuid, p_stages jsonb, p_include_in_productivity boolean, p_show_progress boolean,
 p_expected_version integer, p_deleted_task_ids uuid[]
) returns void language plpgsql security definer set search_path='' as $$
declare project public.projects; requested record; stage_count integer; removed_stages text[]; current_task_ids uuid[];
begin
  select * into project from public.projects where id=p_project_id for update;
  if not found or not coalesce(private.is_studio_admin(project.studio_id),false) then raise exception 'stage_not_admin'; end if;
  if project.archived_at is not null or project.status='archived' then raise exception 'stage_read_only'; end if;
  if p_expected_version is null or project.stage_configuration_version<>p_expected_version then raise exception 'stage_version_conflict'; end if;
  if p_stages is null or jsonb_typeof(p_stages)<>'array' or p_include_in_productivity is null or p_show_progress is null or p_deleted_task_ids is null then raise exception 'stage_invalid_configuration'; end if;
  stage_count:=jsonb_array_length(p_stages);
  if stage_count=0 or not exists(select 1 from jsonb_array_elements(p_stages) e where (e->>'is_enabled')::boolean) then raise exception 'stage_minimum_stage'; end if;
  if exists(select 1 from jsonb_to_recordset(p_stages) as e(stage text,display_name text,is_enabled boolean,display_order integer,kind text,progress_weight integer)
    where e.stage is null or not(e.stage in ('stage_1','stage_2','stage_3','stage_4') or e.stage ~ '^custom_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
      or e.display_name is null or char_length(btrim(e.display_name)) not between 1 and 80 or e.is_enabled is null
      or e.display_order is null or e.display_order not between 1 and stage_count
      or e.kind is null or e.kind not in ('work','additional') or e.progress_weight is null or e.progress_weight<1)
    or (select count(distinct e->>'stage') from jsonb_array_elements(p_stages) e)<>stage_count
    or (select count(distinct (e->>'display_order')::integer) from jsonb_array_elements(p_stages) e)<>stage_count then raise exception 'stage_invalid_configuration'; end if;
  perform 1 from public.project_task_stage_columns where project_id=p_project_id order by stage for update;
  if exists(select 1 from jsonb_array_elements(p_stages) e join public.project_task_stage_columns s on s.project_id=p_project_id and s.stage=e->>'stage'
    where s.deleted_at is not null or s.kind<>e->>'kind') then raise exception 'stage_invalid_configuration'; end if;
  -- Legacy accounting identities cannot be fabricated or reassigned to new stages.
  if exists(select 1 from jsonb_array_elements(p_stages) e where e->>'stage' not like 'custom_%' and not exists(
    select 1 from public.project_task_stage_columns s where s.project_id=p_project_id and s.stage=e->>'stage' and s.deleted_at is null)) then raise exception 'stage_invalid_configuration'; end if;
  select coalesce(array_agg(s.stage),'{}') into removed_stages from public.project_task_stage_columns s
    where s.project_id=p_project_id and s.deleted_at is null and not exists(select 1 from jsonb_array_elements(p_stages) e where e->>'stage'=s.stage);
  perform 1 from public.tasks where project_id=p_project_id and stage=any(removed_stages) order by id for update;
  select coalesce(array_agg(id order by id),'{}') into current_task_ids from public.tasks where project_id=p_project_id and stage=any(removed_stages);
  if current_task_ids is distinct from array(select distinct unnest(p_deleted_task_ids) order by 1) then raise exception 'stage_tasks_changed'; end if;
  if exists(select 1 from public.tasks where project_id=p_project_id and stage=any(removed_stages) and status<>'todo') then raise exception 'stage_started_tasks'; end if;
  if exists(select 1 from public.work_log_entries where task_id=any(current_task_ids)) then raise exception 'stage_logged_work'; end if;
  if exists(select 1 from public.tasks t join jsonb_array_elements(p_stages) e on e->>'stage'=t.stage
    where t.project_id=p_project_id and not(e->>'is_enabled')::boolean and t.status not in ('completed','cancelled')) then raise exception 'stage_active_tasks'; end if;
  delete from public.tasks where project_id=p_project_id and stage=any(removed_stages);
  update public.project_task_stage_columns set deleted_at=clock_timestamp(),is_enabled=false,updated_at=now()
    where project_id=p_project_id and stage=any(removed_stages);
  for requested in select * from jsonb_to_recordset(p_stages) as e(stage text,display_name text,is_enabled boolean,display_order integer,kind text,progress_weight integer) loop
    insert into public.project_task_stage_columns(project_id,stage,display_name,is_enabled,display_order,kind,progress_weight)
    values(p_project_id,requested.stage,btrim(requested.display_name),requested.is_enabled,requested.display_order,requested.kind,requested.progress_weight)
    on conflict(project_id,stage) do update set display_name=excluded.display_name,is_enabled=excluded.is_enabled,
      display_order=excluded.display_order,progress_weight=excluded.progress_weight,updated_at=now();
  end loop;
  update public.projects set include_in_productivity=p_include_in_productivity,show_progress=p_show_progress,
    stage_configuration_version=stage_configuration_version+1 where id=p_project_id;
end;
$$;
revoke all on function public.update_project_stage_configuration(uuid,jsonb,boolean,boolean,integer,uuid[]) from public,anon;
grant execute on function public.update_project_stage_configuration(uuid,jsonb,boolean,boolean,integer,uuid[]) to authenticated;
