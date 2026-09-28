-- Keep existing stage settings writable while protecting schedule state.
grant update (progress_method) on public.project_task_stage_columns to authenticated;

-- A blocked successor cannot start until an unfinished predecessor can finish.
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
        else greatest(predecessor.current_due,current_date) end, 1)),
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

-- Keep blocked flags accurate when dependencies are added or removed.
create or replace function private.update_schedule_dependency_state()
returns trigger language plpgsql security definer set search_path = '' as $$
declare schedule_project uuid; schedule_stage text;
begin
  if tg_op = 'INSERT' then
    update public.task_schedules set is_blocked=true where task_id=new.task_id;
  else
    select project_id,stage into schedule_project,schedule_stage
    from public.task_schedules where task_id=old.task_id;
    if schedule_project is not null then
      perform private.reflow_task_stage_schedule(schedule_project,schedule_stage);
    end if;
  end if;
  return null;
end;
$$;
revoke execute on function private.update_schedule_dependency_state() from public,anon,authenticated;
create trigger update_schedule_dependency_state
  after insert or delete on public.task_schedule_dependencies
  for each row execute function private.update_schedule_dependency_state();

-- Reading a schedule advances blocked successors as calendar days pass.
create or replace function public.refresh_project_task_schedules(p_project_ids uuid[])
returns void language plpgsql security definer set search_path = '' as $$
declare scheduled_project uuid; scheduled_stage text;
begin
  for scheduled_project in select distinct unnest(p_project_ids) loop
    if not coalesce(private.can_access_project(scheduled_project),false) then
      raise exception 'Project schedule is not accessible';
    end if;
    for scheduled_stage in
      select distinct stage from public.task_schedules
      where project_id=scheduled_project order by stage
    loop
      perform private.reflow_task_stage_schedule(scheduled_project,scheduled_stage);
    end loop;
  end loop;
end;
$$;
revoke execute on function public.refresh_project_task_schedules(uuid[]) from public,anon;
grant execute on function public.refresh_project_task_schedules(uuid[]) to authenticated;

-- Reached review milestones are historical facts and never shift again.
create or replace function private.shift_scheduled_task_milestones()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.current_start <= old.current_start then return new; end if;
  update public.task_deadlines deadline
  set due_date=private.schedule_add_workdays(
    deadline.due_date,private.schedule_workdays_elapsed(old.current_start,new.current_start)
  )
  where deadline.task_id=new.task_id and deadline.target_status <> 'completed'
    and not exists (
      select 1 from public.task_deadline_completions completion
      where completion.task_id=deadline.task_id
        and completion.target_status=deadline.target_status
        and completion.voided_at is null
    );
  return new;
end;
$$;
