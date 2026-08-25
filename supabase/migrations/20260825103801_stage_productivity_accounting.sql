-- Stage productivity is a completion-time ledger.  Task snapshots remain the
-- sole input to productivity_attributions; this table reserves the fixed Stage
-- 1/3 budget even when a completed task is later reopened or deleted.
alter table public.tasks
  add column productivity_area_m2 numeric null check (productivity_area_m2 >= 0);

create table public.project_stage_productivity_budgets (
  project_id uuid not null references public.projects(id) on delete cascade,
  stage text not null check (stage in ('stage_1', 'stage_3')),
  project_area_m2 numeric not null check (project_area_m2 >= 0),
  productivity_budget_m2 numeric not null check (productivity_budget_m2 >= 0),
  allocated_productivity_m2 numeric not null default 0 check (allocated_productivity_m2 >= 0 and allocated_productivity_m2 <= productivity_budget_m2),
  created_at timestamptz not null default now(),
  primary key (project_id, stage)
);

alter table public.project_stage_productivity_budgets enable row level security;
revoke all on table public.project_stage_productivity_budgets from anon, authenticated;
grant select on table public.project_stage_productivity_budgets to authenticated;
create policy "project_stage_productivity_budgets_select_for_project_members"
on public.project_stage_productivity_budgets for select to authenticated
using ((select private.can_access_project(project_id)));

-- This is the database-side productivity-domain configuration.  Display labels
-- are deliberately never used for allocation.
create or replace function private.productivity_stage_ratio(p_stage text)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case p_stage
    when 'stage_1' then 0.20::numeric
    when 'stage_3' then 0.80::numeric
    else 0::numeric
  end;
$$;
revoke execute on function private.productivity_stage_ratio(text) from public, anon, authenticated;

