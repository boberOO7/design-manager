-- Use the studio date and working-day floor for live schedules.
create or replace function private.reflow_task_stage_schedule(p_project_id uuid, p_stage text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  scheduled_task record;
  required_start date;
  blocked boolean;
  next_start date;
  next_due date;
begin
  perform 1 from public.project_task_stage_columns
  where project_id=p_project_id and stage=p_stage for update;
  if exists (select 1 from public.project_task_stage_columns
    where project_id=p_project_id and stage=p_stage and schedule_paused_on is not null) then return; end if;

  for scheduled_task in
    select schedule.*, task.status
    from public.task_schedules schedule
    join public.tasks task on task.id=schedule.task_id
    where schedule.project_id=p_project_id and schedule.stage=p_stage
    order by schedule.sort_order
  loop
    if scheduled_task.status in ('completed','cancelled') then continue; end if;
    select max(private.schedule_add_workdays(
      case when predecessor_task.status='completed' then predecessor_task.completed_at
        when predecessor_task.status='cancelled' then predecessor.current_due
        else greatest(predecessor.current_due,private.schedule_workday_on_or_after((now() at time zone 'Europe/Kyiv')::date)) end, 1)),
      coalesce(bool_or(predecessor_task.status not in ('completed','cancelled')), false)
    into required_start, blocked
    from public.task_schedule_dependencies dependency
    join public.task_schedules predecessor on predecessor.task_id=dependency.predecessor_task_id
    join public.tasks predecessor_task on predecessor_task.id=predecessor.task_id
    where dependency.task_id=scheduled_task.task_id;

    next_start := greatest(scheduled_task.current_start, coalesce(required_start, scheduled_task.current_start));
    next_due := case when next_start > scheduled_task.current_start
      then private.schedule_add_workdays(scheduled_task.current_due,
        private.schedule_workdays_elapsed(scheduled_task.current_start, next_start))
      else scheduled_task.current_due end;
    if next_start is distinct from scheduled_task.current_start
      or next_due is distinct from scheduled_task.current_due
      or blocked is distinct from scheduled_task.is_blocked then
      update public.task_schedules set current_start=next_start, current_due=next_due, is_blocked=blocked
      where task_id=scheduled_task.task_id;
      update public.task_deadlines set due_date=next_due
      where task_id=scheduled_task.task_id and target_status='completed'
        and due_date is distinct from next_due;
    end if;
  end loop;
end;
$$;

create or replace function public.set_project_stage_schedule_paused(
  p_project_id uuid, p_stage text, p_paused boolean
) returns void language plpgsql security definer set search_path = '' as $$
declare project_studio_id uuid; project_status text; project_archived_at date;
  pause_started date; elapsed integer;
begin
  if p_stage not in ('stage_1','stage_2','stage_3','stage_4') or p_paused is null then
    raise exception 'Choose a valid stage pause action';
  end if;
  select studio_id,status,archived_at into project_studio_id,project_status,project_archived_at
  from public.projects where id=p_project_id for update;
  if project_studio_id is null or not coalesce(private.is_studio_admin(project_studio_id),false) then
    raise exception 'Only active studio administrators can pause stage schedules';
  end if;
  if project_archived_at is not null or project_status='archived'
    or (project_status='completed' and p_stage in ('stage_1','stage_2','stage_3')) then
    raise exception 'This project stage is read-only';
  end if;
  select schedule_paused_on into pause_started
  from public.project_task_stage_columns
  where project_id=p_project_id and stage=p_stage for update;
  if p_paused then
    if pause_started is not null then return; end if;
    update public.project_task_stage_columns set schedule_paused_on=(now() at time zone 'Europe/Kyiv')::date
    where project_id=p_project_id and stage=p_stage;
    update public.task_schedules schedule set is_paused=true
    from public.tasks task where task.id=schedule.task_id and task.status not in ('completed','cancelled')
      and schedule.project_id=p_project_id and schedule.stage=p_stage;
    return;
  end if;
  if pause_started is null then return; end if;
  elapsed := private.schedule_workdays_elapsed(pause_started,(now() at time zone 'Europe/Kyiv')::date);
  update public.project_task_stage_columns set schedule_paused_on=null
  where project_id=p_project_id and stage=p_stage;
  update public.task_schedules schedule set
    current_start=private.schedule_add_workdays(schedule.current_start,elapsed),
    current_due=private.schedule_add_workdays(schedule.current_due,elapsed),
    is_paused=false
  from public.tasks task where task.id=schedule.task_id and task.status not in ('completed','cancelled')
    and schedule.project_id=p_project_id and schedule.stage=p_stage;
  update public.task_deadlines deadline set due_date=schedule.current_due
  from public.task_schedules schedule
  join public.tasks task on task.id=schedule.task_id
  where deadline.task_id=schedule.task_id and deadline.target_status='completed'
    and schedule.project_id=p_project_id and schedule.stage=p_stage
    and task.status not in ('completed','cancelled')
    and deadline.due_date is distinct from schedule.current_due;
  perform private.reflow_task_stage_schedule(p_project_id,p_stage);
end;
$$;

-- Archived and completed projects retain their stored schedule history.
create or replace function public.refresh_project_task_schedules(p_project_ids uuid[])
returns void language plpgsql security definer set search_path = '' as $$
declare scheduled_project uuid; scheduled_stage text;
begin
  for scheduled_project in select distinct unnest(p_project_ids) loop
    if not coalesce(private.can_access_project(scheduled_project),false) then
      raise exception 'Project schedule is not accessible';
    end if;
    if exists (
      select 1 from public.projects
      where id=scheduled_project and archived_at is null
        and status not in ('archived','completed')
    ) then
      for scheduled_stage in
        select distinct stage from public.task_schedules
        where project_id=scheduled_project order by stage
      loop
        perform private.reflow_task_stage_schedule(scheduled_project,scheduled_stage);
      end loop;
    end if;
  end loop;
end;
$$;
