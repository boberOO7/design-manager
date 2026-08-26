-- Unassigned tasks are valid operational work. They can be completed without
-- creating productivity credit or reserving a Stage 1/3 productivity budget.
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

    -- There is no contributor to credit. Return before materializing a task
    -- snapshot so unassigned work cannot consume a productivity budget.
    if new.assignee_id is null then return new; end if;

    if (new.stage = 'stage_2' and coalesce(new.completed_area_m2, 0) > 0)
      or (new.stage in ('stage_1', 'stage_3') and coalesce(task_project.total_area_m2, 0) > 0) then
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

    if snapshot_area <= 0 then return new; end if;
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