create or replace function private.record_task_productivity_attribution()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  task_project public.projects%rowtype;
  contributor public.profiles%rowtype;
  stage_budget public.project_stage_productivity_budgets%rowtype;
  snapshot_area numeric;
  remaining_tasks integer;
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    select * into task_project from public.projects where id = new.project_id;
    if task_project.id is null then
      raise exception 'Task project no longer exists';
    end if;

    -- Do this before materializing a snapshot: unassigned productive work must
    -- not reserve any Stage 1/3 budget without a matching attribution row.
    if (new.stage = 'stage_2' and coalesce(new.completed_area_m2, 0) > 0)
      or (new.stage in ('stage_1', 'stage_3') and coalesce(task_project.total_area_m2, 0) > 0) then
      if new.assignee_id is null then
        raise exception 'Productivity-bearing task completion requires an active project-member assignee';
      end if;
      select * into contributor from public.profiles where id = new.assignee_id;
      if contributor.id is null
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
    end if;

    snapshot_area := new.productivity_area_m2;

    if snapshot_area is null then
      if new.stage = 'stage_2' then
        snapshot_area := coalesce(new.completed_area_m2, 0);
      elsif new.stage in ('stage_1', 'stage_3') then
        -- The unique row and FOR UPDATE lock serialize completions in one stage.
        insert into public.project_stage_productivity_budgets (
          project_id, stage, project_area_m2, productivity_budget_m2
        )
        select new.project_id, new.stage, greatest(coalesce(project.total_area_m2, 0), 0),
          greatest(coalesce(project.total_area_m2, 0), 0) * private.productivity_stage_ratio(new.stage)
        from public.projects as project
        where project.id = new.project_id
        on conflict (project_id, stage) do nothing;

        select * into stage_budget
        from public.project_stage_productivity_budgets
        where project_id = new.project_id and stage = new.stage
        for update;

        select count(*) into remaining_tasks
        from public.tasks as task
        where task.project_id = new.project_id
          and task.stage = new.stage
          and task.status <> 'cancelled'
          and task.productivity_area_m2 is null;

        snapshot_area := case
          when remaining_tasks > 0 then greatest(stage_budget.productivity_budget_m2 - stage_budget.allocated_productivity_m2, 0) / remaining_tasks
          else 0
        end;

        update public.project_stage_productivity_budgets
        set allocated_productivity_m2 = allocated_productivity_m2 + snapshot_area
        where project_id = new.project_id and stage = new.stage;
      else
        snapshot_area := 0;
      end if;

      update public.tasks set productivity_area_m2 = snapshot_area where id = new.id;
    end if;

    if snapshot_area <= 0 or new.assignee_id is null then return new; end if;
    insert into public.productivity_attributions (
      studio_id, project_id, task_id, contributor_id, source_type, credited_area_m2,
      completed_at, contributor_name, contributor_job_title
    ) values (
      task_project.studio_id, new.project_id, new.id, new.assignee_id, 'task', snapshot_area,
      coalesce(new.completed_at::timestamp at time zone 'Europe/Kyiv', now()), contributor.full_name, contributor.job_title
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

-- Stage snapshots supersede whole-project fallback credit.  Preserve prior rows
-- for audit, but never create new fallback credit from a project transition.
create or replace function private.record_project_fallback_productivity_attribution()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'completed' and new.status is distinct from 'completed' then
    update public.productivity_attributions
      set voided_at = now()
      where project_id = old.id and source_type = 'project_fallback' and voided_at is null;
  end if;
  return new;
end;
$$;
revoke execute on function private.record_project_fallback_productivity_attribution() from public, anon, authenticated;

-- Deterministic backfill: completed tasks are processed by completion date,
-- creation time, and UUID. Every step divides the still-unallocated budget by
-- the currently eligible, unsnapshotted tasks, so completed historical work and
-- future work share one capped stage budget.
do $$
declare
  stage_row record;
  task_row record;
  stage_budget public.project_stage_productivity_budgets%rowtype;
  snapshot_area numeric;
  remaining_tasks integer;
begin
  update public.tasks
  set productivity_area_m2 = coalesce(completed_area_m2, 0)
  where status = 'completed'
    and stage = 'stage_2'
    and productivity_area_m2 is null;

  for stage_row in
    select distinct task.project_id, task.stage
    from public.tasks as task
    where task.status = 'completed' and task.stage in ('stage_1', 'stage_3')
  loop
    insert into public.project_stage_productivity_budgets (
      project_id, stage, project_area_m2, productivity_budget_m2
    )
    select stage_row.project_id, stage_row.stage, greatest(coalesce(project.total_area_m2, 0), 0),
      greatest(coalesce(project.total_area_m2, 0), 0) * private.productivity_stage_ratio(stage_row.stage)
    from public.projects as project where project.id = stage_row.project_id
    on conflict (project_id, stage) do nothing;

    for task_row in
      select task.id
      from public.tasks as task
      where task.project_id = stage_row.project_id
        and task.stage = stage_row.stage
        and task.status = 'completed'
        and task.productivity_area_m2 is null
      order by task.completed_at nulls last, task.created_at, task.id
    loop
      select * into stage_budget from public.project_stage_productivity_budgets
      where project_id = stage_row.project_id and stage = stage_row.stage
      for update;
      select count(*) into remaining_tasks from public.tasks as task
      where task.project_id = stage_row.project_id
        and task.stage = stage_row.stage
        and task.status <> 'cancelled'
        and task.productivity_area_m2 is null;
      snapshot_area := case when remaining_tasks > 0
        then greatest(stage_budget.productivity_budget_m2 - stage_budget.allocated_productivity_m2, 0) / remaining_tasks
        else 0 end;
      update public.tasks set productivity_area_m2 = snapshot_area where id = task_row.id;
      update public.project_stage_productivity_budgets
      set allocated_productivity_m2 = allocated_productivity_m2 + snapshot_area
      where project_id = stage_row.project_id and stage = stage_row.stage;
    end loop;
  end loop;

  update public.tasks
  set productivity_area_m2 = 0
  where status = 'completed' and stage = 'stage_4' and productivity_area_m2 is null;

  -- Existing current attribution rows adopt the new immutable task snapshot.
  update public.productivity_attributions as attribution
  set credited_area_m2 = task.productivity_area_m2
  from public.tasks as task
  where attribution.task_id = task.id
    and attribution.source_type = 'task'
    and attribution.voided_at is null
    and task.status = 'completed'
    and task.productivity_area_m2 > 0;

  update public.productivity_attributions as attribution
  set voided_at = now()
  from public.tasks as task
  where attribution.task_id = task.id
    and attribution.source_type = 'task'
    and attribution.voided_at is null
    and (task.status <> 'completed' or task.productivity_area_m2 = 0);

  -- Fallback is incompatible with fixed stage budgets; void active legacy rows
  -- without deleting their audit history.
  update public.productivity_attributions
  set voided_at = now()
  where source_type = 'project_fallback' and voided_at is null;

  insert into public.productivity_attributions (
    studio_id, project_id, task_id, contributor_id, source_type, credited_area_m2,
    completed_at, contributor_name, contributor_job_title
  )
  select project.studio_id, task.project_id, task.id, task.assignee_id, 'task', task.productivity_area_m2,
    coalesce(task.completed_at::timestamp at time zone 'Europe/Kyiv', task.created_at), profile.full_name, profile.job_title
  from public.tasks as task
  inner join public.projects as project on project.id = task.project_id
  inner join public.profiles as profile on profile.id = task.assignee_id and profile.is_active
  inner join public.project_members as member on member.project_id = task.project_id and member.user_id = task.assignee_id and member.is_active
  inner join public.studio_members as studio_member on studio_member.studio_id = project.studio_id and studio_member.user_id = task.assignee_id and studio_member.is_active
  where task.status = 'completed'
    and task.assignee_id is not null
    and task.productivity_area_m2 > 0
    and not exists (
      select 1 from public.productivity_attributions as attribution
      where attribution.task_id = task.id and attribution.source_type = 'task' and attribution.voided_at is null
    );
end;
$$;
