-- Stage 1/3 area follows the current eligible task roster. Completion identity
-- and dates remain ledger snapshots; active area is a deterministic projection.
create or replace function private.rebalance_stage_productivity(p_project_id uuid, p_stage text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  project_area numeric;
  stage_budget numeric;
  eligible_count integer;
  base_share numeric;
begin
  if p_stage not in ('stage_1', 'stage_3') then return; end if;

  -- Serialize roster and area changes for this project before counting tasks.
  select greatest(coalesce(total_area_m2, 0), 0) into project_area
  from public.projects where id = p_project_id for update;
  if not found then return; end if;
  stage_budget := project_area * private.productivity_stage_ratio(p_stage);
  select count(*) into eligible_count from public.tasks
  where project_id = p_project_id and stage = p_stage and status <> 'cancelled';
  base_share := case when eligible_count > 0 then trunc(stage_budget / eligible_count, 12) else 0 end;

  insert into public.project_stage_productivity_budgets
    (project_id, stage, project_area_m2, productivity_budget_m2, allocated_productivity_m2)
  values (p_project_id, p_stage, project_area, stage_budget, 0)
  on conflict (project_id, stage) do update set
    project_area_m2 = excluded.project_area_m2,
    productivity_budget_m2 = excluded.productivity_budget_m2,
    allocated_productivity_m2 = 0;

  -- The last UUID receives the rounding remainder, so stage shares sum
  -- exactly to the budget even with three or more tasks.
  with shares as (
    select id, status, case when row_number() over (order by id) = eligible_count
      then stage_budget - base_share * (eligible_count - 1)
      else base_share end as area
    from public.tasks
    where project_id = p_project_id and stage = p_stage and status <> 'cancelled'
  )
  update public.productivity_attributions as attribution
  set credited_area_m2 = shares.area, task_stage = p_stage
  from shares
  where attribution.task_id = shares.id and attribution.source_type = 'task'
    and attribution.voided_at is null and shares.status = 'completed'
    and (attribution.credited_area_m2 is distinct from shares.area
      or attribution.task_stage is distinct from p_stage);

  update public.project_stage_productivity_budgets as budget
  set allocated_productivity_m2 = coalesce((
    select sum(attribution.credited_area_m2)
    from public.productivity_attributions as attribution
    join public.tasks as task on task.id = attribution.task_id
    where task.project_id = p_project_id and task.stage = p_stage
      and task.status = 'completed' and attribution.source_type = 'task'
      and attribution.voided_at is null
  ), 0)
  where budget.project_id = p_project_id and budget.stage = p_stage;
end;
$$;
revoke execute on function private.rebalance_stage_productivity(uuid, text)
from public, anon, authenticated;

create or replace function private.record_task_productivity_attribution()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  task_project public.projects%rowtype;
  contributor public.profiles%rowtype;
  snapshot_area numeric;
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    select * into task_project from public.projects where id = new.project_id;
    if task_project.id is null then raise exception 'Task project no longer exists'; end if;
    if new.assignee_id is null then return new; end if;

    if not private.is_project_progress_stage(new.stage) then
      snapshot_area := 0;
    elsif new.stage = 'stage_2' then
      snapshot_area := coalesce(new.productivity_area_m2, new.completed_area_m2, 0);
      if new.productivity_area_m2 is null then
        update public.tasks set productivity_area_m2 = snapshot_area where id = new.id;
      end if;
    else
      -- The roster trigger writes the current share after this ledger row exists.
      snapshot_area := 0;
    end if;

    if snapshot_area > 0 or
      (new.stage in ('stage_1', 'stage_3') and coalesce(task_project.total_area_m2, 0) > 0) then
      if not private.is_active_project_task_assignee(new.project_id, new.assignee_id) then
        raise exception 'Attributed task completion requires an active project-member assignee';
      end if;
    elsif not private.is_active_project_task_assignee(new.project_id, new.assignee_id) then
      return new;
    end if;
    select * into contributor from public.profiles where id = new.assignee_id;
    insert into public.productivity_attributions (
      studio_id, project_id, task_id, contributor_id, source_type, task_stage, credited_area_m2,
      completed_at, contributor_name, contributor_job_title
    ) values (
      task_project.studio_id, new.project_id, new.id, new.assignee_id, 'task', new.stage, snapshot_area,
      coalesce(new.completed_at::timestamp at time zone 'Europe/Kyiv', now()), contributor.full_name, contributor.job_title
    );
  elsif old.status = 'completed' and new.status is distinct from 'completed' then
    update public.productivity_attributions set voided_at = now()
    where task_id = old.id and source_type = 'task' and voided_at is null;
  end if;
  return new;
end;
$$;
revoke execute on function private.record_task_productivity_attribution()
from public, anon, authenticated;

create or replace function private.sync_stage_productivity_roster()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  moved_area numeric;
begin
  if tg_op = 'DELETE' then
    -- Keep the completion count, but deleted work has no current stage share.
    update public.productivity_attributions set credited_area_m2 = 0
    where task_id = old.id and source_type = 'task' and voided_at is null
      and task_stage in ('stage_1', 'stage_3');
    perform private.rebalance_stage_productivity(old.project_id, old.stage);
    return old;
  end if;

  if tg_op = 'UPDATE' and new.stage is distinct from old.stage then
    -- A task moved into another stage cannot carry its former stage snapshot.
    update public.tasks set productivity_area_m2 = null
    where id = new.id and productivity_area_m2 is not null;
    if new.status = 'completed' and new.stage not in ('stage_1', 'stage_3') then
      moved_area := case when new.stage = 'stage_2' then coalesce(new.completed_area_m2, 0) else 0 end;
      update public.productivity_attributions
      set task_stage = new.stage, credited_area_m2 = moved_area
      where task_id = new.id and source_type = 'task' and voided_at is null;
    end if;
    perform private.rebalance_stage_productivity(old.project_id, old.stage);
  end if;

  if tg_op = 'INSERT' or new.stage is distinct from old.stage
    or new.status is distinct from old.status then
    perform private.rebalance_stage_productivity(new.project_id, new.stage);
  end if;
  return new;
end;
$$;
revoke execute on function private.sync_stage_productivity_roster()
from public, anon, authenticated;

create trigger zz_sync_stage_productivity_roster
  after insert or update of stage, status or delete on public.tasks
  for each row execute function private.sync_stage_productivity_roster();

create or replace function private.sync_stage_productivity_project_area()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.rebalance_stage_productivity(new.id, 'stage_1');
  perform private.rebalance_stage_productivity(new.id, 'stage_3');
  return new;
end;
$$;
revoke execute on function private.sync_stage_productivity_project_area()
from public, anon, authenticated;
create trigger zz_sync_stage_productivity_project_area
  after update of total_area_m2 on public.projects
  for each row when (old.total_area_m2 is distinct from new.total_area_m2)
  execute function private.sync_stage_productivity_project_area();

-- Existing completed tasks moved out of Stage 1/3 follow their current
-- Stage 2 task area or Stage 4 count-only rule.
update public.productivity_attributions as attribution
set task_stage = task.stage,
  credited_area_m2 = case when task.stage = 'stage_2' then coalesce(task.completed_area_m2, 0) else 0 end
from public.tasks as task
where attribution.task_id = task.id and attribution.source_type = 'task'
  and attribution.voided_at is null and attribution.task_stage in ('stage_1', 'stage_3')
  and task.status = 'completed' and task.stage in ('stage_2', 'stage_4');

-- Previously deleted Stage 1/3 tasks cannot retain area under a current-roster model.
update public.productivity_attributions as attribution
set credited_area_m2 = 0
where attribution.source_type = 'task' and attribution.voided_at is null
  and attribution.task_stage in ('stage_1', 'stage_3')
  and exists (select 1 from public.projects where id = attribution.project_id)
  and not exists (
    select 1 from public.tasks as task where task.id = attribution.task_id
      and task.project_id = attribution.project_id and task.stage = attribution.task_stage
      and task.status = 'completed'
  );

do $$
declare roster record;
begin
  for roster in
    select project_id, stage from public.project_stage_productivity_budgets
    union
    select project_id, stage from public.tasks where stage in ('stage_1', 'stage_3')
  loop
    perform private.rebalance_stage_productivity(roster.project_id, roster.stage);
  end loop;
end;
$$;
