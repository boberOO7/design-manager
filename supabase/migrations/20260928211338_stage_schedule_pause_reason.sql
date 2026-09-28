alter table public.project_task_stage_columns
  add column schedule_pause_reason text
  check (schedule_pause_reason in ('waiting_for_client', 'internal_pause', 'other'));

drop function public.set_project_stage_schedule_paused(uuid,text,boolean);
create function public.set_project_stage_schedule_paused(
  p_project_id uuid, p_stage text, p_paused boolean, p_reason text default null
) returns void language plpgsql security definer set search_path = '' as $$
declare project_studio_id uuid; project_status text; project_archived_at date;
  pause_started date; elapsed integer;
begin
  if p_stage not in ('stage_1','stage_2','stage_3','stage_4') or p_paused is null
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
    or (project_status='completed' and p_stage in ('stage_1','stage_2','stage_3')) then
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
$$;
revoke execute on function public.set_project_stage_schedule_paused(uuid,text,boolean,text) from public,anon;
grant execute on function public.set_project_stage_schedule_paused(uuid,text,boolean,text) to authenticated;

-- A task that reaches its scheduling handoff no longer inherits the stage pause.
create or replace function private.reflow_task_schedule_after_completion()
returns trigger language plpgsql security definer set search_path = '' as $$
declare schedule_project uuid; schedule_stage text;
begin
  if old.status is not distinct from new.status and old.completed_at is not distinct from new.completed_at then return new; end if;
  select project_id,stage into schedule_project,schedule_stage
  from public.task_schedules where task_id=new.id;
  if schedule_project is not null then
    if new.status in ('internal_review','completed','cancelled') then
      update public.task_schedules set is_paused=false where task_id=new.id and is_paused;
    end if;
    perform private.reflow_task_stage_schedule(schedule_project,schedule_stage);
  end if;
  return new;
end;
$$;

update public.task_schedules schedule set is_paused=false
where is_paused and exists (
  select 1 from public.tasks task where task.id=schedule.task_id
    and (task.status in ('completed','cancelled') or exists (
      select 1 from public.task_status_periods period
      where period.task_id=task.id and period.status='internal_review'))
);
